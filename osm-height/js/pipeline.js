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
async function preloadTiles(pointsLV95, onLog) {
    var tileIds = new Set();
    for (var i = 0; i < pointsLV95.length; i++) {
        tileIds.add(tileIdFromLV95(pointsLV95[i][0], pointsLV95[i][1]));
    }

    var promises = [];
    tileIds.forEach(function(tileId) {
        var dtmKey = 'dtm:' + tileId;
        var dsmKey = 'dsm:' + tileId;
        if (!tileDataCache.has(dtmKey) && !failedTiles.has(dtmKey)) {
            promises.push(
                getTileData(ALTI3D_URL, tileId).then(function(r) {
                    if (r && onLog) onLog('Loaded DTM tile ' + tileId);
                })
            );
        }
        if (!tileDataCache.has(dsmKey) && !failedTiles.has(dsmKey)) {
            promises.push(
                getTileData(SURFACE3D_URL, tileId).then(function(r) {
                    if (r && onLog) onLog('Loaded DSM tile ' + tileId);
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
    // For simple buildings (< 6 vertices), skip polygon test — bbox is enough
    var simpleBuilding = coordsLV95.length <= 6;

    for (var gx = minX + spacing / 2; gx < maxX; gx += spacing) {
        for (var gy = minY + spacing / 2; gy < maxY; gy += spacing) {
            if (simpleBuilding || pointInPolygon(gx, gy, coordsLV95)) {
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

    return {
        height_max: Math.round(Math.max.apply(null, heights) * 10) / 10,
        height_mean: Math.round((heights.reduce(function(a, b) { return a + b; }, 0) / heights.length) * 10) / 10,
        elevation_ground: Math.round(minDTM * 10) / 10,
        elevation_roof: Math.round(maxDSM * 10) / 10,
        sample_points: heights.length,
    };
}

// =============================================
// Overpass extraction
// =============================================
var OVERPASS_URL = 'https://overpass.osm.ch/api/interpreter';

async function extractBuildings(bbox, onLog) {
    var west = bbox[0], south = bbox[1], east = bbox[2], north = bbox[3];
    var query = '[out:json][timeout:180];(way["building"](' + south + ',' + west + ',' + north + ',' + east + '););out body;>;out skel qt;';

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
    var tagsToCopy = ['height', 'building:levels', 'min_height', 'roof:height', 'roof:shape', 'roof:levels', 'roof:colour', 'roof:material', 'name', 'addr:street', 'addr:housenumber'];

    for (var j = 0; j < data.elements.length; j++) {
        var el2 = data.elements[j];
        if (el2.type !== 'way' || !el2.tags) continue;
        var coords = [];
        for (var n = 0; n < (el2.nodes || []).length; n++) {
            var node = nodes[el2.nodes[n]];
            if (node) coords.push(node);
        }
        if (coords.length < 4) continue;
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push(coords[0]);
        }

        var props = { osm_id: el2.id, osm_type: 'way', building: el2.tags.building || 'yes' };
        for (var t = 0; t < tagsToCopy.length; t++) {
            if (el2.tags[tagsToCopy[t]]) props[tagsToCopy[t]] = el2.tags[tagsToCopy[t]];
        }

        features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [coords] },
            properties: props,
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
 * @param {object} callbacks - { onStep, onProgress, onLog, onError, onDone }
 */
async function runPipeline(bbox, callbacks) {
    var onStep = callbacks.onStep || function() {};
    var onProgress = callbacks.onProgress || function() {};
    var onLog = callbacks.onLog || function() {};
    var onError = callbacks.onError || function() {};
    var onDone = callbacks.onDone || function() {};

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
    var withHeight = geojson.features.filter(function(f) { return f.properties.height; }).length;
    onLog('Extracted ' + total + ' buildings (' + withHeight + ' already have height)');

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
    await preloadTiles(allLV95Points, onLog);

    // Step 3: Compute heights (synchronous per building — tiles are in memory)
    onStep('Computing building heights...');
    var enriched = 0, skipped = 0, alreadyHad = 0;

    for (var b = 0; b < total; b++) {
        if (b % 50 === 0 || b === total - 1) {
            onProgress(b + 1, total);
            await new Promise(function(r) { setTimeout(r, 0); }); // yield to UI
        }

        var feature = geojson.features[b];
        var props = feature.properties;

        // Skip filters
        if (props.height) { props['_skip_reason'] = 'has_height'; alreadyHad++; continue; }

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
            props['_skip_reason'] = 'no_data'; skipped++; continue;
        }
        if (result.height_max < 2 || result.height_max > 60) {
            props['_skip_reason'] = 'out_of_range'; skipped++; continue;
        }
        props.height = String(result.height_max);
        props['source:height'] = 'swisstopo/swissALTI3D;swissSURFACE3D';
        enriched++;
    }

    // Report with detailed skip reasons
    var elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    onLog('Done in ' + elapsed + 's');
    onLog('Enriched: ' + enriched + ', Already had height: ' + alreadyHad + ', Skipped: ' + skipped);
    if (skipped > 0) {
        var skipReasons = {};
        geojson.features.forEach(function(f) {
            var reason = f.properties['_skip_reason'];
            if (reason) skipReasons[reason] = (skipReasons[reason] || 0) + 1;
        });
        var reasonLabels = { roof: 'has roof:height', complex: 'multipolygon/invalid', no_data: 'no elevation data', out_of_range: 'height <2m or >60m', has_height: 'already had height' };
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

    onDone(geojson, { total: total, enriched: enriched, alreadyHad: alreadyHad, skipped: skipped });
    return geojson;
}

function clearPipelineCache() {
    // Only clear building-specific data, keep tile data for re-runs
    // tileDataCache is intentionally NOT cleared — tiles are immutable and reusable
    failedTiles.clear();
}
