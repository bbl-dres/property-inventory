// Swisstopo 3D Tiles integration via Three.js custom layer
// Uses 3DTilesRendererJS to load Cesium 3D Tiles (.b3dm) into MapLibre

import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const SWISSTOPO_BUILDINGS_URL = 'https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json';
const LAYER_ID = 'swisstopo-3d-tiles';

let scene, camera, renderer, tiles, mapInstance, localTransform;
let isAdded = false;
let isLoaded = false;

// Convert ECEF Cartesian coordinates to longitude/latitude/altitude
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

  return {
    lng: (lon * 180) / Math.PI,
    lat: (lat * 180) / Math.PI,
    alt
  };
}

function getModelTransform(coord) {
  const mc = maplibregl.MercatorCoordinate.fromLngLat([coord[0], coord[1]], coord[2]);
  return {
    translateX: mc.x,
    translateY: mc.y,
    translateZ: mc.z,
    rotateX: Math.PI / 2,
    rotateY: 0,
    rotateZ: 0,
    scale: mc.meterInMercatorCoordinateUnits()
  };
}

function updateLocalTransform(modelOrigin) {
  if (!modelOrigin) modelOrigin = [0, 0, 0];
  const mt = getModelTransform(modelOrigin);
  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);
  const rotX = new THREE.Matrix4().makeRotationAxis(axisX, mt.rotateX);
  const rotY = new THREE.Matrix4().makeRotationAxis(axisY, mt.rotateY);
  const rotZ = new THREE.Matrix4().makeRotationAxis(axisZ, mt.rotateZ);
  const scaleVec = new THREE.Vector3(mt.scale, -mt.scale, mt.scale);
  localTransform = new THREE.Matrix4()
    .makeTranslation(mt.translateX, mt.translateY, mt.translateZ)
    .scale(scaleVec)
    .multiply(rotX)
    .multiply(rotY)
    .multiply(rotZ);
}

function initTiles(url, sceneInst, cameraInst, rendererInst) {
  const gltfLoader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://unpkg.com/three@0.183.0/examples/jsm/libs/draco/');
  gltfLoader.setDRACOLoader(dracoLoader);

  tiles = new TilesRenderer(url);
  tiles.group.name = 'swisstopo-buildings';
  sceneInst.add(tiles.group);

  tiles.setCamera(cameraInst);
  tiles.setResolutionFromRenderer(cameraInst, rendererInst);

  tiles.manager.addHandler(/\.(gltf|glb)$/g, gltfLoader);
  tiles.errorTarget = 6;
  tiles.lruCache.maxSize = 4000;
  tiles.lruCache.maxBytesSize = 2 * 2 ** 30; // 2 GB

  // Debug: log tile loading events
  tiles.addEventListener('load-tileset', function() {
    console.log('[3D Tiles] Tileset loaded');
  });
  tiles.addEventListener('load-model', function(ev) {
    console.log('[3D Tiles] Model loaded:', ev.scene?.name || 'unnamed');
  });
  tiles.addEventListener('tiles-load-start', function() {
    console.log('[3D Tiles] Tiles load start');
  });
  tiles.addEventListener('tiles-load-end', function() {
    console.log('[3D Tiles] Tiles load end');
  });

  let loadedTileSetHandled = false;
  const onLoadTileset = function() {
    if (loadedTileSetHandled) {
      tiles.removeEventListener('load-tileset', onLoadTileset);
      return;
    }

    const sphere = new THREE.Sphere();
    tiles.getBoundingSphere(sphere);
    const center = sphere.center.clone();
    const root = tiles.root;

    console.log('[3D Tiles] Bounding sphere center (ECEF):', center);
    console.log('[3D Tiles] Root boundingVolume:', root?.boundingVolume);

    loadedTileSetHandled = true;

    // Convert ECEF center to geographic coordinates
    const { lng, lat, alt } = ecefToLngLatAlt(center.x, center.y, center.z);
    console.log('[3D Tiles] Center (geographic):', { lng, lat, alt });

    // Set the local transform to the tileset's geographic center
    // Offset altitude to bring buildings down to map surface level.
    // The tiles are positioned at real-world ellipsoid elevations (~400-800m for Swiss plateau).
    // MapLibre's flat map is at altitude 0, so we subtract the center elevation.
    updateLocalTransform([lng, lat, -alt]);

    // For region-based tilesets (no root transform), tiles are in ECEF.
    // We need to: 1) translate to origin, 2) rotate from ECEF to local EUS (East-Up-South)
    // This matches the coordinate system used by the MapLibre Three.js custom layer
    // where localTransform applies rotateX(PI/2)
    const lonRad = (lng * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;
    const sinLon = Math.sin(lonRad);
    const cosLon = Math.cos(lonRad);
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);

    // ECEF-to-EUS rotation: Row0=East, Row1=Up, Row2=South(-North)
    const eusRotation = new THREE.Matrix4().set(
      -sinLon,           cosLon,            0,          0,
       cosLat * cosLon,  cosLat * sinLon,   sinLat,     0,
       sinLat * cosLon,  sinLat * sinLon,  -cosLat,     0,
       0,                0,                  0,          1
    );

    // Translate ECEF origin to tileset center
    const moveToOrigin = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);

    // Combined: first move to origin, then rotate ECEF→EUS
    const finalMatrix = new THREE.Matrix4().multiplyMatrices(eusRotation, moveToOrigin);

    tiles.group.matrix.copy(finalMatrix);
    tiles.group.matrixAutoUpdate = false;
    tiles.group.updateMatrixWorld(true);

    isLoaded = true;
    console.log('[3D Tiles] Swisstopo 3D buildings ready');
  };
  tiles.addEventListener('load-tileset', onLoadTileset);

  // Initialize transform near Switzerland center so tiles start loading
  updateLocalTransform([8.2275, 46.8182, 500]);
}

const customLayer = {
  id: LAYER_ID,
  type: 'custom',
  renderingMode: '3d',
  onAdd: function(map, gl) {
    camera = new THREE.PerspectiveCamera();
    scene = new THREE.Scene();

    // Ambient + directional light for solid appearance
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

    // DEBUG: Add a red test cube at Bern to verify Three.js rendering works
    const testGeo = new THREE.BoxGeometry(200, 200, 200);
    const testMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const testCube = new THREE.Mesh(testGeo, testMat);
    testCube.position.set(0, 0, 100); // 100m above origin
    scene.add(testCube);
    console.log('[3D Tiles] DEBUG: Red test cube added to scene');

    initTiles(SWISSTOPO_BUILDINGS_URL, scene, camera, renderer);
  },
  render: function(gl, args) {
    if (!camera || !renderer || !scene) return;

    // Always update tiles so the tileset can load even before localTransform is ready
    if (tiles) {
      tiles.update();
    }

    // Only render once the transform is established
    if (!localTransform) {
      mapInstance.triggerRepaint();
      return;
    }

    // In MapLibre v4, render(gl, matrix) where matrix is a Float64Array
    // In MapLibre v5+, render(gl, args) where args.defaultProjectionData.mainMatrix
    let projMatrix;
    if (args instanceof Float32Array || args instanceof Float64Array || Array.isArray(args)) {
      // v4: second arg IS the matrix
      projMatrix = args;
    } else if (args && args.defaultProjectionData) {
      // v5+
      projMatrix = args.defaultProjectionData.mainMatrix;
    } else if (args && args.projectionMatrix) {
      projMatrix = args.projectionMatrix;
    }

    if (!projMatrix) {
      console.warn('[3D Tiles] No projection matrix found, args type:', typeof args, args);
      return;
    }

    const m = new THREE.Matrix4().fromArray(projMatrix);
    const l = localTransform.clone();
    camera.projectionMatrix = m.multiply(l);

    renderer.resetState();
    renderer.render(scene, camera);
    mapInstance.triggerRepaint();
  },
  onRemove: function() {
    if (tiles) {
      tiles.dispose();
      tiles = null;
    }
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
    scene = null;
    camera = null;
    mapInstance = null;
    localTransform = null;
    isLoaded = false;
    isAdded = false;
  }
};

export function showSwisstopo3D(map) {
  // If layer exists, just make it visible
  if (map.getLayer(LAYER_ID)) {
    map.setLayoutProperty(LAYER_ID, 'visibility', 'visible');
    return;
  }

  // (Re-)add the custom layer (handles both first load and post-style-change)
  map.addLayer(customLayer);
  isAdded = true;
}

export function hideSwisstopo3D(map) {
  if (!isAdded || !map.getLayer(LAYER_ID)) return;
  map.setLayoutProperty(LAYER_ID, 'visibility', 'none');
}

export function removeSwisstopo3D(map) {
  if (!isAdded) return;
  if (map.getLayer(LAYER_ID)) {
    map.removeLayer(LAYER_ID);
  }
  isAdded = false;
  isLoaded = false;
}

export function isSwisstopo3DLoaded() {
  return isLoaded;
}
