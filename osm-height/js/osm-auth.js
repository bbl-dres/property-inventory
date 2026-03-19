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
async function uploadToOSM(features, onProgress, onLog) {
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

    var preFiltered = features.length - toUpload.length;
    onLog('info', 'Pre-filtered: ' + toUpload.length + ' to upload, ' + preFiltered + ' skipped');

    if (toUpload.length === 0) throw new Error('No buildings to upload');

    // Build lookup: osm_id → computed height
    var heightByOsmId = {};
    for (var i = 0; i < toUpload.length; i++) {
        heightByOsmId[toUpload[i].properties.osm_id] = toUpload[i].properties.height;
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
            '<tag k="comment" v="Add building heights from swisstopo DSM/DTM elevation models"/>' +
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
        var skippedAtUpload = 0;
        for (var wi = 0; wi < ways.length; wi++) {
            var w = ways[wi];
            var computedHeight = heightByOsmId[w.id];
            if (!computedHeight) continue;

            // Safety re-check
            if (w.tags['height'] || w.tags['roof:height']) {
                skippedAtUpload++;
                continue;
            }

            // Build way XML with all existing data + new tags
            var wayXml = '<way id="' + w.id + '" version="' + w.version + '" changeset="' + changesetId + '">';
            for (var ni = 0; ni < (w.nodes || []).length; ni++) {
                wayXml += '<nd ref="' + w.nodes[ni] + '"/>';
            }
            for (var tk in w.tags) {
                wayXml += '<tag k="' + escapeXml(tk) + '" v="' + escapeXml(w.tags[tk]) + '"/>';
            }
            // Add new tags
            wayXml += '<tag k="height" v="' + escapeXml(computedHeight) + '"/>';
            wayXml += '<tag k="source:height" v="swisstopo/swissALTI3D;swissSURFACE3D"/>';
            wayXml += '</way>';

            osmChangeWays.push(wayXml);
        }

        onLog('info', osmChangeWays.length + ' buildings to modify, ' + skippedAtUpload + ' skipped (edited since extraction)');
        onProgress(2, 3);

        if (osmChangeWays.length === 0) {
            onLog('step', 'Nothing to upload — all buildings were skipped.');
            return { updated: 0, errors: 0, changesetId: changesetId };
        }

        // Step 3: Upload OsmChange in batches (max 10,000 per changeset)
        var MAX_CHANGESET_SIZE = 9000; // leave margin below OSM's 10,000 limit
        var batches = [];
        for (var bi = 0; bi < osmChangeWays.length; bi += MAX_CHANGESET_SIZE) {
            batches.push(osmChangeWays.slice(bi, bi + MAX_CHANGESET_SIZE));
        }

        onLog('step', 'Uploading ' + osmChangeWays.length + ' buildings in ' + batches.length + ' batch(es)...');

        for (var batchIdx = 0; batchIdx < batches.length; batchIdx++) {
            var batch = batches[batchIdx];

            // For subsequent batches, create a new changeset
            if (batchIdx > 0) {
                // Close previous changeset
                await fetch(OSM_API + '/changeset/' + changesetId + '/close', {
                    method: 'PUT', headers: { 'Authorization': auth },
                });
                var newCsResp = await fetch(OSM_API + '/changeset/create', {
                    method: 'PUT',
                    headers: { 'Authorization': auth, 'Content-Type': 'text/xml' },
                    body: csBody,
                });
                if (!newCsResp.ok) throw new Error('Failed to create new changeset');
                changesetId = (await newCsResp.text()).trim();
                // Update changeset ID in batch XML
                batch = batch.map(function(xml) {
                    return xml.replace(/changeset="[^"]*"/, 'changeset="' + changesetId + '"');
                });
                onLog('info', 'Created new changeset ' + changesetId + ' for batch ' + (batchIdx + 1));
            }

            var osmChangeXml = '<osmChange version="0.6">\n<modify>\n' +
                batch.join('\n') +
                '\n</modify>\n</osmChange>';

            var uploadResp = await fetch(OSM_API + '/changeset/' + changesetId + '/upload', {
                method: 'POST',
                headers: { 'Authorization': auth, 'Content-Type': 'text/xml' },
                body: osmChangeXml,
            });

            if (uploadResp.ok) {
                updated += batch.length;
                onLog('info', 'Batch ' + (batchIdx + 1) + '/' + batches.length + ': ' + batch.length + ' buildings uploaded');
            } else {
                var errStatus = uploadResp.status;
                var errText = await uploadResp.text();

                if (errStatus === 409) {
                    // Version conflict — identify and log conflicting element
                    onLog('error', 'Version conflict: ' + errText.substring(0, 200));
                    onLog('info', 'Some buildings were edited since extraction. ' + batch.length + ' buildings in this batch were not uploaded.');
                    errors += batch.length;
                } else {
                    onLog('error', 'Upload failed (' + errStatus + '): ' + errText.substring(0, 200));
                    errors += batch.length;
                }
            }

            onProgress(batchIdx + 1, batches.length);
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
