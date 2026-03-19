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
        scope: 'write_api',
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
        var h = parseFloat(p.height);
        return h >= 2 && h <= 60;
    });

    if (toUpload.length === 0) throw new Error('No buildings to upload');

    var updated = 0, errors = 0, changesetId = null;

    try {
        // Create changeset
        var csBody = '<osm><changeset>' +
            '<tag k="comment" v="Add building heights from swisstopo DSM/DTM elevation models"/>' +
            '<tag k="source" v="swisstopo/swissALTI3D;swissSURFACE3D"/>' +
            '<tag k="created_by" v="osm_elevation_browser"/>' +
            '</changeset></osm>';

        var csResp = await fetch(OSM_API + '/changeset/create', {
            method: 'PUT',
            headers: { 'Authorization': auth, 'Content-Type': 'text/xml' },
            body: csBody,
        });
        if (!csResp.ok) {
            var errText = await csResp.text();
            throw new Error('Changeset failed: ' + csResp.status + ' ' + errText);
        }
        changesetId = (await csResp.text()).trim();
        onLog('step', 'Created changeset ' + changesetId);

        for (var i = 0; i < toUpload.length; i++) {
            var props = toUpload[i].properties;
            var osmId = props.osm_id;
            onProgress(i + 1, toUpload.length);

            try {
                var wayResp = await fetch(OSM_API + '/way/' + osmId, { headers: { 'Authorization': auth } });
                if (!wayResp.ok) { errors++; continue; }

                var parser = new DOMParser();
                var doc = parser.parseFromString(await wayResp.text(), 'text/xml');
                var way = doc.querySelector('way');
                if (!way) { errors++; continue; }

                // Safety re-check
                var existingTags = {};
                way.querySelectorAll('tag').forEach(function(t) {
                    existingTags[t.getAttribute('k')] = t.getAttribute('v');
                });
                if (existingTags['height']) { onLog('info', 'way/' + osmId + ': already has height, skipping'); continue; }
                var hasRoof = Object.keys(existingTags).some(function(k) { return k.indexOf('roof:') === 0; });
                if (hasRoof) { onLog('info', 'way/' + osmId + ': has roof tags, skipping'); continue; }

                // Add tags
                var heightTag = doc.createElement('tag');
                heightTag.setAttribute('k', 'height');
                heightTag.setAttribute('v', props.height);
                way.appendChild(heightTag);

                var sourceTag = doc.createElement('tag');
                sourceTag.setAttribute('k', 'source:height');
                sourceTag.setAttribute('v', 'swisstopo/swissALTI3D;swissSURFACE3D');
                way.appendChild(sourceTag);

                way.setAttribute('changeset', changesetId);

                var updateResp = await fetch(OSM_API + '/way/' + osmId, {
                    method: 'PUT',
                    headers: { 'Authorization': auth, 'Content-Type': 'text/xml' },
                    body: '<osm>' + new XMLSerializer().serializeToString(way) + '</osm>',
                });

                if (updateResp.ok) {
                    updated++;
                } else {
                    onLog('error', 'way/' + osmId + ': ' + await updateResp.text());
                    errors++;
                }

                await new Promise(function(r) { setTimeout(r, 100); }); // rate limit
            } catch (e) {
                onLog('error', 'way/' + osmId + ': ' + e.message);
                errors++;
                if (errors >= 10) { onLog('error', 'Too many errors, stopping'); break; }
            }
        }

        onLog('step', 'Upload complete: ' + updated + ' updated, ' + errors + ' errors');
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

function osmLogout() {
    osmAccessToken = null;
}

function isOsmLoggedIn() {
    return !!osmAccessToken;
}
