/**
 * pipeline.js — Core height computation pipeline
 *
 * Handles: coordinate transforms, COG tile reading, grid creation,
 * elevation sampling, height computation, and Overpass extraction.
 */

// =============================================
// LV95 projection
// =============================================
proj4.defs('EPSG:2056', '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');

function toLV95(lon, lat) {
    return proj4('EPSG:4326', 'EPSG:2056', [lon, lat]);
}

// =============================================
// COG tile management
// =============================================
const ALTI3D_URL = 'https://data.geo.admin.ch/ch.swisstopo.swissalti3d/swissalti3d_{year}_{tile}/swissalti3d_{year}_{tile}_0.5_2056_5728.tif';
const SURFACE3D_URL = 'https://data.geo.admin.ch/ch.swisstopo.swisssurface3d-raster/swisssurface3d-raster_{year}_{tile}/swisssurface3d-raster_{year}_{tile}_0.5_2056_5728.tif';
const YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];

// Caches
const tileDataCache = new Map();    // datasetKey:tileId -> { data: Float32Array, width, height, ox, oy, rx, ry }
const yearHints = { dtm: {}, dsm: {} };
const failedTiles = new Set();

function tileIdFromLV95(x, y) {
    return Math.floor(x / 1000) + '-' + Math.floor(y / 1000);
}

/**
 * Open a COG tile and read the ENTIRE raster into memory.
 * Returns { data, width, height, ox, oy, rx, ry } or null.
 * Subsequent calls for the same tile return from cache instantly.
 */
async function getTileData(urlTemplate, tileId) {
    var datasetKey = urlTemplate.includes('swissalti3d') ? 'dtm' : 'dsm';
    var cacheKey = datasetKey + ':' + tileId;

    // Check data cache first (full tile in memory)
    if (tileDataCache.has(cacheKey)) return tileDataCache.get(cacheKey);
    if (failedTiles.has(cacheKey)) return null;

    // Try to open the COG
    var hint = yearHints[datasetKey][tileId];
    var yearsToTry = hint ? [hint, ...YEARS.filter(function(y) { return y !== hint; })] : YEARS;

    for (var yi = 0; yi < yearsToTry.length; yi++) {
        var year = yearsToTry[yi];
        var url = urlTemplate.replace(/{year}/g, year).replace(/{tile}/g, tileId);
        try {
            var tiff = await GeoTIFF.fromUrl(url, { allowFullFile: false });
            var image = await tiff.getImage();

            // Read ENTIRE tile into memory (1 HTTP range request for the full raster)
            var rasters = await image.readRasters();
            var origin = image.getOrigin();
            var resolution = image.getResolution();

            var tileData = {
                data: rasters[0],
                width: image.getWidth(),
                height: image.getHeight(),
                ox: origin[0],
                oy: origin[1],
                rx: resolution[0],
                ry: resolution[1],
            };

            tileDataCache.set(cacheKey, tileData);
            yearHints[datasetKey][tileId] = year;
            return tileData;
        } catch (e) {
            continue;
        }
    }

    failedTiles.add(cacheKey);
    return null;
}

/**
 * Sample elevation at a single LV95 point from a cached tile.
 */
function sampleFromTileData(tileData, x, y) {
    var col = Math.floor((x - tileData.ox) / tileData.rx);
    var row = Math.floor((y - tileData.oy) / tileData.ry);
    if (col < 0 || row < 0 || col >= tileData.width || row >= tileData.height) return null;
    var val = tileData.data[row * tileData.width + col];
    if (val === undefined || isNaN(val) || val < -100) return null;
    return val;
}

/**
 * Pre-load all tiles needed for a set of LV95 points.
 * Loads DTM and DSM tiles in parallel.
 */
async function preloadTiles(pointsLV95, onLog, onProgress) {
    var tileIds = new Set();
    for (var i = 0; i < pointsLV95.length; i++) {
        tileIds.add(tileIdFromLV95(pointsLV95[i][0], pointsLV95[i][1]));
    }

    var loaded = 0;
    var promises = [];
    tileIds.forEach(function(tileId) {
        var dtmKey = 'dtm:' + tileId;
        var dsmKey = 'dsm:' + tileId;
        if (!tileDataCache.has(dtmKey) && !failedTiles.has(dtmKey)) {
            promises.push(
                getTileData(ALTI3D_URL, tileId).then(function(r) {
                    loaded++;
                    if (r && onLog) onLog('Loaded DTM tile ' + tileId);
                    if (onProgress) onProgress(loaded, promises.length);
                })
            );
        }
        if (!tileDataCache.has(dsmKey) && !failedTiles.has(dsmKey)) {
            promises.push(
                getTileData(SURFACE3D_URL, tileId).then(function(r) {
                    loaded++;
                    if (r && onLog) onLog('Loaded DSM tile ' + tileId);
                    if (onProgress) onProgress(loaded, promises.length);
                })
            );
        }
    });

    if (promises.length > 0) {
        if (onLog) onLog('Loading ' + promises.length + ' elevation tiles...');
        // Load up to 4 tiles in parallel
        for (var j = 0; j < promises.length; j += 4) {
            await Promise.all(promises.slice(j, j + 4));
        }
    }
}

// =============================================
// Grid creation
// =============================================
function pointInPolygon(x, y, polygon) {
    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        var xi = polygon[i][0], yi = polygon[i][1];
        var xj = polygon[j][0], yj = polygon[j][1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

function createGridPoints(coordsLV95, spacing) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < coordsLV95.length; i++) {
        var x = coordsLV95[i][0], y = coordsLV95[i][1];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }

    var points = [];

    for (var gx = minX + spacing / 2; gx < maxX; gx += spacing) {
        for (var gy = minY + spacing / 2; gy < maxY; gy += spacing) {
            if (pointInPolygon(gx, gy, coordsLV95)) {
                points.push([gx, gy]);
            }
        }
    }

    if (points.length === 0) {
        var cx = 0, cy = 0;
        for (var k = 0; k < coordsLV95.length; k++) { cx += coordsLV95[k][0]; cy += coordsLV95[k][1]; }
        points.push([cx / coordsLV95.length, cy / coordsLV95.length]);
    }
    return points;
}

// =============================================
// Polygon area (Shoelace formula on LV95 coords → m²)
// =============================================
function polygonAreaLV95(lv95Ring) {
    var area = 0;
    for (var i = 0, j = lv95Ring.length - 1; i < lv95Ring.length; j = i++) {
        area += lv95Ring[j][0] * lv95Ring[i][1];
        area -= lv95Ring[i][0] * lv95Ring[j][1];
    }
    return Math.abs(area) / 2;
}

// =============================================
// Height computation
// =============================================

/**
 * Compute height for a single building. All tile data must be pre-loaded.
 * This is a synchronous CPU-only operation — no HTTP requests.
 */
function computeBuildingHeightSync(feature) {
    var coords = feature.geometry.coordinates[0];
    var lv95Coords = coords.map(function(c) { return toLV95(c[0], c[1]); });

    var gridPoints = createGridPoints(lv95Coords, 2);

    var heights = [];
    var minDTM = Infinity, maxDSM = -Infinity;

    for (var i = 0; i < gridPoints.length; i++) {
        var x = gridPoints[i][0], y = gridPoints[i][1];
        var tileId = tileIdFromLV95(x, y);

        var dtmTile = tileDataCache.get('dtm:' + tileId);
        var dsmTile = tileDataCache.get('dsm:' + tileId);
        if (!dtmTile || !dsmTile) continue;

        var dtm = sampleFromTileData(dtmTile, x, y);
        var dsm = sampleFromTileData(dsmTile, x, y);
        if (dtm !== null && dsm !== null) {
            var h = dsm - dtm;
            if (h > 0) {
                heights.push(h);
                if (dtm < minDTM) minDTM = dtm;
                if (dsm > maxDSM) maxDSM = dsm;
            }
        }
    }

    if (heights.length === 0) return null;

    // Use 95th percentile to filter outliers (chimneys, antennas, overhanging trees)
    var sorted = heights.slice().sort(function(a, b) { return a - b; });
    var p95idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
    var height_p95 = sorted[p95idx];

    return {
        height: Math.round(height_p95 * 10) / 10,
        height_max: Math.round(sorted[sorted.length - 1] * 10) / 10,
        height_mean: Math.round((heights.reduce(function(a, b) { return a + b; }, 0) / heights.length) * 10) / 10,
        elevation_ground: Math.round(minDTM * 10) / 10,
        elevation_roof: Math.round(maxDSM * 10) / 10,
        sample_points: heights.length,
        lv95Ring: lv95Coords,
    };
}

// =============================================
// Extraction helpers
// =============================================
function ensureRingClosed(coords) {
    if (coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
        coords.push(coords[0]);
    }
}

function copyTags(source, target, keys) {
    for (var i = 0; i < keys.length; i++) {
        if (source[keys[i]]) target[keys[i]] = source[keys[i]];
    }
}

// =============================================
// Overpass extraction
// =============================================
var OVERPASS_URL = 'https://overpass.osm.ch/api/interpreter';

async function extractBuildings(bbox, onLog) {
    var west = bbox[0], south = bbox[1], east = bbox[2], north = bbox[3];
    var query = '[out:json][timeout:180];(way["building"](' + south + ',' + west + ',' + north + ',' + east + ');way["building:part"](' + south + ',' + west + ',' + north + ',' + east + ');relation["building"](' + south + ',' + west + ',' + north + ',' + east + '););out body;>;out skel qt;';

    if (onLog) onLog('Extracting OSM buildings...');
    var resp = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!resp.ok) throw new Error('Overpass API error: ' + resp.status);
    var data = await resp.json();
    if (!data.elements || !Array.isArray(data.elements)) {
        throw new Error('Invalid Overpass response');
    }

    var nodes = {};
    for (var i = 0; i < data.elements.length; i++) {
        var el = data.elements[i];
        if (el.type === 'node') nodes[el.id] = [el.lon, el.lat];
    }

    var features = [];
    var tagsToCopy = ['height', 'source:height', 'building:levels', 'min_height', 'roof:height', 'roof:shape', 'roof:levels', 'roof:colour', 'roof:material', 'name', 'addr:street', 'addr:housenumber', 'building:part'];

    // Build ways lookup for relation member resolution
    var waysById = {};
    // Detect buildings that have building:part ways (shared nodes)
    var buildingNodeSets = {}; // wayId → Set of node IDs (for building outlines)
    var partNodeIds = new Set(); // all node IDs used by building:part ways

    // First pass: collect node IDs for buildings and parts
    for (var jp = 0; jp < data.elements.length; jp++) {
        var elp = data.elements[jp];
        if (elp.type !== 'way' || !elp.tags || !elp.nodes) continue;
        if (elp.tags.building) {
            var ns = new Set();
            for (var np = 0; np < elp.nodes.length; np++) ns.add(elp.nodes[np]);
            buildingNodeSets[elp.id] = ns;
        }
        if (elp.tags['building:part'] && !elp.tags.building) {
            for (var np2 = 0; np2 < elp.nodes.length; np2++) partNodeIds.add(elp.nodes[np2]);
        }
    }
    // Mark building outlines that share nodes with building:part ways
    var buildingsWithParts = {};
    for (var bwId in buildingNodeSets) {
        var bns = buildingNodeSets[bwId];
        bns.forEach(function(nid) {
            if (partNodeIds.has(nid)) buildingsWithParts[bwId] = true;
        });
    }

    for (var j = 0; j < data.elements.length; j++) {
        var el2 = data.elements[j];
        if (el2.type === 'way') waysById[el2.id] = el2;

        if (el2.type !== 'way' || !el2.tags || (!el2.tags.building && !el2.tags['building:part'])) continue;
        var coords = [];
        for (var n = 0; n < (el2.nodes || []).length; n++) {
            var node = nodes[el2.nodes[n]];
            if (node) coords.push(node);
        }
        if (coords.length < 4) continue;
        ensureRingClosed(coords);

        var isBuildingPart = !el2.tags.building && !!el2.tags['building:part'];
        var props = { osm_id: el2.id, osm_type: 'way', building: el2.tags.building || 'yes' };
        if (isBuildingPart) {
            props['_is_part'] = true;
            props['building:part'] = el2.tags['building:part'];
        }
        if (!isBuildingPart && buildingsWithParts[el2.id]) props['_has_parts'] = true;
        copyTags(el2.tags, props, tagsToCopy);

        features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [coords] },
            properties: props,
        });
    }

    // Parse relation buildings (join outer ring segments for height computation)
    for (var rj = 0; rj < data.elements.length; rj++) {
        var rel = data.elements[rj];
        if (rel.type !== 'relation' || !rel.tags || !rel.tags.building) continue;

        // Collect all outer member way segments
        var outerSegments = [];
        for (var mi = 0; mi < (rel.members || []).length; mi++) {
            var member = rel.members[mi];
            if (member.type === 'way' && member.role === 'outer') {
                var outerWay = waysById[member.ref];
                if (!outerWay || !outerWay.nodes || outerWay.nodes.length < 2) continue;
                var seg = [];
                for (var rn = 0; rn < outerWay.nodes.length; rn++) {
                    var rnode = nodes[outerWay.nodes[rn]];
                    if (rnode) seg.push(rnode);
                }
                if (seg.length >= 2) outerSegments.push(seg);
            }
        }
        if (outerSegments.length === 0) continue;

        // Join segments end-to-end into a closed ring
        var outerCoords;
        if (outerSegments.length === 1) {
            outerCoords = outerSegments[0];
        } else {
            // Greedy join: start with first segment, append matching segments
            outerCoords = outerSegments[0].slice();
            var used = [true];
            for (var si = 1; si < outerSegments.length; si++) used.push(false);
            for (var attempt = 0; attempt < outerSegments.length; attempt++) {
                var found = false;
                var tail = outerCoords[outerCoords.length - 1];
                for (var sj = 0; sj < outerSegments.length; sj++) {
                    if (used[sj]) continue;
                    var s = outerSegments[sj];
                    if (s[0][0] === tail[0] && s[0][1] === tail[1]) {
                        // Segment starts where ring ends — append (skip shared node)
                        for (var sk = 1; sk < s.length; sk++) outerCoords.push(s[sk]);
                        used[sj] = true; found = true; break;
                    } else if (s[s.length - 1][0] === tail[0] && s[s.length - 1][1] === tail[1]) {
                        // Segment ends where ring ends — append reversed (skip shared node)
                        for (var sk2 = s.length - 2; sk2 >= 0; sk2--) outerCoords.push(s[sk2]);
                        used[sj] = true; found = true; break;
                    }
                }
                if (!found) break;
            }
        }
        if (outerCoords.length < 4) continue;
        ensureRingClosed(outerCoords);
        if (outerCoords.length < 4) continue;

        var rprops = { osm_id: rel.id, osm_type: 'relation', building: rel.tags.building || 'yes' };
        copyTags(rel.tags, rprops, tagsToCopy);

        features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [outerCoords] },
            properties: rprops,
        });
    }

    return { type: 'FeatureCollection', features: features };
}

// =============================================
// Main pipeline
// =============================================

/**
 * Run the full enrichment pipeline.
 * @param {number[]} bbox - [west, south, east, north]
 * @param {object} callbacks - { onStep, onProgress, onLog, onError, onDone, isAborted }
 */
async function runPipeline(bbox, callbacks) {
    var onStep = callbacks.onStep || function() {};
    var onProgress = callbacks.onProgress || function() {};
    var onLog = callbacks.onLog || function() {};
    var onError = callbacks.onError || function() {};
    var onDone = callbacks.onDone || function() {};
    var isAborted = callbacks.isAborted || function() { return false; };

    var startTime = Date.now();

    // Step 1: Extract buildings
    onStep('Extracting OSM buildings...');
    var geojson;
    try {
        geojson = await extractBuildings(bbox, onLog);
    } catch (e) {
        onError('Extraction failed: ' + e.message);
        return null;
    }

    var total = geojson.features.length;
    var totalParts = geojson.features.filter(function(f) { return f.properties['_is_part']; }).length;
    var totalBuildings = total - totalParts;
    var withHeight = geojson.features.filter(function(f) { return f.properties.height; }).length;
    onLog('Extracted ' + totalBuildings + ' buildings + ' + totalParts + ' building:part ways (' + withHeight + ' already have height)');

    if (total === 0) {
        onError('No buildings found in selected area');
        return null;
    }

    // Step 2: Pre-load all needed tiles
    onStep('Loading elevation tiles...');
    var allLV95Points = [];
    for (var i = 0; i < total; i++) {
        var coords = geojson.features[i].geometry.coordinates[0];
        // Just use first/last vertex to determine needed tiles (fast approximation)
        for (var c = 0; c < coords.length; c++) {
            allLV95Points.push(toLV95(coords[c][0], coords[c][1]));
        }
    }
    await preloadTiles(allLV95Points, onLog, function(cur, tot) {
        onProgress(cur, tot * 2); // tile loading = 0–50%
    });

    if (isAborted()) {
        onLog('Aborted by user during tile loading');
        return null;
    }

    // Step 3: Compute heights (synchronous per building — tiles are in memory)
    onStep('Computing building heights...');
    var enriched = 0, skipped = 0, alreadyHad = 0, improved = 0;

    for (var b = 0; b < total; b++) {
        if (b % 50 === 0 || b === total - 1) {
            onProgress(total + b + 1, total * 2); // height computation = 50–100%
            await new Promise(function(r) { setTimeout(r, 0); }); // yield to UI
            if (isAborted()) {
                onLog('Aborted by user at ' + b + '/' + total + ' buildings');
                return null;
            }
        }

        var feature = geojson.features[b];
        var props = feature.properties;
        var isPart = !!props['_is_part'];
        var existingHeight = props.height ? parseFloat(props.height) : null;

        // Compute footprint area for all features (used in table + tree canopy filter)
        var fcoords0 = feature.geometry.coordinates[0];
        if (fcoords0 && fcoords0.length >= 4) {
            var areaRing = fcoords0.map(function(c) { return toLV95(c[0], c[1]); });
            props['_area'] = Math.round(polygonAreaLV95(areaRing));
        }

        // For building:part with existing height — don't skip, we'll compare later.
        // For regular buildings with existing height — skip (don't override).
        if (existingHeight !== null && !isPart) {
            props['_skip_reason'] = 'has_height'; alreadyHad++; continue;
        }

        // Skip building outlines that have building:part sub-polygons.
        // The parts get their own heights; enriching the outline would produce
        // an averaged height that conflicts with per-part heights in 3D rendering.
        if (props['_has_parts']) {
            props['_skip_reason'] = 'has_parts'; skipped++; continue;
        }

        // Only skip buildings where someone already measured roof height precisely.
        // roof:shape alone is fine — adding height actually helps the 3D renderer.
        // roof:height means someone measured carefully — don't override with DSM estimate.
        if (props['roof:height']) { props['_skip_reason'] = 'roof'; skipped++; continue; }

        var fcoords = feature.geometry.coordinates;
        // Skip multipolygons (holes — grid might sample open courtyard)
        if (fcoords.length > 1) { props['_skip_reason'] = 'complex'; skipped++; continue; }
        // Skip invalid geometry (too few vertices)
        if (!fcoords[0] || fcoords[0].length < 4) { props['_skip_reason'] = 'complex'; skipped++; continue; }

        var result = computeBuildingHeightSync(feature);
        if (!result) {
            if (existingHeight !== null) { alreadyHad++; } else { props['_skip_reason'] = 'no_data'; skipped++; }
            continue;
        }
        if (result.height < 2 || result.height > 60) {
            if (existingHeight !== null) { alreadyHad++; } else { props['_skip_reason'] = 'out_of_range'; skipped++; }
            continue;
        }

        // Skip small-footprint buildings with disproportionate height (likely tree canopy)
        // Uses slenderness ratio: height / sqrt(area). Normal buildings ~0.5–1.2, trees ~1.5+
        var footprintArea = props['_area'] || 0;
        var slenderness = footprintArea > 0 ? result.height / Math.sqrt(footprintArea) : 0;
        if (footprintArea < 100 && slenderness > 1.5) {
            if (existingHeight !== null) { alreadyHad++; } else { props['_skip_reason'] = 'tree_canopy'; skipped++; }
            continue;
        }

        // building:part with existing height — only update if significantly different
        // and the existing source doesn't indicate a precision survey
        if (isPart && existingHeight !== null) {
            var existingSource = (props['source:height'] || '').toLowerCase();
            var precisionSources = ['survey', 'cadastre', 'lidar', 'gps', 'gnss', 'laser'];
            var isPrecise = precisionSources.some(function(s) { return existingSource.indexOf(s) !== -1; });
            if (isPrecise) {
                // Existing height from a precision source — never override
                alreadyHad++;
                continue;
            }
            var diff = Math.abs(result.height - existingHeight);
            var pct = existingHeight > 0 ? diff / existingHeight : 1;
            // Update only when deviation is > 2m AND > 20% — avoids overriding good data
            if (diff > 2 && pct > 0.2) {
                props['_prev_height'] = props.height;
                props.height = String(result.height);
                props['source:height'] = 'swisstopo/swissALTI3D;swissSURFACE3D';
                improved++;
            } else {
                // Existing height is close enough — keep it
                alreadyHad++;
            }
            continue;
        }

        props.height = String(result.height);
        props['source:height'] = 'swisstopo/swissALTI3D;swissSURFACE3D';
        enriched++;
    }

    // Report with detailed skip reasons
    var elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    onLog('Done in ' + elapsed + 's');
    onLog('Enriched: ' + enriched + ', Improved: ' + improved + ', Already had height: ' + alreadyHad + ', Skipped: ' + skipped);
    if (skipped > 0) {
        var skipReasons = {};
        geojson.features.forEach(function(f) {
            var reason = f.properties['_skip_reason'];
            if (reason) skipReasons[reason] = (skipReasons[reason] || 0) + 1;
        });
        var reasonLabels = { roof: 'has roof:height', complex: 'multipolygon/invalid', no_data: 'no elevation data', out_of_range: 'height <2m or >60m', has_height: 'already had height', has_parts: 'outline has building:part ways', tree_canopy: 'small footprint + tall height (likely trees)' };
        for (var reason in skipReasons) {
            if (reason !== 'has_height') { // already counted in alreadyHad
                onLog('  Skipped (' + (reasonLabels[reason] || reason) + '): ' + skipReasons[reason]);
            }
        }
    }

    var heights = geojson.features
        .filter(function(f) { return f.properties['source:height']; })
        .map(function(f) { return parseFloat(f.properties.height); })
        .filter(function(h) { return !isNaN(h); });

    if (heights.length > 0) {
        heights.sort(function(a, b) { return a - b; });
        var mean = (heights.reduce(function(a, b) { return a + b; }, 0) / heights.length).toFixed(1);
        var median = heights[Math.floor(heights.length / 2)].toFixed(1);
        onLog('Height range: ' + heights[0] + 'm - ' + heights[heights.length - 1] + 'm, Mean: ' + mean + 'm, Median: ' + median + 'm');
    }

    var enrichedParts = geojson.features.filter(function(f) { return f.properties['_is_part'] && f.properties['source:height']; }).length;
    onDone(geojson, { total: total, enriched: enriched, improved: improved, alreadyHad: alreadyHad, skipped: skipped, parts: totalParts, enrichedParts: enrichedParts });
    return geojson;
}

function clearPipelineCache() {
    // Only clear building-specific data, keep tile data for re-runs
    // tileDataCache is intentionally NOT cleared — tiles are immutable and reusable
    failedTiles.clear();
}
