import './styles.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const PIXEL_COUNT = 24;
const TUBE_LENGTH = 1.5;
const PIXEL_SPACING = TUBE_LENGTH / PIXEL_COUNT;
const PIXEL_HEIGHT = PIXEL_SPACING * 0.78;
const PIXEL_WIDTH = 0.12;
const GRID_STEP = 0.1;
const MAJOR_GRID_EVERY = 10;
const MOVE_SPEED = 3.2;
const LOOK_SPEED = 0.0022;
const TOUCH_LOOK_SPEED = 0.003;
const DRAG_TAP_THRESHOLD = 8;
const GAMEPAD_DEADZONE = 0.18;

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1014);
scene.fog = new THREE.Fog(0x0d1014, 14, 32);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.65, 6.2);
camera.rotation.order = 'YXZ';

let yaw = 0;
let pitch = 0;
applyCameraLook();

const ambient = new THREE.HemisphereLight(0xffffff, 0x26303a, 1.7);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(4, 7, 5);
keyLight.castShadow = true;
scene.add(keyLight);

const room = {
  width: 5,
  depth: 5,
  height: 3
};

const terrainSettings = {
  enabled: false,
  amplitude: 0.28
};

const OBJECT_TYPES = {
  riser: {
    label: 'Riser',
    width: 1.2,
    depth: 0.72,
    height: 0.36,
    color: 0x79858c,
    spawnOffsetX: -0.85,
    spawnOffsetZ: 0.35
  },
  wall: {
    label: 'Wall',
    width: 1.55,
    depth: 0.14,
    height: 1.25,
    color: 0x647280,
    spawnOffsetX: 0,
    spawnOffsetZ: 0.75
  },
  column: {
    label: 'Column',
    radius: 0.18,
    height: 1.45,
    color: 0x6f7f77,
    spawnOffsetX: 0.82,
    spawnOffsetZ: 0.1
  }
};

const gridGroup = new THREE.Group();
const boundaryGroup = new THREE.Group();
const terrainGroup = new THREE.Group();
const sceneObjectGroup = new THREE.Group();
scene.add(terrainGroup, gridGroup, sceneObjectGroup, boundaryGroup);

const workPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const aimNdc = new THREE.Vector2(0, 0);
const pickNdc = new THREE.Vector2(0, 0);
const tempQuat = new THREE.Quaternion();
const tempDirection = new THREE.Vector3();
const tempRight = new THREE.Vector3();
const tempUp = new THREE.Vector3();
const tempForward = new THREE.Vector3();
const tempAxis = new THREE.Vector3();
const tempSpawnPoint = new THREE.Vector3();
const dragPlane = new THREE.Plane();
const dragPoint = new THREE.Vector3();
const dragOffset = new THREE.Vector3();
const clock = new THREE.Clock();

const sceneObjects = [];
let sceneObjectId = 0;
let selectedSceneObject = null;

const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const selectedObjectBox = new THREE.Box3();
const tempObjectBox = new THREE.Box3();
const tempObjectSize = new THREE.Vector3();
const tempObjectCenter = new THREE.Vector3();
const selectedObjectHelper = new THREE.Box3Helper(selectedObjectBox, 0xffd166);
selectedObjectHelper.visible = false;
scene.add(selectedObjectHelper);

const footprintGeometry = new THREE.PlaneGeometry(0.28, 0.28);
const footprintMaterial = new THREE.MeshBasicMaterial({
  color: 0x65e4a3,
  transparent: true,
  opacity: 0.34,
  side: THREE.DoubleSide,
  depthWrite: false
});
const footprint = new THREE.Mesh(footprintGeometry, footprintMaterial);
footprint.rotation.x = -Math.PI / 2;
scene.add(footprint);

const lineMaterial = new THREE.LineBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.9 });
const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const projectionLine = new THREE.Line(lineGeometry, lineMaterial);
scene.add(projectionLine);

const placedGroup = new THREE.Group();
scene.add(placedGroup);

function createLineSegments(positions, color, opacity) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false
  });
  return new THREE.LineSegments(geometry, material);
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else {
      child.material?.dispose();
    }
  });
}

function clearObjectGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject(child);
  }
}

function rebuildRoomHelpers() {
  clearObjectGroup(gridGroup);
  clearObjectGroup(boundaryGroup);

  const minor = [];
  const major = [];
  const widthSteps = Math.round(room.width / GRID_STEP);
  const depthSteps = Math.round(room.depth / GRID_STEP);
  const halfWidth = room.width * 0.5;
  const halfDepth = room.depth * 0.5;

  for (let i = 0; i <= widthSteps; i += 1) {
    const x = -halfWidth + i * GRID_STEP;
    const target = i % MAJOR_GRID_EVERY === 0 ? major : minor;
    target.push(x, 0, -halfDepth, x, 0, halfDepth);
  }

  for (let i = 0; i <= depthSteps; i += 1) {
    const z = -halfDepth + i * GRID_STEP;
    const target = i % MAJOR_GRID_EVERY === 0 ? major : minor;
    target.push(-halfWidth, 0, z, halfWidth, 0, z);
  }

  gridGroup.add(createLineSegments(minor, 0x253342, 0.34));
  gridGroup.add(createLineSegments(major, 0x56a8ff, 0.58));

  const boundaryGeometry = new THREE.BoxGeometry(room.width, room.height, room.depth);
  const boundaryEdges = new THREE.EdgesGeometry(boundaryGeometry);
  boundaryGeometry.dispose();
  const boundaryMaterial = new THREE.LineBasicMaterial({
    color: 0x38f6bf,
    transparent: true,
    opacity: 0.72
  });
  const boundary = new THREE.LineSegments(boundaryEdges, boundaryMaterial);
  boundary.position.y = room.height * 0.5;
  boundaryGroup.add(boundary);
}

function getTerrainHeightAt(x, z) {
  if (!terrainSettings.enabled) return 0;

  const halfWidth = room.width * 0.5;
  const halfDepth = room.depth * 0.5;
  const edgeFade = clamp(
    Math.min(
      (halfWidth - Math.abs(x)) / 0.55,
      (halfDepth - Math.abs(z)) / 0.55
    ),
    0,
    1
  );
  const wave = 0.5
    + Math.sin(x * 1.8) * Math.cos(z * 1.25) * 0.28
    + Math.sin((x - z) * 2.1) * 0.16
    + Math.cos((x + z) * 1.35) * 0.12;

  return clamp(wave * terrainSettings.amplitude * edgeFade, 0, terrainSettings.amplitude);
}

function rebuildTerrain() {
  clearObjectGroup(terrainGroup);
  if (!terrainSettings.enabled) return;

  const widthSegments = Math.max(8, Math.round(room.width / 0.18));
  const depthSegments = Math.max(8, Math.round(room.depth / 0.18));
  const geometry = new THREE.PlaneGeometry(room.width, room.depth, widthSegments, depthSegments);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    position.setY(i, getTerrainHeightAt(position.getX(i), position.getZ(i)));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x41524c,
    roughness: 0.92,
    metalness: 0.02,
    transparent: true,
    opacity: 0.7
  });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  terrainGroup.add(terrain);

  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: 0x92c8b5,
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    })
  );
  terrainGroup.add(wire);
}

function addObjectEdges(group, mesh) {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({
      color: 0xc9d6d2,
      transparent: true,
      opacity: 0.36
    })
  );
  edges.position.copy(mesh.position);
  edges.rotation.copy(mesh.rotation);
  group.add(edges);
}

function createSceneObjectMesh(type, config) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: config.color,
    roughness: 0.74,
    metalness: 0.08,
    transparent: true,
    opacity: 0.78
  });

  let geometry;
  if (type === 'column') {
    geometry = new THREE.CylinderGeometry(config.radius, config.radius, config.height, 20);
  } else {
    geometry = new THREE.BoxGeometry(config.width, config.height, config.depth);
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = config.height * 0.5;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  addObjectEdges(group, mesh);
  return group;
}

function prepareSceneObjectMeshes(group, object) {
  group.userData.sceneObject = object;
  group.traverse((child) => {
    child.userData.sceneObject = object;
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (!child.material) {
        child.material = new THREE.MeshStandardMaterial({ color: 0x83909a, roughness: 0.78 });
      }
    }
  });
}

function measureSceneObject(object) {
  tempObjectBox.setFromObject(object.group);
  const size = tempObjectBox.getSize(tempObjectSize);
  object.width = Math.max(size.x, 0.05);
  object.depth = Math.max(size.z, 0.05);
  object.height = Math.max(size.y, object.height ?? 0.05);
}

function registerSceneObject(object, { select = false } = {}) {
  object.id = sceneObjectId;
  sceneObjectId += 1;
  object.baseOffset ??= 0;
  object.snapSurface ??= true;
  prepareSceneObjectMeshes(object.group, object);
  sceneObjectGroup.add(object.group);
  sceneObjects.push(object);
  measureSceneObject(object);
  clampSceneObjectToRoom(object);
  syncSceneInputs();
  if (select) selectSceneObject(object);
  return object;
}

function getObjectFootprint(object) {
  tempObjectBox.setFromObject(object.group);
  const size = tempObjectBox.getSize(tempObjectSize);
  return {
    x: Math.max(size.x * 0.5, object.radius ?? 0.03),
    z: Math.max(size.z * 0.5, object.radius ?? 0.03)
  };
}

function clampSceneObjectToRoom(object) {
  const footprint = getObjectFootprint(object);
  const maxX = Math.max(0, room.width * 0.5 - footprint.x);
  const maxZ = Math.max(0, room.depth * 0.5 - footprint.z);
  object.group.position.x = clamp(object.group.position.x, -maxX, maxX);
  object.group.position.z = clamp(object.group.position.z, -maxZ, maxZ);
  object.baseOffset = clamp(object.baseOffset ?? 0, 0, room.height);
  object.group.position.y = getTerrainHeightAt(object.group.position.x, object.group.position.z) + object.baseOffset;
}

function syncSceneObjectHeights() {
  sceneObjects.forEach(clampSceneObjectToRoom);
}

function getObjectTopAt(object, x, z) {
  if (!object.snapSurface) return null;

  tempObjectBox.setFromObject(object.group);
  if (
    x < tempObjectBox.min.x
    || x > tempObjectBox.max.x
    || z < tempObjectBox.min.z
    || z > tempObjectBox.max.z
  ) {
    return null;
  }

  return tempObjectBox.max.y;
}

function getSceneSurfaceHeightAt(x, z) {
  let height = getTerrainHeightAt(x, z);
  sceneObjects.forEach((object) => {
    const top = getObjectTopAt(object, x, z);
    if (top !== null) height = Math.max(height, top);
  });
  return height;
}

function getReticleGroundPoint() {
  raycaster.setFromCamera(aimNdc, camera);
  if (!raycaster.ray.intersectPlane(workPlane, tempSpawnPoint)) {
    camera.getWorldDirection(tempDirection);
    tempSpawnPoint.copy(camera.position).addScaledVector(tempDirection, 3.2);
  }

  tempSpawnPoint.x = clamp(tempSpawnPoint.x, -room.width * 0.5, room.width * 0.5);
  tempSpawnPoint.z = clamp(tempSpawnPoint.z, -room.depth * 0.5, room.depth * 0.5);
  tempSpawnPoint.y = getTerrainHeightAt(tempSpawnPoint.x, tempSpawnPoint.z);
  return tempSpawnPoint;
}

function addSceneObject(type) {
  const config = OBJECT_TYPES[type];
  if (!config) return;

  const point = getReticleGroundPoint();
  const group = createSceneObjectMesh(type, config);
  const object = {
    type,
    label: config.label,
    group,
    width: config.width ?? config.radius * 2,
    depth: config.depth ?? config.radius * 2,
    radius: config.radius ?? 0,
    height: config.height,
    baseOffset: 0,
    snapSurface: true
  };

  const repeatOffset = Math.floor(sceneObjects.length / 3) * 0.22;
  group.position.set(
    point.x + config.spawnOffsetX + repeatOffset,
    point.y,
    point.z + config.spawnOffsetZ + repeatOffset
  );
  gestureLabel = `Add ${config.label}`;
  registerSceneObject(object, { select: true });
}

function clearSceneObjects() {
  deselectSceneObject();
  sceneObjects.length = 0;
  clearObjectGroup(sceneObjectGroup);
  gestureLabel = 'Clear Objects';
  syncSceneInputs();
}

function selectSceneObject(object) {
  if (!object) return;
  if (placement.active) cancelPlacement();
  selectedSceneObject = object;
  selectedObjectBox.setFromObject(object.group);
  selectedObjectHelper.visible = true;
  gestureLabel = 'Object Selected';
  syncSceneInputs();
}

function deselectSceneObject() {
  selectedSceneObject = null;
  selectedObjectHelper.visible = false;
  syncSceneInputs();
}

function updateSelectedObjectHelper() {
  if (!selectedSceneObject) {
    selectedObjectHelper.visible = false;
    return;
  }

  selectedObjectBox.setFromObject(selectedSceneObject.group);
  selectedObjectHelper.visible = true;
  selectedObjectHelper.updateMatrixWorld(true);
}

function pickSceneObject(screenX = window.innerWidth / 2, screenY = window.innerHeight / 2) {
  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  const intersections = raycaster.intersectObjects(sceneObjectGroup.children, true);
  if (intersections.length === 0) return null;
  return intersections[0].object.userData.sceneObject ?? null;
}

function beginSelectedSceneObjectDrag(screenX, screenY) {
  if (!selectedSceneObject) return;

  dragState.planeNormal.set(0, 1, 0);
  dragPlane.setFromNormalAndCoplanarPoint(dragState.planeNormal, selectedSceneObject.group.position);
  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
    dragState.offset.copy(selectedSceneObject.group.position).sub(dragPoint);
    dragState.planeReady = true;
  } else {
    dragState.offset.set(0, 0, 0);
    dragState.planeReady = false;
  }
}

function dragSelectedSceneObjectToPointer(screenX, screenY) {
  if (!selectedSceneObject || !dragState.planeReady) return false;

  dragPlane.setFromNormalAndCoplanarPoint(dragState.planeNormal, selectedSceneObject.group.position);
  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return false;

  const baseOffset = selectedSceneObject.baseOffset ?? 0;
  selectedSceneObject.group.position.copy(dragPoint).add(dragState.offset);
  selectedSceneObject.baseOffset = baseOffset;
  clampSceneObjectToRoom(selectedSceneObject);
  updateSelectedObjectHelper();
  return true;
}

function moveSelectedSceneObjectFromMouse(deltaX, deltaY) {
  if (!selectedSceneObject) return;
  tempRight.setFromMatrixColumn(camera.matrixWorld, 0);
  tempRight.y = 0;
  tempRight.normalize();
  camera.getWorldDirection(tempForward);
  tempForward.y = 0;
  tempForward.normalize();
  const distance = Math.max(1, camera.position.distanceTo(selectedSceneObject.group.position));
  const scale = Math.max(0.004, distance * 0.0016);
  selectedSceneObject.group.position.addScaledVector(tempRight, deltaX * scale);
  selectedSceneObject.group.position.addScaledVector(tempForward, -deltaY * scale);
  clampSceneObjectToRoom(selectedSceneObject);
  updateSelectedObjectHelper();
}

function nudgeSelectedSceneObject(forwardAmount = 0, rightAmount = 0, y = 0) {
  if (!selectedSceneObject) return false;
  tempForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  tempRight.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
  selectedSceneObject.group.position.addScaledVector(tempForward, forwardAmount);
  selectedSceneObject.group.position.addScaledVector(tempRight, rightAmount);
  selectedSceneObject.baseOffset = (selectedSceneObject.baseOffset ?? 0) + y;
  clampSceneObjectToRoom(selectedSceneObject);
  updateSelectedObjectHelper();
  gestureLabel = 'Move Object';
  return true;
}

function rotateSelectedSceneObject(delta) {
  if (!selectedSceneObject) return false;
  selectedSceneObject.group.rotation.y += delta;
  clampSceneObjectToRoom(selectedSceneObject);
  updateSelectedObjectHelper();
  gestureLabel = 'Rotate Object';
  return true;
}

function removeSelectedSceneObject() {
  if (!selectedSceneObject) return false;
  const object = selectedSceneObject;
  deselectSceneObject();
  const index = sceneObjects.indexOf(object);
  if (index >= 0) sceneObjects.splice(index, 1);
  sceneObjectGroup.remove(object.group);
  disposeObject(object.group);
  gestureLabel = 'Delete Object';
  syncSceneInputs();
  return true;
}

function cloneRenderableGroup(group) {
  const userDataRefs = [];
  group.traverse((child) => {
    userDataRefs.push([child, child.userData]);
    child.userData = {};
  });
  const clone = group.clone(true);
  userDataRefs.forEach(([child, userData]) => {
    child.userData = userData;
  });
  clone.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry = child.geometry?.clone();
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone());
    } else {
      child.material = child.material?.clone();
    }
  });
  return clone;
}

function duplicateSelectedSceneObject() {
  if (!selectedSceneObject) return false;
  const group = cloneRenderableGroup(selectedSceneObject.group);
  const object = {
    type: selectedSceneObject.type,
    label: selectedSceneObject.label,
    group,
    width: selectedSceneObject.width,
    depth: selectedSceneObject.depth,
    radius: selectedSceneObject.radius,
    height: selectedSceneObject.height,
    baseOffset: selectedSceneObject.baseOffset,
    snapSurface: selectedSceneObject.snapSurface
  };
  group.position.x += 0.22;
  group.position.z += 0.22;
  registerSceneObject(object, { select: true });
  gestureLabel = 'Duplicate Object';
  return true;
}

function normalizeImportedRoot(root) {
  const group = new THREE.Group();
  group.add(root);

  tempObjectBox.setFromObject(root);
  if (tempObjectBox.isEmpty()) {
    throw new Error('Imported model has no visible geometry.');
  }

  tempObjectBox.getSize(tempObjectSize);
  const maxSize = Math.max(tempObjectSize.x, tempObjectSize.y, tempObjectSize.z);
  const roomLimit = Math.min(room.width, room.depth, room.height);
  const targetSize = Math.min(1.8, roomLimit * 0.55);
  if (maxSize > roomLimit * 0.85 || maxSize < 0.1) {
    root.scale.multiplyScalar(targetSize / maxSize);
  }

  tempObjectBox.setFromObject(root);
  tempObjectBox.getCenter(tempObjectCenter);
  root.position.x -= tempObjectCenter.x;
  root.position.z -= tempObjectCenter.z;
  root.position.y -= tempObjectBox.min.y;

  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });

  return group;
}

function addImportedSceneRoot(root, fileName) {
  const point = getReticleGroundPoint();
  const label = fileName.replace(/\.[^.]+$/, '').slice(0, 22) || 'Imported Model';
  const group = normalizeImportedRoot(root);
  const object = {
    type: 'imported',
    label,
    group,
    width: 1,
    depth: 1,
    height: 1,
    baseOffset: 0,
    snapSurface: false
  };
  group.position.set(point.x, point.y, point.z);
  registerSceneObject(object, { select: true });
  gestureLabel = 'Import Model';
}

function parseGltfModel(data, path = '') {
  return new Promise((resolve, reject) => {
    gltfLoader.parse(data, path, (gltf) => resolve(gltf.scene), reject);
  });
}

async function importModelFile(file) {
  if (!file) return;

  const extension = file.name.split('.').pop()?.toLowerCase();
  try {
    let root;
    if (extension === 'obj') {
      root = objLoader.parse(await file.text());
    } else if (extension === 'glb') {
      root = await parseGltfModel(await file.arrayBuffer());
    } else if (extension === 'gltf') {
      root = await parseGltfModel(await file.text());
    } else {
      gestureLabel = 'Unsupported Model';
      return;
    }

    addImportedSceneRoot(root, file.name);
  } catch (error) {
    gestureLabel = 'Import Failed';
    console.warn('Model import failed:', error);
  }
}

function createTubeMesh({ ghost = false } = {}) {
  const group = new THREE.Group();
  group.userData.tubeRoot = group;

  const geometry = new THREE.BoxGeometry(PIXEL_WIDTH, PIXEL_HEIGHT, PIXEL_WIDTH);
  for (let i = 0; i < PIXEL_COUNT; i += 1) {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.52 + i * 0.006, 0.72, ghost ? 0.58 : 0.68),
      emissive: new THREE.Color().setHSL(0.52 + i * 0.006, 0.74, ghost ? 0.2 : 0.13),
      roughness: 0.48,
      metalness: 0.12,
      transparent: ghost,
      opacity: ghost ? 0.58 : 1
    });

    const pixel = new THREE.Mesh(geometry, material);
    pixel.position.y = i * PIXEL_SPACING + PIXEL_SPACING * 0.5;
    pixel.castShadow = true;
    pixel.receiveShadow = true;
    pixel.userData.tubeRoot = group;
    group.add(pixel);
  }

  return group;
}

function addPlacedTube(position, quaternion = new THREE.Quaternion()) {
  const tube = createTubeMesh();
  tube.position.copy(position);
  tube.quaternion.copy(quaternion);
  placedGroup.add(tube);
  return tube;
}

const heldTube = createTubeMesh({ ghost: true });
scene.add(heldTube);

function createHeightHandle() {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: 0x3df6b0,
    transparent: true,
    opacity: 0.88,
    depthWrite: false
  });
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, TUBE_LENGTH + 0.38, 10), material);
  rail.position.set(0.28, TUBE_LENGTH * 0.5, 0);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 16), material);
  top.position.set(0.28, TUBE_LENGTH + 0.28, 0);
  const bottom = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 16), material);
  bottom.position.set(0.28, -0.12, 0);
  bottom.rotation.z = Math.PI;
  group.add(rail, top, bottom);
  group.traverse((child) => {
    child.userData.heightHandle = true;
  });
  return group;
}

const heightHandle = createHeightHandle();
heightHandle.visible = false;
scene.add(heightHandle);

const modeLabels = {
  free: 'Free',
  'magnetic-plane': 'Magnetic Plane',
  'plane-locked': 'Plane Locked'
};

const placement = {
  active: true,
  source: 'new',
  mode: 'magnetic-plane',
  distanceFromCamera: 5.2,
  heightOffset: 0,
  rotationAxis: 'view-z',
  magneticThreshold: 0.42,
  magneticStrength: 0.78,
  magneticActive: false,
  planeDistance: 0,
  position: new THREE.Vector3(0, 0, 1.2),
  projectedPoint: new THREE.Vector3()
};

const pressedKeys = new Set();
const touchMoves = new Set();
const activePointers = new Map();
const dragState = {
  active: false,
  pointerId: null,
  pointerType: 'mouse',
  button: 0,
  mode: 'primary',
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  moved: false,
  planeReady: false,
  planeNormal: new THREE.Vector3(),
  offset: new THREE.Vector3()
};
const pinchState = {
  active: false,
  distance: 0,
  centerY: 0,
  angle: 0
};
let pointerLockNotice = 'Pointer lock off';
let gestureLabel = 'Idle';
let controllerLabel = 'Press A to connect';
let lastTapAt = 0;
let lastTapX = 0;
let lastTapY = 0;

function dispatch(action) {
  switch (action.type) {
    case 'AIM':
      aimNdc.x = (action.screenX / window.innerWidth) * 2 - 1;
      aimNdc.y = -(action.screenY / window.innerHeight) * 2 + 1;
      break;
    case 'ADJUST_DISTANCE':
      setHeldDistance(placement.distanceFromCamera + action.delta);
      break;
    case 'SET_DISTANCE':
      setHeldDistance(action.value);
      break;
    case 'ADJUST_HEIGHT':
      placement.heightOffset = clamp(placement.heightOffset + action.delta, -2, 4);
      placement.position.y += action.delta;
      syncSliders();
      break;
    case 'SET_HEIGHT': {
      const nextHeight = clamp(action.value, -2, 4);
      placement.position.y += nextHeight - placement.heightOffset;
      placement.heightOffset = nextHeight;
      break;
    }
    case 'ROTATE':
      rotateHeldTube(action.delta);
      break;
    case 'CYCLE_ROTATION_AXIS':
      inferRotationAxis();
      break;
    case 'SET_MODE':
      placement.mode = action.mode;
      break;
    case 'TOGGLE_MAGNETIC_PLANE':
      placement.mode = placement.mode === 'magnetic-plane' ? 'free' : 'magnetic-plane';
      break;
    case 'TOGGLE_PLANE_LOCK':
      placement.mode = placement.mode === 'plane-locked' ? 'magnetic-plane' : 'plane-locked';
      break;
    case 'CONFIRM_PLACE':
      if (placement.active) releaseHeldTube();
      else if (selectedSceneObject) deselectSceneObject();
      else startNewTube();
      break;
    case 'CANCEL_PLACE':
      if (selectedSceneObject && !placement.active) {
        deselectSceneObject();
      } else {
        cancelPlacement();
      }
      break;
    case 'DUPLICATE_SELECTED':
      if (!placement.active && selectedSceneObject) duplicateSelectedSceneObject();
      else startNewTube();
      break;
    default:
      break;
  }
}

function startNewTube() {
  deselectSceneObject();
  placement.active = true;
  placement.source = 'new';
  heldTube.visible = true;
  heldTube.quaternion.identity();
  camera.getWorldDirection(tempDirection);
  placement.position.copy(camera.position).addScaledVector(tempDirection, placement.distanceFromCamera);
  placement.position.y = placement.heightOffset;
  gestureLabel = 'New Tube';
  syncSliders();
}

function selectTube(tube) {
  deselectSceneObject();
  placement.active = true;
  placement.source = 'picked';
  placement.position.copy(tube.position);
  heldTube.quaternion.copy(tube.quaternion);
  heldTube.visible = true;
  placedGroup.remove(tube);
  syncDistanceFromCamera();
  syncSliders();
}

function copyTube(tube) {
  deselectSceneObject();
  placement.active = true;
  placement.source = 'copy';
  placement.position.copy(tube.position);
  heldTube.quaternion.copy(tube.quaternion);
  heldTube.visible = true;
  syncDistanceFromCamera();
  syncSliders();
  gestureLabel = 'Copied';
}

function releaseHeldTube() {
  if (!placement.active) {
    startNewTube();
    return;
  }

  addPlacedTube(placement.position, heldTube.quaternion);
  placement.active = false;
  placement.source = 'picked';
  heldTube.visible = false;
}

function cancelPlacement() {
  if (placement.active && placement.source === 'picked') {
    releaseHeldTube();
    return;
  }

  placement.active = false;
  heldTube.visible = false;
}

function rotateHeldTube(delta) {
  if (!placement.active) return;
  const axis = inferRotationAxis();
  tempQuat.setFromAxisAngle(axis, delta);
  heldTube.quaternion.premultiply(tempQuat);
}

function inferRotationAxis() {
  camera.getWorldDirection(tempDirection);
  const absX = Math.abs(tempDirection.x);
  const absY = Math.abs(tempDirection.y);
  const absZ = Math.abs(tempDirection.z);

  if (absY > absX && absY > absZ) {
    placement.rotationAxis = 'view-y';
    return tempAxis.set(0, 1, 0);
  }

  if (absX > absZ) {
    placement.rotationAxis = 'view-x';
    return tempAxis.set(1, 0, 0);
  }

  placement.rotationAxis = 'view-z';
  return tempAxis.set(0, 0, 1);
}

function setHeldDistance(value) {
  placement.distanceFromCamera = clamp(value, 1, 12);
  if (placement.active) {
    const currentHeight = placement.position.y;
    camera.getWorldDirection(tempDirection);
    placement.position.copy(camera.position).addScaledVector(tempDirection, placement.distanceFromCamera);
    placement.position.y = currentHeight;
  }
  syncSliders();
}

function moveHeldTubeFromMouse(deltaX, deltaY) {
  if (!placement.active) return;
  tempRight.setFromMatrixColumn(camera.matrixWorld, 0);
  tempRight.y = 0;
  tempRight.normalize();
  camera.getWorldDirection(tempForward);
  tempForward.y = 0;
  tempForward.normalize();
  const scale = Math.max(0.004, placement.distanceFromCamera * 0.0016);
  placement.position.addScaledVector(tempRight, deltaX * scale);
  placement.position.addScaledVector(tempForward, -deltaY * scale);
}

function beginHeldTubeDrag(screenX, screenY) {
  if (!placement.active) return;

  dragState.planeNormal.set(0, 1, 0);
  dragPlane.setFromNormalAndCoplanarPoint(dragState.planeNormal, placement.position);
  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
    dragState.offset.copy(placement.position).sub(dragPoint);
    dragState.planeReady = true;
  } else {
    dragState.offset.set(0, 0, 0);
    dragState.planeReady = false;
  }
}

function dragHeldTubeToPointer(screenX, screenY) {
  if (!placement.active || !dragState.planeReady) return false;

  dragPlane.setFromNormalAndCoplanarPoint(dragState.planeNormal, placement.position);
  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return false;

  const currentHeight = placement.position.y;
  placement.position.copy(dragPoint).add(dragState.offset);
  placement.position.y = placement.mode === 'plane-locked' ? 0 : currentHeight;
  return true;
}

function nudgeHeldTube(forwardAmount = 0, rightAmount = 0, y = 0) {
  if (!placement.active) return;
  tempForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  tempRight.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
  placement.position.addScaledVector(tempForward, forwardAmount);
  placement.position.addScaledVector(tempRight, rightAmount);
  placement.position.x = clamp(placement.position.x, -room.width * 0.5, room.width * 0.5);
  placement.position.z = clamp(placement.position.z, -room.depth * 0.5, room.depth * 0.5);
  placement.position.y = clamp(placement.position.y + y, 0, room.height);
  gestureLabel = 'Arrow Nudge';
}

function lookFromDelta(deltaX, deltaY, speed = LOOK_SPEED) {
  yaw -= deltaX * speed;
  pitch -= deltaY * speed;
  applyCameraLook();
}

function handlePrimarySceneTap(screenX, screenY, pointerType = 'mouse') {
  if (placement.active) {
    releaseHeldTube();
    gestureLabel = 'Placed';
  } else {
    const pickedTube = pickTube(screenX, screenY);
    if (pickedTube) {
      deselectSceneObject();
      selectTube(pickedTube);
      gestureLabel = 'Picked';
    } else {
      const pickedObject = pickSceneObject(screenX, screenY);
      if (pickedObject) {
        if (selectedSceneObject === pickedObject) {
          deselectSceneObject();
          gestureLabel = 'Object Released';
        } else {
          selectSceneObject(pickedObject);
        }
      } else if (selectedSceneObject) {
        deselectSceneObject();
        gestureLabel = 'Object Released';
      } else {
        gestureLabel = 'Tap';
      }
    }
  }

  if (pointerType === 'mouse') requestScenePointerLock();
}

function updatePlacement() {
  if (!placement.active) {
    footprint.visible = false;
    projectionLine.visible = false;
    heightHandle.visible = false;
    return;
  }

  placement.projectedPoint.copy(placement.position);
  placement.projectedPoint.y = getSceneSurfaceHeightAt(placement.position.x, placement.position.z);
  placement.planeDistance = placement.position.y - placement.projectedPoint.y;
  placement.magneticActive = false;

  const hasManualHeight = placement.planeDistance > 0.01 || dragState.mode === 'height';
  if (!hasManualHeight && placement.mode === 'magnetic-plane' && Math.abs(placement.planeDistance) < placement.magneticThreshold) {
    placement.position.lerp(placement.projectedPoint, placement.magneticStrength);
    placement.magneticActive = true;
  }

  if (placement.mode === 'plane-locked') {
    placement.position.copy(placement.projectedPoint);
    placement.magneticActive = true;
  }

  placement.projectedPoint.y = getSceneSurfaceHeightAt(placement.position.x, placement.position.z);
  placement.planeDistance = placement.position.y - placement.projectedPoint.y;
  placement.heightOffset = clamp(placement.position.y, -2, 4);

  heldTube.position.copy(placement.position);
  heldTube.visible = true;
  heightHandle.position.copy(placement.position);
  heightHandle.visible = true;

  footprint.position.copy(placement.projectedPoint);
  footprint.rotation.set(-Math.PI / 2, 0, 0);
  footprint.visible = true;
  footprintMaterial.color.set(placement.magneticActive ? 0x3df6b0 : 0x77b7ff);
  footprintMaterial.opacity = placement.mode === 'plane-locked' ? 0.48 : 0.28;

  projectionLine.geometry.setFromPoints([placement.position, placement.projectedPoint]);
  projectionLine.visible = true;

  heldTube.traverse((child) => {
    if (child.material) {
      child.material.opacity = placement.mode === 'plane-locked' ? 0.75 : 0.58;
    }
  });

  syncDistanceFromCamera();
  syncSliders();
}

function updateHud() {
  const pointerLocked = document.pointerLockElement === canvas;
  const objectSelected = selectedSceneObject && !placement.active;
  const hudPosition = objectSelected ? selectedSceneObject.group.position : placement.position;
  document.body.classList.toggle('pointer-locked', pointerLocked);
  document.body.classList.toggle('is-placing', placement.active);
  document.body.classList.toggle('has-selection', objectSelected);
  document.querySelector('#lockCursor').textContent = pointerLocked ? 'Unlock' : 'Lock';
  document.querySelector('#statusValue').textContent = getStatusLabel(pointerLocked);
  document.querySelector('#modeValue').textContent = modeLabels[placement.mode];
  document.querySelector('#distanceValue').textContent = `${placement.distanceFromCamera.toFixed(1)} m`;
  document.querySelector('#heightValue').textContent = `${(objectSelected ? selectedSceneObject.group.position.y : placement.planeDistance).toFixed(1)} m`;
  document.querySelector('#axisValue').textContent = getAxisLabel();
  document.querySelector('#snapValue').textContent = objectSelected ? selectedSceneObject.label : placement.magneticActive ? 'Magnetic active' : 'Idle';
  document.querySelector('#gestureValue').textContent = gestureLabel;
  document.querySelector('#controllerValue').textContent = controllerLabel;
  document.querySelector('#positionValue').textContent = `${objectSelected ? 'Object' : 'Position'} ${formatVec(hudPosition)}`;
  document.querySelector('#planeValue').textContent = objectSelected
    ? `Object height ${selectedSceneObject.height.toFixed(2)} m`
    : `Surface distance ${placement.planeDistance.toFixed(2)} m`;
  document.querySelector('#gamepadValue').textContent = pointerLocked ? 'Pointer lock on' : pointerLockNotice;
  document.querySelector('#selectedObjectValue').textContent = selectedSceneObject
    ? `${selectedSceneObject.label} selected`
    : 'No scene object selected';
  document.querySelector('#place').textContent = objectSelected ? 'Done' : 'Place';

  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === placement.mode);
  });
}

function getStatusLabel(pointerLocked) {
  if (placement.active) return pointerLocked ? 'Tube / Lock' : 'Holding Tube';
  if (selectedSceneObject) return pointerLocked ? 'Object / Lock' : 'Object Selected';
  return pointerLocked ? 'Navigation' : 'Free';
}

function getAxisLabel() {
  if (placement.rotationAxis === 'view-x') return 'View Inferred X';
  if (placement.rotationAxis === 'view-y') return 'View Inferred Y';
  return 'View Inferred Z';
}

function updateCamera(deltaTime) {
  const speed = MOVE_SPEED * deltaTime * (pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight') ? 1.8 : 1);
  tempForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  tempRight.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();

  if (pressedKeys.has('KeyW') || touchMoves.has('forward')) camera.position.addScaledVector(tempForward, speed);
  if (pressedKeys.has('KeyS') || touchMoves.has('back')) camera.position.addScaledVector(tempForward, -speed);
  if (pressedKeys.has('KeyA') || touchMoves.has('left')) camera.position.addScaledVector(tempRight, -speed);
  if (pressedKeys.has('KeyD') || touchMoves.has('right')) camera.position.addScaledVector(tempRight, speed);
  if (pressedKeys.has('Space') || touchMoves.has('up')) camera.position.y += speed;
  if (pressedKeys.has('KeyC') || touchMoves.has('down')) camera.position.y -= speed;
}

function applyCameraLook() {
  pitch = clamp(pitch, -Math.PI * 0.48, Math.PI * 0.48);
  camera.rotation.set(pitch, yaw, 0);
}

function pickTube(screenX = window.innerWidth / 2, screenY = window.innerHeight / 2) {
  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  const intersections = raycaster.intersectObjects(placedGroup.children, true);
  if (intersections.length === 0) return null;
  return intersections[0].object.userData.tubeRoot ?? null;
}

function screenToNdc(screenX, screenY) {
  pickNdc.x = (screenX / window.innerWidth) * 2 - 1;
  pickNdc.y = -(screenY / window.innerHeight) * 2 + 1;
  return pickNdc;
}

function copyTubeUnderReticle(screenX = window.innerWidth / 2, screenY = window.innerHeight / 2) {
  const tube = pickTube(screenX, screenY);
  if (tube) copyTube(tube);
}

function pickHeightHandle(screenX, screenY) {
  if (!placement.active || !heightHandle.visible) return false;
  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  return raycaster.intersectObjects(heightHandle.children, true).length > 0;
}

function applyDeadzone(value) {
  if (Math.abs(value) < GAMEPAD_DEADZONE) return 0;
  return value;
}

function requestScenePointerLock() {
  if (document.pointerLockElement === canvas) return;
  if (typeof canvas.requestPointerLock !== 'function') {
    pointerLockNotice = 'Pointer lock unsupported';
    return;
  }

  try {
    const lockResult = canvas.requestPointerLock();
    pointerLockNotice = 'Pointer lock requested';
    if (lockResult?.catch) {
      lockResult
        .then(() => {
          pointerLockNotice = 'Pointer lock on';
        })
        .catch(() => {
          pointerLockNotice = 'Pointer lock blocked; drag to look';
        });
    }
  } catch {
    pointerLockNotice = 'Pointer lock blocked; drag to look';
  }
}

function updatePinchState() {
  if (activePointers.size < 2) {
    pinchState.active = false;
    gestureLabel = dragState.active ? gestureLabel : 'Idle';
    return;
  }

  const pointers = [...activePointers.values()];
  const first = pointers[0];
  const second = pointers[1];
  const distance = Math.hypot(first.x - second.x, first.y - second.y);
  const centerY = (first.y + second.y) * 0.5;
  const angle = Math.atan2(second.y - first.y, second.x - first.x);

  if (!pinchState.active) {
    pinchState.active = true;
    pinchState.distance = distance;
    pinchState.centerY = centerY;
    pinchState.angle = angle;
    gestureLabel = placement.active ? 'Pinch / Twist' : 'Pinch';
    return;
  }

  const distanceDelta = distance - pinchState.distance;
  const centerDelta = centerY - pinchState.centerY;
  let angleDelta = angle - pinchState.angle;
  if (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
  if (angleDelta < -Math.PI) angleDelta += Math.PI * 2;

  dispatch({ type: 'ADJUST_DISTANCE', delta: distanceDelta * 0.01 });
  dispatch({ type: 'ADJUST_HEIGHT', delta: -centerDelta * 0.006 });
  if (placement.active) rotateHeldTube(angleDelta);
  pinchState.distance = distance;
  pinchState.centerY = centerY;
  pinchState.angle = angle;
  gestureLabel = placement.active ? 'Pinch / Twist' : 'Pinch';
}

function updateGamepad(deltaTime) {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const pad = pads[0];
  if (!pad) {
    controllerLabel = 'Press A to connect';
    return;
  }

  controllerLabel = `${pad.id.replace(/\s+/g, ' ').slice(0, 22)}${pad.mapping ? ' / standard' : ''}`;

  const leftX = applyDeadzone(pad.axes[0] ?? 0);
  const leftY = applyDeadzone(pad.axes[1] ?? 0);
  const rightX = applyDeadzone(pad.axes[2] ?? 0);
  const rightY = applyDeadzone(pad.axes[3] ?? 0);
  const moveSpeed = MOVE_SPEED * deltaTime * 1.15;

  tempForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  tempRight.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
  camera.position.addScaledVector(tempRight, leftX * moveSpeed);
  camera.position.addScaledVector(tempForward, -leftY * moveSpeed);

  if (placement.active) {
    moveHeldTubeFromMouse(rightX * 12, rightY * 12);
    if (Math.abs(rightX) + Math.abs(rightY) > 0) gestureLabel = 'Controller Move';
  } else if (selectedSceneObject) {
    moveSelectedSceneObjectFromMouse(rightX * 12, rightY * 12);
    if (Math.abs(rightX) + Math.abs(rightY) > 0) gestureLabel = 'Controller Object';
  } else {
    lookFromDelta(rightX * 12, rightY * 12, LOOK_SPEED * 1.25);
  }

  const leftTrigger = pad.buttons[6]?.value ?? 0;
  const rightTrigger = pad.buttons[7]?.value ?? 0;
  if (placement.active) {
    if (rightTrigger > GAMEPAD_DEADZONE) dispatch({ type: 'ADJUST_DISTANCE', delta: rightTrigger * 0.035 });
    if (leftTrigger > GAMEPAD_DEADZONE) dispatch({ type: 'ADJUST_HEIGHT', delta: leftTrigger * 0.025 });
    if (pad.buttons[12]?.pressed) dispatch({ type: 'ADJUST_DISTANCE', delta: 0.045 });
    if (pad.buttons[13]?.pressed) dispatch({ type: 'ADJUST_DISTANCE', delta: -0.045 });
    if (pad.buttons[14]?.pressed) dispatch({ type: 'ADJUST_HEIGHT', delta: -0.035 });
    if (pad.buttons[15]?.pressed) dispatch({ type: 'ADJUST_HEIGHT', delta: 0.035 });
    if (pad.buttons[4]?.pressed) dispatch({ type: 'ROTATE', delta: -0.04 });
    if (pad.buttons[5]?.pressed) dispatch({ type: 'ROTATE', delta: 0.04 });
  } else if (selectedSceneObject) {
    if (rightTrigger > GAMEPAD_DEADZONE) nudgeSelectedSceneObject(0, 0, rightTrigger * 0.025);
    if (leftTrigger > GAMEPAD_DEADZONE) nudgeSelectedSceneObject(0, 0, -leftTrigger * 0.025);
    if (pad.buttons[12]?.pressed) nudgeSelectedSceneObject(0.035, 0);
    if (pad.buttons[13]?.pressed) nudgeSelectedSceneObject(-0.035, 0);
    if (pad.buttons[14]?.pressed) nudgeSelectedSceneObject(0, -0.035);
    if (pad.buttons[15]?.pressed) nudgeSelectedSceneObject(0, 0.035);
    if (pad.buttons[4]?.pressed) rotateSelectedSceneObject(-0.04);
    if (pad.buttons[5]?.pressed) rotateSelectedSceneObject(0.04);
  }
  if (pad.buttons[0]?.pressed) maybeOnce('gamepad-place', () => handlePrimarySceneTap(window.innerWidth / 2, window.innerHeight / 2, 'gamepad'));
  if (pad.buttons[1]?.pressed) maybeOnce('gamepad-cancel', () => {
    if (selectedSceneObject && !placement.active) deselectSceneObject();
    else dispatch({ type: 'CANCEL_PLACE' });
  });
  if (pad.buttons[2]?.pressed) maybeOnce('gamepad-copy', () => {
    if (selectedSceneObject && !placement.active) duplicateSelectedSceneObject();
    else copyTubeUnderReticle();
  });
  if (pad.buttons[3]?.pressed) maybeOnce('gamepad-mode', () => dispatch({ type: 'TOGGLE_MAGNETIC_PLANE' }));
  if (pad.buttons[11]?.pressed) maybeOnce('gamepad-lock', () => dispatch({ type: 'TOGGLE_PLANE_LOCK' }));
  if (pad.buttons[9]?.pressed) maybeOnce('gamepad-new', () => startNewTube());
}

const onceState = new Set();
function maybeOnce(key, fn) {
  if (onceState.has(key)) return;
  onceState.add(key);
  fn();
  window.setTimeout(() => onceState.delete(key), 240);
}

function animate() {
  const deltaTime = Math.min(clock.getDelta(), 0.05);
  updateCamera(deltaTime);
  updateGamepad(deltaTime);
  updatePlacement();
  updateSelectedObjectHelper();
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatVec(v) {
  return `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`;
}

function syncDistanceFromCamera() {
  if (!placement.active) return;
  placement.distanceFromCamera = clamp(camera.position.distanceTo(placement.position), 1, 12);
}

function syncSliders() {
  document.querySelector('#distanceSlider').value = placement.distanceFromCamera;
  document.querySelector('#heightSlider').value = placement.heightOffset;
}

function syncRoomInputs() {
  document.querySelector('#roomWidth').value = room.width;
  document.querySelector('#roomDepth').value = room.depth;
  document.querySelector('#roomHeight').value = room.height;
  document.querySelector('#roomSummary').textContent = `Room ${room.width.toFixed(1)} x ${room.depth.toFixed(1)} x ${room.height.toFixed(1)} m`;
}

function syncSceneInputs() {
  const objectLabel = sceneObjects.length === 1 ? 'object' : 'objects';
  document.querySelector('#terrainToggle').checked = terrainSettings.enabled;
  document.querySelector('#terrainState').textContent = terrainSettings.enabled ? 'On' : 'Off';
  document.querySelector('#objectCount').textContent = `${sceneObjects.length} ${objectLabel}`;
  document.querySelector('#sceneSummary').textContent = `Scene ${terrainSettings.enabled ? 'terrain' : 'flat'} · ${sceneObjects.length} ${objectLabel}`;
  document.querySelector('#selectedObjectValue').textContent = selectedSceneObject
    ? `${selectedSceneObject.label} selected`
    : 'No scene object selected';
}

function setRoomDimension(key, value) {
  const limits = key === 'height' ? [1, 10] : [1, 30];
  room[key] = clamp(Number.isFinite(value) ? value : room[key], limits[0], limits[1]);
  rebuildRoomHelpers();
  rebuildTerrain();
  syncSceneObjectHeights();
  syncRoomInputs();
  syncSceneInputs();
}

const overlayPanels = [...document.querySelectorAll('.room-panel, .scene-panel, .debug')];
let overlayPanelSyncing = false;

function closeOverlayPanels(exceptPanel = null) {
  overlayPanels.forEach((panel) => {
    if (panel !== exceptPanel) panel.open = false;
  });
}

overlayPanels.forEach((panel) => {
  panel.addEventListener('toggle', () => {
    if (overlayPanelSyncing || !panel.open) return;
    overlayPanelSyncing = true;
    closeOverlayPanels(panel);
    overlayPanelSyncing = false;
  });
});

document.querySelectorAll('[data-panel-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const panel = document.querySelector(`.${button.dataset.panelToggle}`);
    if (!panel) return;
    const shouldOpen = !panel.open;
    overlayPanelSyncing = true;
    closeOverlayPanels(panel);
    panel.open = shouldOpen;
    overlayPanelSyncing = false;
  });
});

const controlDock = document.querySelector('.control-dock');
const fineControlsButton = document.querySelector('#toggleFineControls');

function setFineControlsOpen(open) {
  controlDock.classList.toggle('fine-open', open);
  fineControlsButton.setAttribute('aria-expanded', String(open));
  fineControlsButton.textContent = open ? 'Hide' : 'Tune';
}

fineControlsButton.addEventListener('click', () => {
  setFineControlsOpen(!controlDock.classList.contains('fine-open'));
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  dispatch({ type: 'AIM', screenX: window.innerWidth / 2, screenY: window.innerHeight / 2 });
});

window.addEventListener('keydown', (event) => {
  pressedKeys.add(event.code);
  const fine = event.altKey ? 0.04 : 0.12;
  const nudgeStep = event.altKey ? 0.01 : event.shiftKey ? 0.1 : 0.05;

  if (event.key === 'Enter') {
    if (placement.active) dispatch({ type: 'CONFIRM_PLACE' });
    else if (selectedSceneObject) deselectSceneObject();
  }
  if (event.key === 'Escape') {
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
      return;
    }
    if (selectedSceneObject && !placement.active) {
      deselectSceneObject();
      gestureLabel = 'Object Released';
      return;
    }
    dispatch({ type: 'CANCEL_PLACE' });
  }
  if (event.key.toLowerCase() === 'q') {
    if (placement.active) dispatch({ type: 'ROTATE', delta: -Math.PI / 18 });
    else rotateSelectedSceneObject(-Math.PI / 18);
  }
  if (event.key.toLowerCase() === 'e') {
    if (placement.active) dispatch({ type: 'ROTATE', delta: Math.PI / 18 });
    else rotateSelectedSceneObject(Math.PI / 18);
  }
  if (event.key.toLowerCase() === 'r') startNewTube();
  if (!placement.active && selectedSceneObject && event.key.toLowerCase() === 'v') {
    event.preventDefault();
    duplicateSelectedSceneObject();
  }
  if (event.key.toLowerCase() === 'm') dispatch({ type: 'TOGGLE_MAGNETIC_PLANE' });
  if (event.key.toLowerCase() === 'l') dispatch({ type: 'TOGGLE_PLANE_LOCK' });
  if (event.key.toLowerCase() === 'z') {
    if (placement.active) dispatch({ type: 'ADJUST_HEIGHT', delta: fine });
    else nudgeSelectedSceneObject(0, 0, fine);
  }
  if (event.key.toLowerCase() === 'x') {
    if (placement.active) dispatch({ type: 'ADJUST_HEIGHT', delta: -fine });
    else nudgeSelectedSceneObject(0, 0, -fine);
  }
  if (!placement.active && selectedSceneObject && (event.key === 'Delete' || event.key === 'Backspace')) {
    event.preventDefault();
    removeSelectedSceneObject();
  }
  if (placement.active && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'ArrowUp') nudgeHeldTube(nudgeStep, 0);
    if (event.key === 'ArrowDown') nudgeHeldTube(-nudgeStep, 0);
    if (event.key === 'ArrowLeft') nudgeHeldTube(0, -nudgeStep);
    if (event.key === 'ArrowRight') nudgeHeldTube(0, nudgeStep);
    if (event.key === 'PageUp') nudgeHeldTube(0, 0, nudgeStep);
    if (event.key === 'PageDown') nudgeHeldTube(0, 0, -nudgeStep);
  }
  if (!placement.active && selectedSceneObject && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'ArrowUp') nudgeSelectedSceneObject(nudgeStep, 0);
    if (event.key === 'ArrowDown') nudgeSelectedSceneObject(-nudgeStep, 0);
    if (event.key === 'ArrowLeft') nudgeSelectedSceneObject(0, -nudgeStep);
    if (event.key === 'ArrowRight') nudgeSelectedSceneObject(0, nudgeStep);
    if (event.key === 'PageUp') nudgeSelectedSceneObject(0, 0, nudgeStep);
    if (event.key === 'PageDown') nudgeSelectedSceneObject(0, 0, -nudgeStep);
  }
});

window.addEventListener('keyup', (event) => {
  pressedKeys.delete(event.code);
});

document.addEventListener('pointerlockchange', () => {
  pointerLockNotice = document.pointerLockElement === canvas ? 'Pointer lock on' : 'Pointer lock off';
});

document.addEventListener('pointerlockerror', () => {
  pointerLockNotice = 'Pointer lock blocked; drag to look';
});

window.addEventListener('gamepadconnected', (event) => {
  controllerLabel = `${event.gamepad.id.replace(/\s+/g, ' ').slice(0, 22)} connected`;
});

window.addEventListener('gamepaddisconnected', () => {
  controllerLabel = 'Disconnected';
});

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();

  if (document.pointerLockElement === canvas) return;

  if (event.pointerType === 'mouse' && event.button === 1) {
    if (!placement.active && selectedSceneObject) {
      duplicateSelectedSceneObject();
    } else {
      copyTubeUnderReticle(event.clientX, event.clientY);
      gestureLabel = 'Middle Copy';
    }
    return;
  }

  canvas.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    pointerType: event.pointerType
  });

  if (activePointers.size === 1) {
    const primaryPointer = event.pointerType !== 'mouse' || event.button === 0;
    const handlePicked = placement.active && primaryPointer
      ? pickHeightHandle(event.clientX, event.clientY)
      : false;
    dragState.active = true;
    dragState.pointerId = event.pointerId;
    dragState.pointerType = event.pointerType;
    dragState.button = event.button;
    dragState.mode = handlePicked
      ? 'height'
      : event.pointerType === 'mouse' && event.button === 2
        ? 'look'
        : !placement.active && selectedSceneObject && primaryPointer
          ? 'object'
          : 'primary';
    dragState.startX = event.clientX;
    dragState.startY = event.clientY;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    dragState.moved = false;
    dragState.planeReady = false;
    if (placement.active && dragState.mode === 'primary') beginHeldTubeDrag(event.clientX, event.clientY);
    if (!placement.active && dragState.mode === 'object') beginSelectedSceneObjectDrag(event.clientX, event.clientY);
  }

  updatePinchState();
});

canvas.addEventListener('pointermove', (event) => {
  if (!activePointers.has(event.pointerId)) return;

  const pointer = activePointers.get(event.pointerId);
  pointer.lastX = pointer.x;
  pointer.lastY = pointer.y;
  pointer.x = event.clientX;
  pointer.y = event.clientY;

  if (activePointers.size >= 2) {
    updatePinchState();
    dragState.moved = true;
    return;
  }

  if (document.pointerLockElement === canvas || !dragState.active || dragState.pointerId !== event.pointerId) return;

  const deltaX = event.clientX - dragState.lastX;
  const deltaY = event.clientY - dragState.lastY;
  dragState.lastX = event.clientX;
  dragState.lastY = event.clientY;

  if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > DRAG_TAP_THRESHOLD) {
    dragState.moved = true;
  }

  if (placement.active) {
    if (dragState.mode === 'height') {
      dispatch({ type: 'ADJUST_HEIGHT', delta: -deltaY * 0.006 });
      gestureLabel = 'Height Handle';
      return;
    }

    if (dragState.mode === 'look') {
      lookFromDelta(deltaX, deltaY);
      gestureLabel = 'Right Look';
      return;
    }

    if (!dragHeldTubeToPointer(event.clientX, event.clientY)) {
      moveHeldTubeFromMouse(deltaX, deltaY);
    }
    gestureLabel = event.pointerType === 'touch' ? 'Drag Tube' : 'Drag Tube';
  } else if (selectedSceneObject && dragState.mode === 'object') {
    if (!dragSelectedSceneObjectToPointer(event.clientX, event.clientY)) {
      moveSelectedSceneObjectFromMouse(deltaX, deltaY);
    }
    gestureLabel = 'Drag Object';
  } else {
    lookFromDelta(deltaX, deltaY, event.pointerType === 'touch' ? TOUCH_LOOK_SPEED : LOOK_SPEED);
    gestureLabel = event.pointerType === 'touch' ? 'Look' : 'Drag Look';
  }
});

canvas.addEventListener('pointerup', (event) => {
  const wasPrimaryDrag = dragState.active && dragState.pointerId === event.pointerId;
  const shouldTap = wasPrimaryDrag && ['primary', 'object'].includes(dragState.mode) && !dragState.moved && activePointers.size === 1;
  const now = performance.now();
  const tapDistance = Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY);
  const isDoubleTap = shouldTap && event.pointerType === 'touch' && now - lastTapAt < 360 && tapDistance < 32;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  activePointers.delete(event.pointerId);
  updatePinchState();

  if (isDoubleTap) {
    handlePrimarySceneTap(event.clientX, event.clientY, event.pointerType);
    gestureLabel = 'Double Tap';
    lastTapAt = 0;
  } else if (shouldTap) {
    handlePrimarySceneTap(event.clientX, event.clientY, event.pointerType);
    lastTapAt = now;
    lastTapX = event.clientX;
    lastTapY = event.clientY;
  }

  if (wasPrimaryDrag) {
    dragState.active = false;
    dragState.pointerId = null;
  }
});

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

canvas.addEventListener('pointercancel', (event) => {
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  activePointers.delete(event.pointerId);
  updatePinchState();
  if (dragState.pointerId === event.pointerId) {
    dragState.active = false;
    dragState.pointerId = null;
  }
});

window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;
  gestureLabel = 'Mouse Look';
  lookFromDelta(event.movementX, event.movementY);
});

canvas.addEventListener('wheel', (event) => {
  if (!placement.active && !selectedSceneObject) return;
  event.preventDefault();
  const direction = event.deltaY > 0 ? -1 : 1;
  if (placement.active) rotateHeldTube(direction * Math.PI / 18);
  else rotateSelectedSceneObject(direction * Math.PI / 18);
}, { passive: false });

document.querySelector('#startPlacement').addEventListener('click', () => startNewTube());
document.querySelector('#lockCursor').addEventListener('click', () => {
  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
    return;
  }

  requestScenePointerLock();
});
document.querySelector('#place').addEventListener('click', () => dispatch({ type: 'CONFIRM_PLACE' }));
document.querySelector('#cancel').addEventListener('click', () => dispatch({ type: 'CANCEL_PLACE' }));
let duplicateCommandHandledAt = 0;
function handleDuplicateCommandEvent(event) {
  if (event.type === 'pointerdown' && event.pointerType === 'mouse' && event.button !== 0) return;
  const hit = 'clientX' in event ? document.elementFromPoint(event.clientX, event.clientY) : null;
  const target = event.target?.closest?.('#duplicate') ?? hit?.closest?.('#duplicate');
  if (!target) return;

  const now = performance.now();
  if (now - duplicateCommandHandledAt < 350) return;
  duplicateCommandHandledAt = now;
  event.preventDefault();
  event.stopPropagation();
  dispatch({ type: 'DUPLICATE_SELECTED' });
}
document.addEventListener('pointerdown', handleDuplicateCommandEvent, true);
document.addEventListener('click', handleDuplicateCommandEvent, true);
document.querySelector('#rotateLeft').addEventListener('click', () => dispatch({ type: 'ROTATE', delta: -Math.PI / 18 }));
document.querySelector('#rotateRight').addEventListener('click', () => dispatch({ type: 'ROTATE', delta: Math.PI / 18 }));
document.querySelector('#cycleAxis').addEventListener('click', () => dispatch({ type: 'CYCLE_ROTATION_AXIS' }));
document.querySelector('#distanceDown').addEventListener('click', () => dispatch({ type: 'ADJUST_DISTANCE', delta: -0.25 }));
document.querySelector('#distanceUp').addEventListener('click', () => dispatch({ type: 'ADJUST_DISTANCE', delta: 0.25 }));
document.querySelector('#heightDown').addEventListener('click', () => dispatch({ type: 'ADJUST_HEIGHT', delta: -0.15 }));
document.querySelector('#heightUp').addEventListener('click', () => dispatch({ type: 'ADJUST_HEIGHT', delta: 0.15 }));
document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => dispatch({ type: 'SET_MODE', mode: button.dataset.mode }));
});
document.querySelector('#distanceSlider').addEventListener('input', (event) => {
  dispatch({ type: 'SET_DISTANCE', value: Number(event.target.value) });
});
document.querySelector('#heightSlider').addEventListener('input', (event) => {
  dispatch({ type: 'SET_HEIGHT', value: Number(event.target.value) });
});
document.querySelector('#roomWidth').addEventListener('input', (event) => {
  setRoomDimension('width', Number(event.target.value));
});
document.querySelector('#roomDepth').addEventListener('input', (event) => {
  setRoomDimension('depth', Number(event.target.value));
});
document.querySelector('#roomHeight').addEventListener('input', (event) => {
  setRoomDimension('height', Number(event.target.value));
});
document.querySelector('#terrainToggle').addEventListener('change', (event) => {
  terrainSettings.enabled = event.target.checked;
  rebuildTerrain();
  syncSceneObjectHeights();
  syncSceneInputs();
  gestureLabel = terrainSettings.enabled ? 'Terrain On' : 'Terrain Off';
});
document.querySelectorAll('[data-add-object]').forEach((button) => {
  button.addEventListener('click', () => addSceneObject(button.dataset.addObject));
});
document.querySelector('#duplicateObject').addEventListener('click', () => {
  if (selectedSceneObject) duplicateSelectedSceneObject();
});
document.querySelector('#clearObjects').addEventListener('click', () => clearSceneObjects());
document.querySelector('#importModel').addEventListener('click', () => {
  document.querySelector('#modelInput').click();
});
document.querySelector('#modelInput').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  await importModelFile(file);
  event.target.value = '';
});
document.querySelectorAll('[data-touch-move]').forEach((button) => {
  const move = button.dataset.touchMove;
  const start = (event) => {
    event.preventDefault();
    touchMoves.add(move);
  };
  const stop = () => touchMoves.delete(move);
  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', stop);
  button.addEventListener('pointerleave', stop);
  button.addEventListener('pointercancel', stop);
});

dispatch({ type: 'AIM', screenX: window.innerWidth / 2, screenY: window.innerHeight / 2 });
rebuildRoomHelpers();
rebuildTerrain();
syncRoomInputs();
syncSceneInputs();
heldTube.visible = false;
placement.active = false;
addPlacedTube(new THREE.Vector3(0, 0, 1.2));
animate();
