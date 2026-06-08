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
const DRAG_PLANE_MIN_ALIGNMENT = 0.08;
const GAMEPAD_DEADZONE = 0.18;
const GAMEPAD_EDIT_SPEED = 1.15;
const HUD_UPDATE_INTERVAL = 1 / 12;
const IMMERSIVE_HEIGHT_SPEED = 0.006;
const STARTER_HINT_DURATION = 7000;

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
const tempMatrix = new THREE.Matrix4();
const tempPixelColor = new THREE.Color();
const selectableTubeHits = [];
const selectableObjectHits = [];
const sceneObjectPickTargets = [];
const dragPlane = new THREE.Plane();
const dragPoint = new THREE.Vector3();
const dragOffset = new THREE.Vector3();
const clock = new THREE.Clock();

const ui = {
  lockCursor: document.querySelector('#lockCursor'),
  toggleGuide: document.querySelector('#toggleGuide'),
  guideHelper: document.querySelector('#guideHelper'),
  guideText: document.querySelector('#guideText'),
  hoverPrompt: document.querySelector('#hoverPrompt'),
  starterHint: document.querySelector('#starterHint'),
  statusValue: document.querySelector('#statusValue'),
  modeValue: document.querySelector('#modeValue'),
  heightValue: document.querySelector('#heightValue'),
  axisValue: document.querySelector('#axisValue'),
  snapValue: document.querySelector('#snapValue'),
  gestureValue: document.querySelector('#gestureValue'),
  controllerValue: document.querySelector('#controllerValue'),
  positionValue: document.querySelector('#positionValue'),
  planeValue: document.querySelector('#planeValue'),
  gamepadValue: document.querySelector('#gamepadValue'),
  selectedObjectValue: document.querySelector('#selectedObjectValue'),
  place: document.querySelector('#place'),
  startPlacement: document.querySelector('#startPlacement'),
  cancel: document.querySelector('#cancel'),
  duplicate: document.querySelector('#duplicate'),
  rotateLeft: document.querySelector('#rotateLeft'),
  rotateRight: document.querySelector('#rotateRight'),
  cycleAxis: document.querySelector('#cycleAxis'),
  heightDown: document.querySelector('#heightDown'),
  heightUp: document.querySelector('#heightUp'),
  heightSlider: document.querySelector('#heightSlider'),
  roomWidth: document.querySelector('#roomWidth'),
  roomDepth: document.querySelector('#roomDepth'),
  roomHeight: document.querySelector('#roomHeight'),
  roomSummary: document.querySelector('#roomSummary'),
  terrainToggle: document.querySelector('#terrainToggle'),
  terrainState: document.querySelector('#terrainState'),
  objectCount: document.querySelector('#objectCount'),
  sceneSummary: document.querySelector('#sceneSummary'),
  duplicateObject: document.querySelector('#duplicateObject'),
  clearObjects: document.querySelector('#clearObjects'),
  importModel: document.querySelector('#importModel'),
  modelInput: document.querySelector('#modelInput'),
  controlDock: document.querySelector('.control-dock'),
  fineControlsButton: document.querySelector('#toggleFineControls'),
  modeButtons: [...document.querySelectorAll('[data-mode]')],
  overlayPanels: [...document.querySelectorAll('.room-panel, .scene-panel, .debug')],
  panelToggleButtons: [...document.querySelectorAll('[data-panel-toggle]')],
  addObjectButtons: [...document.querySelectorAll('[data-add-object]')],
  touchMoveButtons: [...document.querySelectorAll('[data-touch-move]')]
};

const sceneObjects = [];
let sceneObjectId = 0;
let selectedSceneObject = null;
let selectedObjectHelperDirty = false;

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
const projectionLinePositions = new Float32Array(6);
const lineGeometry = new THREE.BufferGeometry();
lineGeometry.setAttribute('position', new THREE.BufferAttribute(projectionLinePositions, 3));
const projectionLine = new THREE.Line(lineGeometry, lineMaterial);
projectionLine.frustumCulled = false;
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
  const geometries = new Set();
  const materials = new Set();
  object.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => materials.add(material));
    } else if (child.material) {
      materials.add(child.material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function clearObjectGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject(child);
  }
}

function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function setValue(element, value) {
  const nextValue = String(value);
  if (element.value !== nextValue) element.value = nextValue;
}

function setChecked(element, checked) {
  if (element.checked !== checked) element.checked = checked;
}

function isEditableElement(element) {
  return element?.matches?.('input, textarea, select, [contenteditable="true"]') ?? false;
}

function hasActiveEditTarget() {
  return placement.active || Boolean(selectedSceneObject);
}

function getActiveEditTargetPosition() {
  if (placement.active) return placement.position;
  return selectedSceneObject?.group.position ?? null;
}

function hideStarterHint() {
  if (ui.starterHint) ui.starterHint.hidden = true;
}

function updateProjectionLine(start, end) {
  projectionLinePositions[0] = start.x;
  projectionLinePositions[1] = start.y;
  projectionLinePositions[2] = start.z;
  projectionLinePositions[3] = end.x;
  projectionLinePositions[4] = end.y;
  projectionLinePositions[5] = end.z;
  lineGeometry.attributes.position.needsUpdate = true;
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
  object.pickTargets = [];
  group.traverse((child) => {
    if (child.isMesh) {
      child.userData.sceneObject = object;
      object.pickTargets.push(child);
      child.castShadow = true;
      child.receiveShadow = true;
      if (!child.material) {
        child.material = new THREE.MeshStandardMaterial({ color: 0x83909a, roughness: 0.78 });
      }
    } else {
      delete child.userData.sceneObject;
    }
  });
}

function updateSceneObjectBounds(object) {
  object.bounds ??= new THREE.Box3();
  object.bounds.setFromObject(object.group);
  const size = object.bounds.getSize(tempObjectSize);
  object.width = Math.max(size.x, 0.05);
  object.depth = Math.max(size.z, 0.05);
  object.height = Math.max(size.y, object.height ?? 0.05);
  object.footprint = {
    x: Math.max(size.x * 0.5, object.radius ?? 0.03),
    z: Math.max(size.z * 0.5, object.radius ?? 0.03)
  };
}

function measureSceneObject(object) {
  updateSceneObjectBounds(object);
}

function registerSceneObject(object, { select = false } = {}) {
  object.id = sceneObjectId;
  sceneObjectId += 1;
  object.baseOffset ??= 0;
  object.snapSurface ??= true;
  prepareSceneObjectMeshes(object.group, object);
  sceneObjectGroup.add(object.group);
  sceneObjects.push(object);
  sceneObjectPickTargets.push(...object.pickTargets);
  measureSceneObject(object);
  clampSceneObjectToRoom(object);
  syncSceneInputs();
  if (select) selectSceneObject(object);
  return object;
}

function getObjectFootprint(object) {
  if (!object.footprint) updateSceneObjectBounds(object);
  return object.footprint;
}

function clampSceneObjectToRoom(object) {
  const footprint = getObjectFootprint(object);
  const maxX = Math.max(0, room.width * 0.5 - footprint.x);
  const maxZ = Math.max(0, room.depth * 0.5 - footprint.z);
  object.group.position.x = clamp(object.group.position.x, -maxX, maxX);
  object.group.position.z = clamp(object.group.position.z, -maxZ, maxZ);
  object.baseOffset = clamp(object.baseOffset ?? 0, 0, room.height);
  object.group.position.y = getTerrainHeightAt(object.group.position.x, object.group.position.z) + object.baseOffset;
  updateSceneObjectBounds(object);
  if (object === selectedSceneObject) selectedObjectHelperDirty = true;
}

function syncSceneObjectHeights() {
  sceneObjects.forEach(clampSceneObjectToRoom);
  selectedObjectHelperDirty = true;
}

function getObjectTopAt(object, x, z) {
  if (!object.snapSurface) return null;
  if (!object.bounds) updateSceneObjectBounds(object);

  if (
    x < object.bounds.min.x
    || x > object.bounds.max.x
    || z < object.bounds.min.z
    || z > object.bounds.max.z
  ) {
    return null;
  }

  return object.bounds.max.y;
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
  sceneObjectPickTargets.length = 0;
  clearObjectGroup(sceneObjectGroup);
  gestureLabel = 'Clear Objects';
  syncSceneInputs();
}

function selectSceneObject(object) {
  if (!object) return;
  clearHoverSelection();
  if (placement.active) cancelPlacement();
  selectedSceneObject = object;
  selectedObjectHelperDirty = true;
  updateSelectedObjectHelper();
  selectedObjectHelper.visible = true;
  gestureLabel = 'Object Selected';
  syncSceneInputs();
}

function deselectSceneObject() {
  selectedSceneObject = null;
  selectedObjectHelperDirty = false;
  selectedObjectHelper.visible = false;
  syncSceneInputs();
}

function updateSelectedObjectHelper() {
  if (!selectedSceneObject) {
    selectedObjectHelper.visible = false;
    return;
  }

  if (!selectedObjectHelperDirty) return;
  selectedObjectBox.setFromObject(selectedSceneObject.group);
  selectedObjectHelper.visible = true;
  selectedObjectHelper.updateMatrixWorld(true);
  selectedObjectHelperDirty = false;
}

function pickSceneObject(screenX = window.innerWidth / 2, screenY = window.innerHeight / 2) {
  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  const intersections = raycaster.intersectObjects(sceneObjectPickTargets, false);
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

function moveSelectedSceneObjectToReticle() {
  if (!selectedSceneObject) return false;
  const point = getReticleGroundPoint();
  selectedSceneObject.group.position.x = point.x;
  selectedSceneObject.group.position.z = point.z;
  clampSceneObjectToRoom(selectedSceneObject);
  selectedObjectHelperDirty = true;
  gestureLabel = 'Immersive Move';
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
  object.pickTargets?.forEach((target) => {
    const pickIndex = sceneObjectPickTargets.indexOf(target);
    if (pickIndex >= 0) sceneObjectPickTargets.splice(pickIndex, 1);
  });
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
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color().setHSL(0.52, 0.72, ghost ? 0.18 : 0.12),
    roughness: 0.48,
    metalness: 0.12,
    transparent: ghost,
    opacity: ghost ? 0.58 : 1,
    vertexColors: true
  });
  const pixels = new THREE.InstancedMesh(geometry, material, PIXEL_COUNT);

  for (let i = 0; i < PIXEL_COUNT; i += 1) {
    tempMatrix.makeTranslation(0, i * PIXEL_SPACING + PIXEL_SPACING * 0.5, 0);
    pixels.setMatrixAt(i, tempMatrix);
    pixels.setColorAt(i, tempPixelColor.setHSL(0.52 + i * 0.006, 0.72, ghost ? 0.58 : 0.68));
  }

  pixels.instanceMatrix.needsUpdate = true;
  if (pixels.instanceColor) pixels.instanceColor.needsUpdate = true;
  pixels.castShadow = true;
  pixels.receiveShadow = true;
  pixels.userData.tubeRoot = group;
  group.add(pixels);
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
let heldTubeOpacity = null;
scene.add(heldTube);

function createHeightHandle() {
  const group = new THREE.Group();
  const createHandleMaterial = (color, opacity = 0.9) => new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false
  });
  const yMaterial = createHandleMaterial(0x3df6b0, 0.9);
  const xMaterial = createHandleMaterial(0xff6b6b, 0.88);
  const zMaterial = createHandleMaterial(0x62a8ff, 0.88);
  const hubMaterial = createHandleMaterial(0xeaf7f3, 0.72);

  const setAxis = (object, axis) => {
    object.userData.gizmoAxis = axis;
    object.traverse?.((child) => {
      child.userData.gizmoAxis = axis;
    });
  };

  const hubX = 0.28;
  const hubY = TUBE_LENGTH * 0.5;

  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, TUBE_LENGTH + 0.38, 10), yMaterial);
  rail.position.set(hubX, hubY, 0);
  setAxis(rail, 'y');

  const top = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 16), yMaterial);
  top.position.set(hubX, TUBE_LENGTH + 0.28, 0);
  setAxis(top, 'y');

  const bottom = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 16), yMaterial);
  bottom.position.set(hubX, -0.12, 0);
  bottom.rotation.z = Math.PI;
  setAxis(bottom, 'y');

  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), hubMaterial);
  hub.position.set(hubX, hubY, 0);
  setAxis(hub, 'y');

  const xRail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 10), xMaterial);
  xRail.position.set(hubX + 0.21, hubY, 0);
  xRail.rotation.z = Math.PI / 2;
  setAxis(xRail, 'x');

  const xTip = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.13, 16), xMaterial);
  xTip.position.set(hubX + 0.48, hubY, 0);
  xTip.rotation.z = -Math.PI / 2;
  setAxis(xTip, 'x');

  const zRail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 10), zMaterial);
  zRail.position.set(hubX, hubY, 0.21);
  zRail.rotation.x = Math.PI / 2;
  setAxis(zRail, 'z');

  const zTip = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.13, 16), zMaterial);
  zTip.position.set(hubX, hubY, 0.48);
  zTip.rotation.x = Math.PI / 2;
  setAxis(zTip, 'z');

  group.add(rail, top, bottom, hub, xRail, xTip, zRail, zTip);
  return group;
}

const heightHandle = createHeightHandle();
heightHandle.visible = false;
scene.add(heightHandle);

function setHeldTubeOpacity(opacity) {
  if (heldTubeOpacity === opacity) return;
  heldTubeOpacity = opacity;
  heldTube.traverse((child) => {
    if (child.material) child.material.opacity = opacity;
  });
}

const modeLabels = {
  free: 'Free',
  'magnetic-plane': 'Magnetic Plane',
  'plane-locked': 'Plane Locked'
};

const placement = {
  active: true,
  source: 'new',
  mode: 'magnetic-plane',
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
  gizmoAxis: null,
  planeNormal: new THREE.Vector3(),
  offset: new THREE.Vector3(),
  axisVector: new THREE.Vector3(),
  startPoint: new THREE.Vector3(),
  startPosition: new THREE.Vector3()
};
const pinchState = {
  active: false,
  distance: 0,
  centerY: 0,
  angle: 0
};
let pointerLockNotice = 'Editor mode';
let gestureLabel = 'Idle';
let controllerLabel = 'Press A to connect';
let lastTapAt = 0;
let lastTapX = 0;
let lastTapY = 0;
let hudUpdateElapsed = HUD_UPDATE_INTERVAL;
let immersiveMode = false;
let immersiveHeightAdjusting = false;
let guideEnabled = false;
let helperTooltip = '';
const hoverSelection = {
  type: null,
  target: null,
  label: '',
  x: 0,
  y: 0
};

function dispatch(action) {
  switch (action.type) {
    case 'AIM':
      aimNdc.x = (action.screenX / window.innerWidth) * 2 - 1;
      aimNdc.y = -(action.screenY / window.innerHeight) * 2 + 1;
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
  placement.heightOffset = 0;
  const spawnPoint = getReticleGroundPoint();
  placement.position.copy(spawnPoint);
  placement.position.y = getSceneSurfaceHeightAt(spawnPoint.x, spawnPoint.z);
  gestureLabel = 'New Tube';
  syncSliders();
}

function selectTube(tube) {
  clearHoverSelection();
  deselectSceneObject();
  placement.active = true;
  placement.source = 'picked';
  placement.position.copy(tube.position);
  heldTube.quaternion.copy(tube.quaternion);
  heldTube.visible = true;
  placedGroup.remove(tube);
  disposeObject(tube);
  syncSliders();
}

function copyTube(tube) {
  clearHoverSelection();
  deselectSceneObject();
  placement.active = true;
  placement.source = 'copy';
  placement.position.copy(tube.position);
  heldTube.quaternion.copy(tube.quaternion);
  heldTube.visible = true;
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

function moveHeldTubeFromMouse(deltaX, deltaY) {
  if (!placement.active) return;
  tempRight.setFromMatrixColumn(camera.matrixWorld, 0);
  tempRight.y = 0;
  tempRight.normalize();
  camera.getWorldDirection(tempForward);
  tempForward.y = 0;
  tempForward.normalize();
  const distance = clamp(camera.position.distanceTo(placement.position), 1, 6);
  const scale = Math.max(0.003, distance * 0.0011);
  placement.position.addScaledVector(tempRight, deltaX * scale);
  placement.position.addScaledVector(tempForward, -deltaY * scale);
  clampHeldTubeToRoom();
}

function moveHeldTubeFromController(axisX, axisY, deltaTime) {
  if (!placement.active) return false;
  if (Math.abs(axisX) + Math.abs(axisY) <= 0) return false;
  const amount = GAMEPAD_EDIT_SPEED * deltaTime;
  nudgeHeldTube(-axisY * amount, axisX * amount);
  gestureLabel = 'Controller Move';
  return true;
}

function beginHeldTubeDrag(screenX, screenY) {
  if (!placement.active) return;

  dragState.planeNormal.set(0, 1, 0);
  dragPlane.setFromNormalAndCoplanarPoint(dragState.planeNormal, placement.position);
  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  if (Math.abs(raycaster.ray.direction.dot(dragState.planeNormal)) < DRAG_PLANE_MIN_ALIGNMENT) {
    dragState.offset.set(0, 0, 0);
    dragState.planeReady = false;
    return;
  }
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
  if (Math.abs(raycaster.ray.direction.dot(dragState.planeNormal)) < DRAG_PLANE_MIN_ALIGNMENT) return false;
  if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return false;

  const currentHeight = placement.position.y;
  placement.position.copy(dragPoint).add(dragState.offset);
  placement.position.y = placement.mode === 'plane-locked' ? 0 : currentHeight;
  clampHeldTubeToRoom();
  return true;
}

function beginGizmoAxisDrag(axis, screenX, screenY) {
  const targetPosition = getActiveEditTargetPosition();
  if (!targetPosition || !axis) return;

  dragState.gizmoAxis = axis;
  dragState.startPosition.copy(targetPosition);
  if (axis === 'x') dragState.axisVector.set(1, 0, 0);
  if (axis === 'z') dragState.axisVector.set(0, 0, 1);

  camera.getWorldDirection(dragState.planeNormal);
  dragPlane.setFromNormalAndCoplanarPoint(dragState.planeNormal, targetPosition);
  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
    dragState.startPoint.copy(dragPoint);
    dragState.planeReady = true;
  } else {
    dragState.planeReady = false;
  }
}

function dragGizmoAxisToPointer(screenX, screenY) {
  if (!hasActiveEditTarget() || !dragState.planeReady || !dragState.gizmoAxis) return false;

  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return false;

  dragState.offset.copy(dragPoint).sub(dragState.startPoint);
  const amount = dragState.offset.dot(dragState.axisVector);
  const nextPosition = tempSpawnPoint.copy(dragState.startPosition).addScaledVector(dragState.axisVector, amount);

  if (placement.active) {
    const currentHeight = placement.position.y;
    placement.position.copy(nextPosition);
    placement.position.y = currentHeight;
    clampHeldTubeToRoom();
  } else if (selectedSceneObject) {
    selectedSceneObject.group.position.x = nextPosition.x;
    selectedSceneObject.group.position.z = nextPosition.z;
    clampSceneObjectToRoom(selectedSceneObject);
    updateSelectedObjectHelper();
  }

  return true;
}

function clampHeldTubeToRoom() {
  placement.position.x = clamp(placement.position.x, -room.width * 0.5, room.width * 0.5);
  placement.position.z = clamp(placement.position.z, -room.depth * 0.5, room.depth * 0.5);
  placement.position.y = clamp(placement.position.y, 0, room.height);
}

function nudgeHeldTube(forwardAmount = 0, rightAmount = 0, y = 0) {
  if (!placement.active) return;
  tempForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  tempRight.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
  placement.position.addScaledVector(tempForward, forwardAmount);
  placement.position.addScaledVector(tempRight, rightAmount);
  placement.position.y += y;
  clampHeldTubeToRoom();
  gestureLabel = 'Arrow Nudge';
}

function adjustActiveTargetHeight(delta) {
  if (placement.active) {
    placement.position.y += delta;
    clampHeldTubeToRoom();
    syncSliders();
    gestureLabel = 'Immersive Height';
    return true;
  }

  if (selectedSceneObject) {
    selectedSceneObject.baseOffset = (selectedSceneObject.baseOffset ?? 0) + delta;
    clampSceneObjectToRoom(selectedSceneObject);
    updateSelectedObjectHelper();
    gestureLabel = 'Immersive Height';
    return true;
  }

  return false;
}

function pickHeldTube(screenX, screenY) {
  if (!placement.active || !heldTube.visible) return false;
  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  return raycaster.intersectObjects(heldTube.children, true).length > 0;
}

function moveHeldTubeToReticle() {
  if (!placement.active) return false;
  const currentSurface = getSceneSurfaceHeightAt(placement.position.x, placement.position.z);
  const heightAboveSurface = placement.position.y - currentSurface;
  const point = getReticleGroundPoint();
  const targetSurface = getSceneSurfaceHeightAt(point.x, point.z);
  placement.position.x = point.x;
  placement.position.z = point.z;
  placement.position.y = placement.mode === 'plane-locked' ? targetSurface : targetSurface + heightAboveSurface;
  clampHeldTubeToRoom();
  gestureLabel = 'Immersive Move';
  return true;
}

function updateImmersiveReticleTarget() {
  if (document.pointerLockElement !== canvas) return;
  if (placement.active) {
    moveHeldTubeToReticle();
  } else if (selectedSceneObject) {
    moveSelectedSceneObjectToReticle();
  }
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
}

function updatePlacement() {
  if (!placement.active) {
    footprint.visible = false;
    projectionLine.visible = false;
    return;
  }

  clampHeldTubeToRoom();
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

  clampHeldTubeToRoom();
  placement.projectedPoint.y = getSceneSurfaceHeightAt(placement.position.x, placement.position.z);
  placement.planeDistance = placement.position.y - placement.projectedPoint.y;
  placement.heightOffset = clamp(placement.position.y, -2, 4);

  heldTube.position.copy(placement.position);
  heldTube.visible = true;

  footprint.position.copy(placement.projectedPoint);
  footprint.rotation.set(-Math.PI / 2, 0, 0);
  footprint.visible = true;
  footprintMaterial.color.set(placement.magneticActive ? 0x3df6b0 : 0x77b7ff);
  footprintMaterial.opacity = placement.mode === 'plane-locked' ? 0.48 : 0.28;

  updateProjectionLine(placement.position, placement.projectedPoint);
  projectionLine.visible = true;

  setHeldTubeOpacity(placement.mode === 'plane-locked' ? 0.75 : 0.58);

  syncSliders();
}

function updateEditGizmo() {
  if (document.pointerLockElement === canvas || !hasActiveEditTarget()) {
    heightHandle.visible = false;
    return;
  }

  if (placement.active) {
    heightHandle.position.copy(placement.position);
    heightHandle.visible = true;
    return;
  }

  if (selectedSceneObject) {
    const footprint = getObjectFootprint(selectedSceneObject);
    heightHandle.position.copy(selectedSceneObject.group.position);
    heightHandle.position.x += footprint.x;
    heightHandle.visible = true;
  }
}

function updateHud() {
  const pointerLocked = document.pointerLockElement === canvas;
  const objectSelected = selectedSceneObject && !placement.active;
  const hudPosition = objectSelected ? selectedSceneObject.group.position : placement.position;
  document.body.classList.toggle('pointer-locked', pointerLocked);
  document.body.classList.toggle('immersive-mode', immersiveMode);
  document.body.classList.toggle('is-placing', placement.active);
  document.body.classList.toggle('has-selection', objectSelected);
  setText(ui.lockCursor, pointerLocked ? 'Editor' : 'Immersive');
  setText(ui.statusValue, getStatusLabel(pointerLocked));
  setText(ui.modeValue, modeLabels[placement.mode]);
  setText(ui.heightValue, `${(objectSelected ? selectedSceneObject.group.position.y : placement.planeDistance).toFixed(1)} m`);
  setText(ui.axisValue, getAxisLabel());
  setText(ui.snapValue, objectSelected ? selectedSceneObject.label : placement.magneticActive ? 'Magnetic active' : 'Idle');
  setText(ui.gestureValue, gestureLabel);
  setText(ui.controllerValue, controllerLabel);
  setText(ui.positionValue, `${objectSelected ? 'Object' : 'Position'} ${formatVec(hudPosition)}`);
  setText(ui.planeValue, objectSelected
    ? `Object height ${selectedSceneObject.height.toFixed(2)} m`
    : `Surface distance ${placement.planeDistance.toFixed(2)} m`);
  setText(ui.gamepadValue, pointerLocked ? 'Immersive mode on' : pointerLockNotice);
  setText(ui.selectedObjectValue, selectedSceneObject
    ? `${selectedSceneObject.label} selected`
    : 'No scene object selected');
  setText(ui.place, objectSelected ? 'Done' : 'Place');
  updateGuideText(pointerLocked);

  ui.modeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === placement.mode);
  });
}

function getStatusLabel(pointerLocked) {
  if (pointerLocked) return placement.active ? 'Immersive / Tube' : 'Immersive';
  if (placement.active) return 'Holding Tube';
  if (selectedSceneObject) return 'Object Selected';
  return 'Editor';
}

function getAxisLabel() {
  if (placement.rotationAxis === 'view-x') return 'View Inferred X';
  if (placement.rotationAxis === 'view-y') return 'View Inferred Y';
  return 'View Inferred Z';
}

function getGuideMessage(pointerLocked) {
  if (helperTooltip) return helperTooltip;

  if (hoverSelection.target && !placement.active && !selectedSceneObject) {
    return `Press E to pick up this ${hoverSelection.label}.`;
  }

  if (placement.active && pointerLocked) {
    return 'Aim with the reticle. The tube follows X/Z; hold right mouse and move up/down for height.';
  }

  if (selectedSceneObject && pointerLocked) {
    return 'Aim with the reticle. Hold right mouse and move up/down for height; press E or click to release.';
  }

  if (pointerLocked) {
    return 'Immersive mode: WASD moves, mouse looks, N adds a tube at the reticle, E or click picks/places.';
  }

  if (placement.active) {
    return 'Drag the tube for X/Z, use the height handle or PageUp/PageDown for height, Q/R or wheel to rotate.';
  }

  if (selectedSceneObject) {
    return 'Drag the object or side gizmo, use arrows to nudge, Q/R to rotate, E or Enter to release.';
  }

  return 'Press I for Immersive, H for helper, or N to add a tube. Hover a target and press E to pick it up.';
}

function updateGuideText(pointerLocked = document.pointerLockElement === canvas) {
  if (!guideEnabled || !ui.guideText) return;
  setText(ui.guideText, getGuideMessage(pointerLocked));
}

function setGuideEnabled(enabled) {
  hideStarterHint();
  guideEnabled = enabled;
  if (ui.guideHelper) ui.guideHelper.hidden = !enabled;
  if (ui.toggleGuide) {
    ui.toggleGuide.setAttribute('aria-pressed', String(enabled));
    ui.toggleGuide.classList.toggle('active', enabled);
  }
  updateGuideText();
}

function setHelperTooltip(text = '') {
  helperTooltip = text;
  updateGuideText();
}

function setHelp(element, text) {
  if (!element) return;
  element.dataset.help = text;
}

function registerHelperTooltips() {
  setHelp(ui.startPlacement, 'Add a new 150 cm LED tube. Shortcut: N. In Immersive it appears at the center reticle.');
  setHelp(ui.lockCursor, 'Toggle Immersive mode. Shortcut: I. Immersive captures the cursor for game-style movement.');
  setHelp(ui.toggleGuide, 'Toggle this helper overlay. Shortcut: H.');
  setHelp(ui.place, 'Place/release the active tube or finish the selected object. Shortcut: E or Enter.');
  setHelp(ui.cancel, 'Drop the active edit. For picked tubes, this places it back into the scene. Shortcut: Esc.');
  setHelp(ui.duplicate, 'Copy the active tube or duplicate the selected object.');
  setHelp(ui.fineControlsButton, 'Show or hide fine controls for height and rotation.');
  setHelp(ui.heightSlider, 'Set tube height above the current surface. The side green handle and PageUp/PageDown do the same.');
  setHelp(ui.heightDown, 'Lower the active tube.');
  setHelp(ui.heightUp, 'Raise the active tube.');
  setHelp(ui.rotateLeft, 'Rotate left. Shortcut: Q.');
  setHelp(ui.rotateRight, 'Rotate right. Shortcut: R.');
  setHelp(ui.cycleAxis, 'Cycle the wheel rotation axis inferred from the camera view.');
  setHelp(ui.roomWidth, 'Room width in meters. The green boundary box and metric grid update immediately.');
  setHelp(ui.roomDepth, 'Room depth in meters. The green boundary box and metric grid update immediately.');
  setHelp(ui.roomHeight, 'Room height in meters. Tubes and objects are clamped inside this height.');
  setHelp(ui.terrainToggle, 'Toggle a procedural terrain surface. Tubes can snap to it in Magnetic and Plane modes.');
  setHelp(ui.duplicateObject, 'Duplicate the selected scene object. Shortcut: V.');
  setHelp(ui.clearObjects, 'Remove all scene objects from the room.');
  setHelp(ui.importModel, 'Import a GLB, GLTF, or OBJ as room/stage/furniture context.');

  ui.modeButtons.forEach((button) => {
    const modeHelp = {
      free: 'Free mode disables surface snapping.',
      'magnetic-plane': 'Magnetic mode gently snaps tubes to nearby terrain/object surfaces.',
      'plane-locked': 'Plane mode locks tubes directly onto the sampled surface.'
    };
    setHelp(button, modeHelp[button.dataset.mode]);
  });

  ui.panelToggleButtons.forEach((button) => {
    setHelp(button, `${button.textContent.trim()} panel: open or close related setup controls.`);
  });

  ui.addObjectButtons.forEach((button) => {
    setHelp(button, `Add a ${button.textContent.trim()} scene object. It can be selected, moved, and used as a tube snap surface.`);
  });

  ui.touchMoveButtons.forEach((button) => {
    setHelp(button, `Touch camera move: ${button.textContent.trim()}.`);
  });

  document.querySelectorAll('summary').forEach((summary) => {
    setHelp(summary, `${summary.textContent.trim()} panel: click to open or close.`);
  });

  const handleHelpEnter = (event) => {
    const target = event.target.closest?.('[data-help]');
    if (!target) return;
    setHelperTooltip(target.dataset.help);
  };

  const handleHelpLeave = (event) => {
    const target = event.target.closest?.('[data-help]');
    if (!target) return;
    if (event.relatedTarget?.closest?.('[data-help]') === target) return;
    setHelperTooltip('');
  };

  document.addEventListener('pointerover', handleHelpEnter);
  document.addEventListener('mouseover', handleHelpEnter);
  document.addEventListener('pointerout', handleHelpLeave);
  document.addEventListener('mouseout', handleHelpLeave);
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

function pickSelectable(screenX = window.innerWidth / 2, screenY = window.innerHeight / 2) {
  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  selectableTubeHits.length = 0;
  selectableObjectHits.length = 0;
  raycaster.intersectObjects(placedGroup.children, true, selectableTubeHits);
  raycaster.intersectObjects(sceneObjectPickTargets, false, selectableObjectHits);

  const tubeHit = selectableTubeHits.find((hit) => hit.object.userData.tubeRoot);
  const objectHit = selectableObjectHits.find((hit) => hit.object.userData.sceneObject);

  if (tubeHit && (!objectHit || tubeHit.distance <= objectHit.distance)) {
    return {
      type: 'tube',
      target: tubeHit.object.userData.tubeRoot,
      label: 'Tube'
    };
  }

  if (objectHit) {
    const object = objectHit.object.userData.sceneObject;
    return {
      type: 'object',
      target: object,
      label: object.label
    };
  }

  return null;
}

function clearHoverSelection() {
  hoverSelection.type = null;
  hoverSelection.target = null;
  hoverSelection.label = '';
  hoverSelection.x = 0;
  hoverSelection.y = 0;
  if (ui.hoverPrompt) ui.hoverPrompt.hidden = true;
}

function updateHoverSelection(screenX, screenY, pointerType = 'mouse') {
  if (
    pointerType === 'touch'
    || document.pointerLockElement === canvas
    || placement.active
    || selectedSceneObject
  ) {
    clearHoverSelection();
    return;
  }

  const selection = pickSelectable(screenX, screenY);
  if (!selection) {
    clearHoverSelection();
    return;
  }

  hoverSelection.type = selection.type;
  hoverSelection.target = selection.target;
  hoverSelection.label = selection.label;
  hoverSelection.x = screenX;
  hoverSelection.y = screenY;
  if (ui.hoverPrompt) {
    setText(ui.hoverPrompt, `E Pick ${selection.label}`);
    ui.hoverPrompt.style.transform = `translate(${Math.round(screenX + 12)}px, ${Math.round(screenY + 12)}px)`;
    ui.hoverPrompt.hidden = false;
  }
}

function pickSelectableTarget(selection) {
  if (!selection?.target) return false;
  const { type, target, label } = selection;

  if (type === 'tube') {
    selectTube(target);
    gestureLabel = 'E Pick Tube';
    return true;
  }

  if (type === 'object') {
    selectSceneObject(target);
    gestureLabel = `E Pick ${label}`;
    return true;
  }

  return false;
}

function interactWithSelection(screenX = hoverSelection.x, screenY = hoverSelection.y) {
  if (placement.active) {
    releaseHeldTube();
    gestureLabel = 'E Place';
    return true;
  }

  if (selectedSceneObject) {
    deselectSceneObject();
    gestureLabel = 'E Release';
    return true;
  }

  if (hoverSelection.target && pickSelectableTarget(hoverSelection)) {
    clearHoverSelection();
    return true;
  }

  const selection = pickSelectable(screenX, screenY);
  const picked = pickSelectableTarget(selection);
  if (picked) clearHoverSelection();
  return picked;
}

function copyTubeUnderReticle(screenX = window.innerWidth / 2, screenY = window.innerHeight / 2) {
  const tube = pickTube(screenX, screenY);
  if (tube) copyTube(tube);
}

function pickGizmoHandle(screenX, screenY) {
  if (!hasActiveEditTarget() || !heightHandle.visible) return null;
  raycaster.setFromCamera(screenToNdc(screenX, screenY), camera);
  const intersections = raycaster.intersectObjects(heightHandle.children, true);
  return intersections[0]?.object.userData.gizmoAxis ?? null;
}

function applyDeadzone(value) {
  if (Math.abs(value) < GAMEPAD_DEADZONE) return 0;
  return value;
}

function requestImmersiveMode() {
  hideStarterHint();
  if (document.pointerLockElement === canvas) return;
  if (typeof canvas.requestPointerLock !== 'function') {
    pointerLockNotice = 'Immersive unsupported';
    immersiveMode = false;
    return;
  }

  try {
    const lockResult = canvas.requestPointerLock();
    immersiveMode = true;
    pointerLockNotice = 'Immersive requested';
    if (lockResult?.catch) {
      lockResult
        .then(() => {
          immersiveMode = true;
          pointerLockNotice = 'Immersive mode on';
        })
        .catch(() => {
          immersiveMode = false;
          pointerLockNotice = 'Immersive blocked; use right drag';
        });
    }
  } catch {
    immersiveMode = false;
    pointerLockNotice = 'Immersive blocked; use right drag';
  }
}

function toggleImmersiveMode() {
  hideStarterHint();
  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
    return;
  }

  requestImmersiveMode();
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

  const centerDelta = centerY - pinchState.centerY;
  let angleDelta = angle - pinchState.angle;
  if (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
  if (angleDelta < -Math.PI) angleDelta += Math.PI * 2;

  dispatch({ type: 'ADJUST_HEIGHT', delta: -centerDelta * 0.006 });
  if (placement.active) rotateHeldTube(angleDelta);
  pinchState.distance = distance;
  pinchState.centerY = centerY;
  pinchState.angle = angle;
  gestureLabel = placement.active ? 'Pinch / Twist' : 'Pinch';
}

function updateGamepad(deltaTime) {
  const pads = navigator.getGamepads?.();
  let pad = null;
  if (pads) {
    for (let i = 0; i < pads.length; i += 1) {
      if (pads[i]) {
        pad = pads[i];
        break;
      }
    }
  }

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

  const leftTrigger = pad.buttons[6]?.value ?? 0;
  const rightTrigger = pad.buttons[7]?.value ?? 0;
  const hasEditableTarget = placement.active || selectedSceneObject;
  const editMoveHeld = hasEditableTarget && leftTrigger > GAMEPAD_DEADZONE;
  const editHeightHeld = hasEditableTarget && rightTrigger > GAMEPAD_DEADZONE;

  if (editMoveHeld) {
    if (placement.active) {
      moveHeldTubeFromController(rightX, rightY, deltaTime);
    } else if (selectedSceneObject && Math.abs(rightX) + Math.abs(rightY) > 0) {
      const amount = GAMEPAD_EDIT_SPEED * deltaTime;
      nudgeSelectedSceneObject(-rightY * amount, rightX * amount);
      gestureLabel = 'Controller Object';
    }
  } else if (editHeightHeld) {
    const heightDelta = -rightY * GAMEPAD_EDIT_SPEED * deltaTime;
    if (Math.abs(rightY) > GAMEPAD_DEADZONE) {
      if (placement.active) {
        dispatch({ type: 'ADJUST_HEIGHT', delta: heightDelta });
        gestureLabel = 'Controller Height';
      } else if (selectedSceneObject) {
        nudgeSelectedSceneObject(0, 0, heightDelta);
      }
    }
  } else {
    lookFromDelta(rightX * 12, rightY * 12, LOOK_SPEED * 1.25);
  }

  if (placement.active) {
    if (pad.buttons[12]?.pressed) nudgeHeldTube(0.035, 0);
    if (pad.buttons[13]?.pressed) nudgeHeldTube(-0.035, 0);
    if (pad.buttons[14]?.pressed) nudgeHeldTube(0, -0.035);
    if (pad.buttons[15]?.pressed) nudgeHeldTube(0, 0.035);
    if (pad.buttons[4]?.pressed) dispatch({ type: 'ROTATE', delta: -0.04 });
    if (pad.buttons[5]?.pressed) dispatch({ type: 'ROTATE', delta: 0.04 });
  } else if (selectedSceneObject) {
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
  updateImmersiveReticleTarget();
  updatePlacement();
  updateSelectedObjectHelper();
  updateEditGizmo();
  hudUpdateElapsed += deltaTime;
  if (hudUpdateElapsed >= HUD_UPDATE_INTERVAL) {
    updateHud();
    hudUpdateElapsed = 0;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatVec(v) {
  return `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`;
}

function syncSliders() {
  if (document.activeElement !== ui.heightSlider) setValue(ui.heightSlider, placement.heightOffset);
}

function syncRoomInputs() {
  setValue(ui.roomWidth, room.width);
  setValue(ui.roomDepth, room.depth);
  setValue(ui.roomHeight, room.height);
  setText(ui.roomSummary, `Room ${room.width.toFixed(1)} x ${room.depth.toFixed(1)} x ${room.height.toFixed(1)} m`);
}

function syncSceneInputs() {
  const objectLabel = sceneObjects.length === 1 ? 'object' : 'objects';
  setChecked(ui.terrainToggle, terrainSettings.enabled);
  setText(ui.terrainState, terrainSettings.enabled ? 'On' : 'Off');
  setText(ui.objectCount, `${sceneObjects.length} ${objectLabel}`);
  setText(ui.sceneSummary, `Scene ${terrainSettings.enabled ? 'terrain' : 'flat'} · ${sceneObjects.length} ${objectLabel}`);
  setText(ui.selectedObjectValue, selectedSceneObject
    ? `${selectedSceneObject.label} selected`
    : 'No scene object selected');
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

let overlayPanelSyncing = false;

function closeOverlayPanels(exceptPanel = null) {
  ui.overlayPanels.forEach((panel) => {
    if (panel !== exceptPanel) panel.open = false;
  });
}

ui.overlayPanels.forEach((panel) => {
  panel.addEventListener('toggle', () => {
    if (overlayPanelSyncing || !panel.open) return;
    overlayPanelSyncing = true;
    closeOverlayPanels(panel);
    overlayPanelSyncing = false;
  });
});

ui.panelToggleButtons.forEach((button) => {
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

function setFineControlsOpen(open) {
  ui.controlDock.classList.toggle('fine-open', open);
  ui.fineControlsButton.setAttribute('aria-expanded', String(open));
  setText(ui.fineControlsButton, open ? 'Hide' : 'Tune');
}

ui.fineControlsButton.addEventListener('click', () => {
  setFineControlsOpen(!ui.controlDock.classList.contains('fine-open'));
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  dispatch({ type: 'AIM', screenX: window.innerWidth / 2, screenY: window.innerHeight / 2 });
});

window.addEventListener('keydown', (event) => {
  if (isEditableElement(event.target)) return;
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
  if (event.key.toLowerCase() === 'i') {
    event.preventDefault();
    toggleImmersiveMode();
    return;
  }
  if (event.key.toLowerCase() === 'h') {
    event.preventDefault();
    hideStarterHint();
    setGuideEnabled(!guideEnabled);
    return;
  }
  if (event.key.toLowerCase() === 'q') {
    if (placement.active) dispatch({ type: 'ROTATE', delta: -Math.PI / 18 });
    else rotateSelectedSceneObject(-Math.PI / 18);
  }
  if (event.key.toLowerCase() === 'e') {
    if (event.repeat) {
      event.preventDefault();
      return;
    }
    const screenX = document.pointerLockElement === canvas ? window.innerWidth / 2 : hoverSelection.x || window.innerWidth / 2;
    const screenY = document.pointerLockElement === canvas ? window.innerHeight / 2 : hoverSelection.y || window.innerHeight / 2;
    if (interactWithSelection(screenX, screenY)) {
      event.preventDefault();
      return;
    }
  }
  if (event.key.toLowerCase() === 'r') {
    if (placement.active) dispatch({ type: 'ROTATE', delta: Math.PI / 18 });
    else rotateSelectedSceneObject(Math.PI / 18);
  }
  if (event.key.toLowerCase() === 'n') startNewTube();
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
  immersiveMode = document.pointerLockElement === canvas;
  pointerLockNotice = immersiveMode ? 'Immersive mode on' : 'Editor mode';
  immersiveHeightAdjusting = false;
  clearHoverSelection();
});

document.addEventListener('pointerlockerror', () => {
  immersiveMode = false;
  immersiveHeightAdjusting = false;
  pointerLockNotice = 'Immersive blocked; use right drag';
  clearHoverSelection();
});

window.addEventListener('gamepadconnected', (event) => {
  controllerLabel = `${event.gamepad.id.replace(/\s+/g, ' ').slice(0, 22)} connected`;
});

window.addEventListener('gamepaddisconnected', () => {
  controllerLabel = 'Disconnected';
});

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  clearHoverSelection();

  if (document.pointerLockElement === canvas) {
    if (event.pointerType === 'mouse' && event.button === 0) {
      handlePrimarySceneTap(window.innerWidth / 2, window.innerHeight / 2, 'immersive');
    } else if (event.pointerType === 'mouse' && event.button === 2 && hasActiveEditTarget()) {
      immersiveHeightAdjusting = true;
      gestureLabel = 'Immersive Height';
    } else if (event.pointerType === 'mouse' && event.button === 1) {
      copyTubeUnderReticle();
      gestureLabel = 'Reticle Copy';
    }
    return;
  }

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
    const gizmoAxis = hasActiveEditTarget() && primaryPointer
      ? pickGizmoHandle(event.clientX, event.clientY)
      : null;
    const heldTubePicked = placement.active && primaryPointer
      ? pickHeldTube(event.clientX, event.clientY)
      : false;
    const selectedObjectPicked = !placement.active && selectedSceneObject && primaryPointer
      ? pickSceneObject(event.clientX, event.clientY) === selectedSceneObject
      : false;
    const placedTubePicked = !placement.active && primaryPointer
      ? !!pickTube(event.clientX, event.clientY)
      : false;
    const touchLookZone = event.pointerType === 'touch' && event.clientX > window.innerWidth * 0.46;
    dragState.active = true;
    dragState.pointerId = event.pointerId;
    dragState.pointerType = event.pointerType;
    dragState.button = event.button;
    dragState.mode = gizmoAxis === 'y'
      ? 'height'
      : gizmoAxis
        ? 'gizmo-axis'
        : event.pointerType === 'mouse' && event.button === 2
          ? 'look'
          : touchLookZone && !heldTubePicked && !selectedObjectPicked && !placedTubePicked
            ? 'look'
            : !placement.active && selectedObjectPicked
              ? 'object'
              : !placement.active && primaryPointer
                ? 'primary'
                : placement.active && (heldTubePicked || event.pointerType === 'mouse')
                  ? 'primary'
                  : 'look';
    dragState.startX = event.clientX;
    dragState.startY = event.clientY;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    dragState.moved = false;
    dragState.planeReady = false;
    dragState.gizmoAxis = gizmoAxis;
    if (hasActiveEditTarget() && dragState.mode === 'gizmo-axis') beginGizmoAxisDrag(gizmoAxis, event.clientX, event.clientY);
    if (placement.active && dragState.mode === 'primary') beginHeldTubeDrag(event.clientX, event.clientY);
    if (!placement.active && dragState.mode === 'object') beginSelectedSceneObjectDrag(event.clientX, event.clientY);
  }

  updatePinchState();
});

canvas.addEventListener('pointermove', (event) => {
  if (!activePointers.has(event.pointerId)) {
    updateHoverSelection(event.clientX, event.clientY, event.pointerType);
    return;
  }
  clearHoverSelection();

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

  if (hasActiveEditTarget() && dragState.mode === 'height') {
    adjustActiveTargetHeight(-deltaY * IMMERSIVE_HEIGHT_SPEED);
    gestureLabel = 'Gizmo Y';
    return;
  }

  if (hasActiveEditTarget() && dragState.mode === 'gizmo-axis') {
    if (dragGizmoAxisToPointer(event.clientX, event.clientY)) {
      gestureLabel = `Gizmo ${dragState.gizmoAxis.toUpperCase()}`;
    }
    return;
  }

  if (placement.active) {
    if (dragState.mode === 'look') {
      lookFromDelta(deltaX, deltaY, event.pointerType === 'touch' ? TOUCH_LOOK_SPEED : LOOK_SPEED);
      gestureLabel = 'Right Look';
      return;
    }

    if (dragState.mode !== 'primary') return;

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
  if (document.pointerLockElement === canvas) {
    if (event.pointerType === 'mouse' && event.button === 2) {
      immersiveHeightAdjusting = false;
      gestureLabel = hasActiveEditTarget() ? 'Immersive Move' : gestureLabel;
    }
    return;
  }

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
    dragState.gizmoAxis = null;
  }
});

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

canvas.addEventListener('pointerleave', (event) => {
  if (!activePointers.has(event.pointerId)) clearHoverSelection();
});

canvas.addEventListener('pointercancel', (event) => {
  clearHoverSelection();
  immersiveHeightAdjusting = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  activePointers.delete(event.pointerId);
  updatePinchState();
  if (dragState.pointerId === event.pointerId) {
    dragState.active = false;
    dragState.pointerId = null;
    dragState.gizmoAxis = null;
  }
});

window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;
  if ((immersiveHeightAdjusting || (event.buttons & 2) !== 0) && hasActiveEditTarget()) {
    adjustActiveTargetHeight(-event.movementY * IMMERSIVE_HEIGHT_SPEED);
    if (event.movementX !== 0) lookFromDelta(event.movementX, 0, LOOK_SPEED * 0.72);
    return;
  }
  gestureLabel = 'Mouse Look';
  lookFromDelta(event.movementX, event.movementY);
});

window.addEventListener('mousedown', (event) => {
  if (document.pointerLockElement === canvas && event.button === 2 && hasActiveEditTarget()) {
    immersiveHeightAdjusting = true;
    gestureLabel = 'Immersive Height';
  }
});

window.addEventListener('mouseup', (event) => {
  if (document.pointerLockElement === canvas && event.button === 2) {
    immersiveHeightAdjusting = false;
  }
});

canvas.addEventListener('wheel', (event) => {
  if (!placement.active && !selectedSceneObject) return;
  event.preventDefault();
  const direction = event.deltaY > 0 ? -1 : 1;
  if (placement.active) rotateHeldTube(direction * Math.PI / 18);
  else rotateSelectedSceneObject(direction * Math.PI / 18);
}, { passive: false });

ui.startPlacement.addEventListener('click', () => startNewTube());
ui.lockCursor.addEventListener('click', () => toggleImmersiveMode());
ui.toggleGuide.addEventListener('click', () => setGuideEnabled(!guideEnabled));
ui.place.addEventListener('click', () => dispatch({ type: 'CONFIRM_PLACE' }));
ui.cancel.addEventListener('click', () => dispatch({ type: 'CANCEL_PLACE' }));
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
ui.rotateLeft.addEventListener('click', () => dispatch({ type: 'ROTATE', delta: -Math.PI / 18 }));
ui.rotateRight.addEventListener('click', () => dispatch({ type: 'ROTATE', delta: Math.PI / 18 }));
ui.cycleAxis.addEventListener('click', () => dispatch({ type: 'CYCLE_ROTATION_AXIS' }));
ui.heightDown.addEventListener('click', () => dispatch({ type: 'ADJUST_HEIGHT', delta: -0.15 }));
ui.heightUp.addEventListener('click', () => dispatch({ type: 'ADJUST_HEIGHT', delta: 0.15 }));
ui.modeButtons.forEach((button) => {
  button.addEventListener('click', () => dispatch({ type: 'SET_MODE', mode: button.dataset.mode }));
});
ui.heightSlider.addEventListener('input', (event) => {
  dispatch({ type: 'SET_HEIGHT', value: Number(event.target.value) });
});
ui.roomWidth.addEventListener('input', (event) => {
  setRoomDimension('width', Number(event.target.value));
});
ui.roomDepth.addEventListener('input', (event) => {
  setRoomDimension('depth', Number(event.target.value));
});
ui.roomHeight.addEventListener('input', (event) => {
  setRoomDimension('height', Number(event.target.value));
});
ui.terrainToggle.addEventListener('change', (event) => {
  terrainSettings.enabled = event.target.checked;
  rebuildTerrain();
  syncSceneObjectHeights();
  syncSceneInputs();
  gestureLabel = terrainSettings.enabled ? 'Terrain On' : 'Terrain Off';
});
ui.addObjectButtons.forEach((button) => {
  button.addEventListener('click', () => addSceneObject(button.dataset.addObject));
});
ui.duplicateObject.addEventListener('click', () => {
  if (selectedSceneObject) duplicateSelectedSceneObject();
});
ui.clearObjects.addEventListener('click', () => clearSceneObjects());
ui.importModel.addEventListener('click', () => {
  ui.modelInput.click();
});
ui.modelInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  await importModelFile(file);
  event.target.value = '';
});
ui.touchMoveButtons.forEach((button) => {
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

registerHelperTooltips();
window.setTimeout(hideStarterHint, STARTER_HINT_DURATION);
dispatch({ type: 'AIM', screenX: window.innerWidth / 2, screenY: window.innerHeight / 2 });
rebuildRoomHelpers();
rebuildTerrain();
syncRoomInputs();
syncSceneInputs();
heldTube.visible = false;
placement.active = false;
addPlacedTube(new THREE.Vector3(0, 0, 1.2));
animate();
