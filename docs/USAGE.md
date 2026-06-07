# Usage Guide

This guide is for testers evaluating the interaction model.

## Running Locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5174/`.

For mobile testing on the same Wi-Fi, open the laptop's LAN address with the same port. On the current network that is:

```text
http://192.168.178.40:5174/
```

If port `5174` is already in use, edit the `dev` script in `package.json` or run Vite manually with another port.

## Navigation

Keyboard and mouse:

- `W`, `A`, `S`, `D`: move camera relative to view direction.
- Drag with right mouse button: look around.
- `Lock Cursor`: requests browser pointer lock for game-like mouse movement.
- `Esc`: releases pointer lock or cancels the current active edit.

Mobile:

- Use the touch navigation pad for basic camera movement.
- Drag on the right side of the scene to look around, even while building.
- Drag the active tube/object itself to move it on the X/Z plane.
- Drag the vertical tube handle to adjust height.
- Two-finger vertical movement adjusts height, and twist rotates the active tube.

Controller:

- Xbox-style controller mappings are included for early testing.
- Left stick moves the camera.
- Right stick looks around by default.
- Hold `LT` and use the right stick to move the active tube/object on X/Z.
- Hold `RT` and use the right stick vertically to adjust height.

## Placing LED Tubes

Click `New Tube` to create an active LED tube.

Tube behavior:

- Tubes are vertical by default.
- One tube is 150 cm long.
- A tube contains 24 pixel voxels.
- The tube is rendered without end caps.

Controls:

- Left-drag the active tube: move it on the X/Z plane.
- Height handle: drag the vertical arrow handle beside the tube to adjust height.
- Arrow keys: nudge relative to the camera angle.
- `Shift` + arrow keys: 10 cm nudges.
- `Alt` + arrow keys: 1 cm nudges.
- `PageUp` / `PageDown`: raise/lower active tube.
- Mouse wheel: rotate around the view-inferred axis.
- `Q` / `E`: rotate left/right.
- `Enter` or `Place`: commit the tube.
- `Esc` or `Cancel`: cancel placement.

Placement modes:

- `Free`: no snapping.
- `Magnetic`: gently snaps to the nearest sampled scene surface when near it.
- `Plane`: locks to the sampled scene surface.

## Room and Metric Grid

Use the Room panel to edit:

- Width
- Depth
- Height

The grid is metric:

- Minor grid: 10 cm
- Major grid: 1 m

The green boundary box represents the configured room size.

## Terrain and Scene Objects

Use the Scene panel to add context geometry.

Terrain:

- Toggle `Terrain` to add a procedural uneven floor surface.
- Active tubes snap to terrain in Magnetic and Plane modes.

Built-in objects:

- `Riser`
- `Wall`
- `Column`

Scene object controls:

- Click object: select.
- Click selected object again or click empty space: release.
- Left-drag the selected object body: move object on X/Z plane.
- Arrow keys: nudge relative to camera angle.
- `PageUp` / `PageDown`: raise/lower object.
- `Q` / `E`: rotate object around vertical axis.
- `V` or Scene panel `Duplicate`: duplicate selected object.
- `Delete`: remove selected object.
- `Clear`: remove all scene objects.

Built-in objects can act as snap surfaces for tubes. Imported models are visual context only by default.

## Importing Models

Use `Import` in the Scene panel.

Supported formats:

- `.glb`
- `.gltf`
- `.obj`

Recommendations:

- Prefer GLB for testing because it packages geometry, materials, and textures into one file.
- For GLTF, external `.bin` or texture files may not resolve in this prototype.
- Imported models are normalized to fit inside the room.
- Imported models can be selected, moved, rotated, duplicated, and deleted.

## Feedback Checklist

When testing, note:

- Does fixture dragging feel predictable?
- Does height manipulation feel discoverable?
- Does camera-relative arrow movement match expectations?
- Does terrain/object snapping feel useful or surprising?
- Which controls feel natural on mobile?
- Which controls feel natural with an Xbox controller?
- Should imported room/stage models be snap surfaces, visual-only context, or configurable?

## Current Prototype Gaps

- No save/load state.
- No DMX patching or fixture addressing.
- No fixture export format.
- No 3D content playback yet.
- No collision avoidance.
- No object hierarchy or locking.
- Imported model snapping is intentionally disabled until there is a better surface-selection model.
