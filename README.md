# LED Forest 3D Placement Prototype

Interactive prototype for exploring 3D placement workflows for the next version of LED Forest. The prototype focuses on placing DMX LED tube fixtures in a metric 3D room, mapping fixtures spatially, and testing interaction patterns for desktop, mobile, and controller input.

This is not production software. It is a design and interaction testbed intended for fast feedback.

## Features

- 3D metric room with configurable width, depth, and height.
- 10 cm grid with 1 m major grid lines.
- 150 cm LED tube fixtures rendered as 24 voxel pixels.
- Camera movement with WASD, mouse look, touch controls, and basic Xbox controller support.
- Fixture placement with magnetic surface snapping, height handles, camera-relative arrow-key nudging, and view-inferred rotation.
- Terrain toggle plus simple scene objects: riser, wall, and column.
- Scene object selection, dragging, nudging, height adjustment, rotation, duplication, and deletion.
- GLB, GLTF, and OBJ import for real room/stage/truss/furniture context models.

## Quick Start

Requirements:

- Node.js 18 or newer
- npm

Install dependencies:

```bash
npm install
```

Run the prototype:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5174/
```

For phone or tablet testing on the same Wi-Fi, open the laptop's LAN address with the same port, for example:

```text
http://192.168.178.40:5174/
```

The app intentionally uses port `5174` because `5173` is often occupied by other Vite projects. The dev server binds to `0.0.0.0` so other devices on the LAN can reach it.

## Scripts

```bash
npm run dev
npm run build
npm run preview
```

## Basic Testing Flow

1. Open the app and click `New Tube`.
2. Drag the tube with left mouse button; movement should stay on the X/Z plane.
3. Use the vertical handle beside the tube to adjust height.
4. Use arrow keys to nudge the tube relative to the current camera angle.
5. Toggle terrain in the Scene panel and add riser, wall, and column objects.
6. Click scene objects to select them, then move, rotate, duplicate, or delete them.
7. Import a GLB, GLTF, or OBJ file to test real context geometry.

More detailed instructions are in [docs/USAGE.md](docs/USAGE.md).

## Context

The prototype is inspired by the LED Forest project by Bildspur and explores a future interaction model for spatial fixture placement and 3D content mapping.

Reference project:

- https://github.com/bildspur/led-forest3

## Known Limitations

- Imported models are visual context by default, not snap surfaces.
- GLTF files with external texture/bin dependencies may not resolve unless packaged as GLB.
- Scene objects are simple context geometry, not full CAD/BIM objects.
- No persistence/export format is implemented yet.
- Gamepad support is a prototype mapping and should be tested on actual hardware.
