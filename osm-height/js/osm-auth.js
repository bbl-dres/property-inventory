/**
 * osm-auth.js — OAuth2 PKCE flow + OSM API upload
 */

var OSM_AUTH_URL = 'https://www.openstreetmap.org/oauth2/authorize';
var OSM_TOKEN_URL = 'https://www.openstreetmap.org/oauth2/token';
var OSM_API = 'https://api.openstreetmap.org/api/0.6';

var osmAccessToken = null;

function getRedirectUri() {
    return window.location.origin + window.location.pathname;
}

// PKCE helpers
function generateCodeVerifier() {
    var arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode.apply(null, arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
    var data = new TextEncoder().encode(verifier);
    var hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Start OAuth2 login flow. Saves state to sessionStorage before redirect.
 */
async function startOAuthLogin(clientId, resultGeoJSON, bboxStr) {
    if (!clientId) throw new Error('Client ID required');

    sessionStorage.setItem('osm_client_id', clientId);

    // Save workflow state
    if (resultGeoJSON) {
        sessionStorage.setItem('osm_elevation_result', JSON.stringify(resultGeoJSON));
        sessionStorage.setItem('osm_elevation_bbox', bboxStr || '');
    }

    var codeVerifier = generateCodeVerifier();
    var codeChallenge = await generateCodeChallenge(codeVerifier);
    var state = generateCodeVerifier();
    sessionStorage.setItem('osm_code_verifier', codeVerifier);
    sessionStorage.setItem('osm_oauth_state', state);

    var params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: getRedirectUri(),
        scope: 'read_prefs write_api',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: state,
    });
    window.location.href = OSM_AUTH_URL + '?' + params.toString();
}

/**
 * Handle OAuth2 callback. Returns { token, displayName } or null.
 */
async function handleOAuthCallback() {
    var params = new URLSearchParams(window.location.search);
    var code = params.get('code');
    var returnedState = params.get('state');
    if (!code) return null;

    var codeVerifier = sessionStorage.getItem('osm_code_verifier');
    var expectedState = sessionStorage.getItem('osm_oauth_state');
    if (!codeVerifier) return null;

    if (returnedState !== expectedState) {
        console.error('OAuth state mismatch');
        sessionStorage.removeItem('osm_code_verifier');
        sessionStorage.removeItem('osm_oauth_state');
        return null;
    }

    window.history.replaceState({}, '', window.location.pathname);
    sessionStorage.removeItem('osm_code_verifier');
    sessionStorage.removeItem('osm_oauth_state');

    var resp = await fetch(OSM_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: getRedirectUri(),
            client_id: sessionStorage.getItem('osm_client_id') || '',
            code_verifier: codeVerifier,
        }),
    });

    if (!resp.ok) {
        var errText = await resp.text();
        throw new Error('Token exchange failed: ' + resp.status + ' ' + errText);
    }

    var data = await resp.json();
    osmAccessToken = data.access_token;

    // Fetch user info
    var displayName = null;
    var userResp = await fetch(OSM_API + '/user/details.json', {
        headers: { 'Authorization': 'Bearer ' + osmAccessToken },
    });
    if (userResp.ok) {
        var userData = await userResp.json();
        displayName = userData.user.display_name;
    }

    return { token: osmAccessToken, displayName: displayName };
}

/**
 * Upload enriched buildings to OSM.
 * @param {object[]} features - GeoJSON features to upload
 * @param {function} onProgress - callback(current, total)
 * @param {function} onLog - callback(type, message)
 * @returns {{ updated: number, errors: number, changesetId: string }}
 */
async function uploadToOSM(features, onProgress, onLog, isAborted) {
    isAborted = isAborted || function() { return false; };
    if (!osmAccessToken) throw new Error('Not logged in');

    var auth = 'Bearer ' + osmAccessToken;

    // Filter uploadable
    var toUpload = features.filter(function(f) {
        var p = f.properties;
        if (!p['source:height'] || p.osm_type !== 'way') return false;
        if (p['_skip_reason']) return false;
        var h = parseFloat(p.height);
        return h >= 2 && h <= 60;
    });

    var parts = toUpload.filter(function(f) { return f.properties['_is_part']; }).length;
    var relations = features.filter(function(f) { return f.properties.osm_type === 'relation' && f.properties['source:height']; }).length;
    var preFiltered = features.length - toUpload.length;
    onLog('info', toUpload.length + ' ways to upload (' + (toUpload.length - parts) + ' buildings + ' + parts + ' building:part), ' + preFiltered + ' skipped' + (relations > 0 ? ' (' + relations + ' relations — upload not supported yet)' : ''));

    if (toUpload.length === 0) throw new Error('No buildings to upload');

    // Build lookups: osm_id → computed height, and set of improved IDs
    var heightByOsmId = {};
    var improvedIds = {};
    for (var i = 0; i < toUpload.length; i++) {
        heightByOsmId[toUpload[i].properties.osm_id] = toUpload[i].properties.height;
        if (toUpload[i].properties['_prev_height']) improvedIds[toUpload[i].properties.osm_id] = true;
    }

    var updated = 0, errors = 0, skippedAtUpload = 0, changesetId = null;

    try {
        // Step 1: Batch-fetch all ways in chunks of 500
        // GET /api/0.6/ways?ways=id1,id2,id3,...
        onLog('step', 'Fetching ' + toUpload.length + ' ways from OSM...');
        onProgress(0, 3);

        var allWayIds = toUpload.map(function(f) { return f.properties.osm_id; });
        var ways = []; // local — no global pollution
        var FETCH_BATCH = 500;

        for (var fi = 0; fi < allWayIds.length; fi += FETCH_BATCH) {
            var batchIds = allWayIds.slice(fi, fi + FETCH_BATCH);
            var batchResp = await fetch(OSM_API + '/ways?ways=' + batchIds.join(','), {
                headers: { 'Authorization': auth },
            });
            if (!batchResp.ok) {
                throw new Error('Failed to batch-fetch ways: ' + batchResp.status);
            }

            // Parse XML response per-batch (safe — no string concatenation)
            var parser = new DOMParser();
            var doc = parser.parseFromString(await batchResp.text(), 'text/xml');
            doc.querySelectorAll('way').forEach(function(wayEl) {
                var tags = {};
                var ndRefs = [];
                wayEl.querySelectorAll('tag').forEach(function(t) {
                    tags[t.getAttribute('k')] = t.getAttribute('v');
                });
                wayEl.querySelectorAll('nd').forEach(function(nd) {
                    ndRefs.push(parseInt(nd.getAttribute('ref')));
                });
                ways.push({
                    id: parseInt(wayEl.getAttribute('id')),
                    version: parseInt(wayEl.getAttribute('version')),
                    tags: tags,
                    nodes: ndRefs,
                });
            });

            onLog('info', 'Fetched ' + Math.min(fi + FETCH_BATCH, allWayIds.length) + '/' + allWayIds.length + ' ways');
        }
        onProgress(1, 3);

        // Step 2: Build OsmChange XML
        onLog('step', 'Building changeset...');

        var csBody = '<osm><changeset>' +
            '<tag k="comment" v="Add/update building heights from swisstopo DSM/DTM elevation models"/>' +
            '<tag k="source" v="swisstopo/swissALTI3D;swissSURFACE3D"/>' +
            '<tag k="created_by" v="osm-height (bbl-dres/property-inventory)"/>' +
            '</changeset></osm>';

        var csResp = await fetch(OSM_API + '/changeset/create', {
            method: 'PUT',
            headers: { 'Authorization': auth, 'Content-Type': 'text/xml' },
            body: csBody,
        });
        if (!csResp.ok) {
            throw new Error('Changeset failed: ' + csResp.status + ' ' + await csResp.text());
        }
        changesetId = (await csResp.text()).trim();
        onLog('info', 'Created changeset ' + changesetId);

        var osmChangeWays = [];
        skippedAtUpload = 0;
        for (var wi = 0; wi < ways.length; wi++) {
            var w = ways[wi];
            var computedHeight = heightByOsmId[w.id];
            if (!computedHeight) continue;

            // Safety re-check — allow improved building:part ways through
            // (they already have height in OSM, but we're updating it)
            if (!improvedIds[w.id] && (w.tags['height'] || w.tags['roof:height'])) {
                skippedAtUpload++;
                continue;
            }

            // Build way XML with existing data + new tags (no duplicates)
            var wayXml = '<way id="' + w.id + '" version="' + w.version + '" changeset="' + changesetId + '">';
            for (var ni = 0; ni < (w.nodes || []).length; ni++) {
                wayXml += '<nd ref="' + w.nodes[ni] + '"/>';
            }
            // Copy existing tags, replacing height/source:height with our values
            var newTags = {};
            for (var tk in w.tags) {
                if (tk !== 'height' && tk !== 'source:height') {
                    newTags[tk] = w.tags[tk];
                }
            }
            newTags['height'] = computedHeight;
            newTags['source:height'] = 'swisstopo/swissALTI3D;swissSURFACE3D';
            for (var ntk in newTags) {
                wayXml += '<tag k="' + escapeXml(ntk) + '" v="' + escapeXml(newTags[ntk]) + '"/>';
            }
            wayXml += '</way>';

            osmChangeWays.push(wayXml);
        }

        onLog('info', osmChangeWays.length + ' buildings to modify, ' + skippedAtUpload + ' skipped (edited since extraction)');
        onProgress(2, 3);

        if (osmChangeWays.length === 0) {
            onLog('step', 'Nothing to upload — all buildings were skipped.');
            return { updated: 0, errors: 0, changesetId: changesetId };
        }

        // Step 3: Upload OsmChange in batches — go full speed, back off on 429
        var BATCH_SIZE = 50;
        var BATCH_DELAY_MS = 0; // no proactive delay — let the server tell us when to slow down
        var MAX_RETRIES = 10;
        var MAX_PER_CHANGESET = 9000; // OSM limit is 10K, leave margin
        var elementsInChangeset = 0;
        var batches = [];
        for (var bi = 0; bi < osmChangeWays.length; bi += BATCH_SIZE) {
            batches.push(osmChangeWays.slice(bi, bi + BATCH_SIZE));
        }

        onLog('step', 'Uploading ' + osmChangeWays.length + ' buildings in ' + batches.length + ' batch(es)...');
        onLog('info', 'Uploading at full speed (batches of ' + BATCH_SIZE + ', backoff on rate limit)');

        for (var batchIdx = 0; batchIdx < batches.length; batchIdx++) {
            var batch = batches[batchIdx];

            // Abort check
            if (isAborted()) {
                onLog('info', 'Upload aborted by user after ' + updated + ' buildings');
                break;
            }

            // Split to new changeset if approaching OSM's 10K element limit
            if (elementsInChangeset + batch.length > MAX_PER_CHANGESET) {
                await fetch(OSM_API + '/changeset/' + changesetId + '/close', {
                    method: 'PUT', headers: { 'Authorization': auth },
                });
                var newCsResp = await fetch(OSM_API + '/changeset/create', {
                    method: 'PUT',
                    headers: { 'Authorization': auth, 'Content-Type': 'text/xml' },
                    body: csBody,
                });
                if (!newCsResp.ok) throw new Error('Failed to create new changeset: ' + newCsResp.status);
                changesetId = (await newCsResp.text()).trim();
                elementsInChangeset = 0;
                // Update changeset ID in remaining batch XMLs
                for (var rbi = batchIdx; rbi < batches.length; rbi++) {
                    batches[rbi] = batches[rbi].map(function(xml) {
                        return xml.replace(/changeset="[^"]*"/, 'changeset="' + changesetId + '"');
                    });
                }
                batch = batches[batchIdx]; // re-read after update
                onLog('info', 'New changeset ' + changesetId + ' (previous reached ' + MAX_PER_CHANGESET + ' element limit)');
            }

            var osmChangeXml = '<osmChange version="0.6">\n<modify>\n' +
                batch.join('\n') +
                '\n</modify>\n</osmChange>';

            // Retry loop for 429 rate limiting
            var success = false;
            for (var attempt = 0; attempt < MAX_RETRIES; attempt++) {
                var uploadResp = await fetch(OSM_API + '/changeset/' + changesetId + '/upload', {
                    method: 'POST',
                    headers: { 'Authorization': auth, 'Content-Type': 'text/xml' },
                    body: osmChangeXml,
                });

                if (uploadResp.ok) {
                    updated += batch.length;
                    elementsInChangeset += batch.length;
                    onLog('info', 'Batch ' + (batchIdx + 1) + '/' + batches.length + ': ' + batch.length + ' buildings uploaded');
                    success = true;
                    break;
                }

                var errStatus = uploadResp.status;
                var errText = await uploadResp.text();

                if (errStatus === 429) {
                    // Rate limited — wait longer each retry: 30s, 60s, 60s, 90s, 120s, 180s, 240s, 300s, 360s, 420s
                    var retryAfter = parseInt(uploadResp.headers.get('Retry-After') || '0');
                    var backoffTable = [30, 60, 60, 90, 120, 180, 240, 300, 360, 420];
                    var waitSec = retryAfter || backoffTable[Math.min(attempt, backoffTable.length - 1)];
                    var totalWaited = backoffTable.slice(0, attempt + 1).reduce(function(a, b) { return a + b; }, 0);
                    onLog('info', 'Rate limited — waiting ' + waitSec + 's (' + (attempt + 1) + '/' + MAX_RETRIES + ', total waited: ' + Math.round(totalWaited / 60) + 'min)');
                    await new Promise(function(r) { setTimeout(r, waitSec * 1000); });
                    // After rate limit hit, slow down future batches significantly
                    BATCH_DELAY_MS = Math.min(BATCH_DELAY_MS + 3000, 15000);
                    continue;
                }

                if (errStatus === 409) {
                    onLog('error', 'Version conflict: ' + errText.substring(0, 200));
                    onLog('info', batch.length + ' buildings skipped (edited since extraction)');
                    errors += batch.length;
                    success = true; // don't retry conflicts
                    break;
                }

                // Other errors — don't retry
                onLog('error', 'Upload failed (' + errStatus + '): ' + errText.substring(0, 200));
                errors += batch.length;
                success = true; // mark as handled
                break;
            }

            if (!success) {
                // Current batch failed after all retries (429 rate limiting)
                errors += batch.length;
                // Count remaining batches as errors too (we're giving up)
                var remaining = 0;
                for (var ri = batchIdx + 1; ri < batches.length; ri++) remaining += batches[ri].length;
                if (remaining > 0) errors += remaining;
                onLog('error', 'Batch ' + (batchIdx + 1) + ' failed after ' + MAX_RETRIES + ' retries — ' + (remaining > 0 ? remaining + ' buildings in remaining batches skipped' : 'no remaining batches'));
                break;
            }

            onProgress(batchIdx + 1, batches.length);

            // Pause between batches to stay under rate limits
            if (batchIdx < batches.length - 1) {
                await new Promise(function(r) { setTimeout(r, BATCH_DELAY_MS); });
            }
        }

        if (skippedAtUpload > 0) onLog('info', 'Skipped at upload (edited since extraction): ' + skippedAtUpload);
        if (changesetId) {
            onLog('info', 'Changeset: https://www.openstreetmap.org/changeset/' + changesetId);
        }

    } catch (e) {
        onLog('error', 'Upload failed: ' + e.message);
    } finally {
        if (changesetId) {
            try {
                await fetch(OSM_API + '/changeset/' + changesetId + '/close', {
                    method: 'PUT', headers: { 'Authorization': auth },
                });
            } catch (e) { /* best effort */ }
        }
    }

    return { updated: updated, errors: errors, changesetId: changesetId };
}

function escapeXml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function osmLogout() {
    osmAccessToken = null;
}

function isOsmLoggedIn() {
    return !!osmAccessToken;
}
