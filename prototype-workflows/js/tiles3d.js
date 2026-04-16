// Google Photorealistic 3D Tiles integration via Three.js custom layer
// Uses 3DTilesRendererJS to load 3D Tiles into MapLibre

import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const GOOGLE_API_KEY = 'AIzaSyCcfg9ab7_u9uRpqVVSVoqiVZfKp3q7Oa0';
const TILES_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json?key=' + GOOGLE_API_KEY;
const LAYER_ID = 'google-3d-tiles';

let scene, camera, renderer, tiles, mapInstance, localTransform;
let isAdded = false;
let isLoaded = false;
let tilesLoading = false;

// --- Coordinate helpers ---

function ecefToLngLatAlt(x, y, z) {
  const a = 6378137.0;
  const e2 = 6.69437999014e-3;
  const b = a * Math.sqrt(1 - e2);
  const ep2 = (a * a - b * b) / (b * b);
  const p = Math.sqrt(x * x + y * y);
  const th = Math.atan2(a * z, b * p);
  const lon = Math.atan2(y, x);
  const lat = Math.atan2(
    z + ep2 * b * Math.pow(Math.sin(th), 3),
    p - e2 * a * Math.pow(Math.cos(th), 3)
  );
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) * Math.sin(lat));
  const alt = p / Math.cos(lat) - n;
  return { lng: (lon * 180) / Math.PI, lat: (lat * 180) / Math.PI, alt };
}

function updateLocalTransform(modelOrigin) {
  if (!modelOrigin) modelOrigin = [0, 0, 0];
  const mc = maplibregl.MercatorCoordinate.fromLngLat(
    [modelOrigin[0], modelOrigin[1]], modelOrigin[2]
  );
  const s = mc.meterInMercatorCoordinateUnits();
  const rotX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  localTransform = new THREE.Matrix4()
    .makeTranslation(mc.x, mc.y, mc.z)
    .scale(new THREE.Vector3(s, -s, s))
    .multiply(rotX);
}

// --- Tile loading ---

function initTiles(url, sceneInst, cameraInst, rendererInst) {
  const gltfLoader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://unpkg.com/three@0.183.0/examples/jsm/libs/draco/');
  gltfLoader.setDRACOLoader(dracoLoader);

  tiles = new TilesRenderer(url);
  tiles.group.name = 'google-3d-tiles';
  sceneInst.add(tiles.group);

  tiles.setCamera(cameraInst);
  tiles.setResolutionFromRenderer(cameraInst, rendererInst);
  tiles.manager.addHandler(/\.(gltf|glb)$/g, gltfLoader);
  tiles.errorTarget = 4;
  tiles.lruCache.maxSize = 8000;
  tiles.lruCache.maxBytesSize = 4 * 2 ** 30;

  tiles.addEventListener('tiles-load-start', function() { tilesLoading = true; console.log('[3D] tiles-load-start'); });
  tiles.addEventListener('tiles-load-end', function() { tilesLoading = false; console.log('[3D] tiles-load-end'); });
  tiles.addEventListener('load-model', function() { console.log('[3D] model loaded'); });

  // For Google's global tileset, use the map view center as the anchor point.
  // Compute the ECEF-to-local transform based on that position.
  let handled = false;
  tiles.addEventListener('load-tileset', function() {
    if (handled) return;
    handled = true;

    // Use map center as anchor
    var mc = mapInstance.getCenter();
    var lng = mc.lng;
    var lat = mc.lat;

    // Convert to ECEF for the group transform
    var lonRad = (lng * Math.PI) / 180;
    var latRad = (lat * Math.PI) / 180;
    var a = 6378137.0;
    var e2 = 6.69437999014e-3;
    var N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
    var cx = N * Math.cos(latRad) * Math.cos(lonRad);
    var cy = N * Math.cos(latRad) * Math.sin(lonRad);
    var cz = N * (1 - e2) * Math.sin(latRad);

    updateLocalTransform([lng, lat, 0]);

    // Build ECEF-to-EUS rotation at map center
    var sl = Math.sin(lonRad), cl = Math.cos(lonRad);
    var sp = Math.sin(latRad), cp = Math.cos(latRad);

    var finalMatrix = new THREE.Matrix4().set(
      -sl,      cl,       0,    sl * cx - cl * cy,
      cp * cl,  cp * sl,  sp,   -cp * cl * cx - cp * sl * cy - sp * cz,
      sp * cl,  sp * sl, -cp,   -sp * cl * cx - sp * sl * cy + cp * cz,
      0,        0,        0,    1
    );

    tiles.group.matrix.copy(finalMatrix);
    tiles.group.matrixAutoUpdate = false;
    tiles.group.updateMatrixWorld(true);

    isLoaded = true;
    console.log('[3D] Google 3D tiles ready at', lng.toFixed(4), lat.toFixed(4));
  });

  // Initial transform at map center
  var mapCenter = mapInstance.getCenter();
  updateLocalTransform([mapCenter.lng, mapCenter.lat, 0]);
}

// --- Custom layer ---

const customLayer = {
  id: LAYER_ID,
  type: 'custom',
  renderingMode: '3d',
  onAdd: function(map, gl) {
    camera = new THREE.PerspectiveCamera();
    scene = new THREE.Scene();

    const ambient = new THREE.AmbientLight(0xffffff, 2.0);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 1.5);
    directional.position.set(1, 2, 3);
    scene.add(directional);

    mapInstance = map;
    renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true
    });
    renderer.autoClear = false;

    initTiles(TILES_URL, scene, camera, renderer);
  },
  render: function(gl, args) {
    if (!camera || !renderer || !scene) return;

    if (tiles) tiles.update();

    if (!localTransform) {
      if (tilesLoading || !isLoaded) mapInstance.triggerRepaint();
      return;
    }

    // MapLibre v5: args.defaultProjectionData.mainMatrix
    const projMatrix = args && args.defaultProjectionData && args.defaultProjectionData.mainMatrix;
    if (!projMatrix) return;

    const m = new THREE.Matrix4().fromArray(projMatrix);
    camera.projectionMatrix = m.multiply(localTransform.clone());

    renderer.resetState();
    renderer.render(scene, camera);

    if (tilesLoading || !isLoaded) mapInstance.triggerRepaint();
  },
  onRemove: function() {
    if (tiles) { tiles.dispose(); tiles = null; }
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = null;
    camera = null;
    mapInstance = null;
    localTransform = null;
    isLoaded = false;
    isAdded = false;
  }
};

// --- Public API ---

export function showGoogle3D(map) {
  if (map.getLayer(LAYER_ID)) {
    map.setLayoutProperty(LAYER_ID, 'visibility', 'visible');
    return;
  }
  map.addLayer(customLayer);
  isAdded = true;
}

export function hideGoogle3D(map) {
  if (!isAdded || !map.getLayer(LAYER_ID)) return;
  map.setLayoutProperty(LAYER_ID, 'visibility', 'none');
}
