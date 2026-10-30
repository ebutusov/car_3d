# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A three.js app (Vite, plain ES modules, no framework or TypeScript) showing an approximate Porsche Cayenne-style SUV, built entirely in code. Interactive parts: doors, bonnet, tailgate, steering, wheel roll, paint, lights. The car sits in a procedural outdoor plaza with day/sunset/overcast/night lighting. The user chose a procedural approximation over a downloaded model, so there are no external assets: every mesh and texture is generated in code (CanvasTexture etc.).

Code style: indent with tabs and use descriptive variable names.

## Commands

```bash
npm run dev                  # Vite on http://localhost:5173 (index.html = app, car-test.html, env-test.html)
npm run build                # production build
npm test                     # tests/interaction.mjs — end-to-end checks; needs the dev server on :5173
node tests/carViews.mjs side,front,rear,top,persp,persp2 ["open=hood,tailgate&steer=0.5"]
                             # car-only renders via car-test.html → tests/screenshots/car-*.png
node tests/shot.mjs <name> "<query>" "<js to eval before capture>"
                             # one app screenshot, e.g. "quality=high&preset=night"
node tests/app.mjs low day,night   # app screenshots per preset + state dump
node tests/env-screenshots.mjs     # environment harness; expects `npx vite --port 5199 --strictPort`
```

URL params for `index.html`: `?quality=low|high` and `?preset=day|sunset|overcast|night`. Low quality has no bloom and uses smaller shadow and reflection maps; tests use it.

### Testing environment quirks

- **No system Chrome, no root.** Tests use Playwright's bundled Chromium with SwiftShader WebGL.
- **Missing libraries.** Chromium's shared libraries were extracted from .deb packages into `~/.cache/ms-playwright/local-libs`. `tests/browser.mjs` (`launchBrowser`, `collectErrors`) sets `LD_LIBRARY_PATH` and the SwiftShader flags. Every new test script should launch through it. `tests/env-screenshots.mjs` imports `chromium` directly, so export `LD_LIBRARY_PATH` yourself before running it.
- **Using real Chrome.** Set `PW_CHANNEL=chrome` when Google Chrome is installed (`sudo npx playwright install chrome`).
- **Rendering is ~1 fps.**
  - Use long timeouts (`page.setDefaultTimeout(240000)`).
  - Wait on frame counts (`window.app.getFrameCount()`), not wall-clock time.
  - Preset changes rebuild the PMREM synchronously, so a click can block for more than 30 s.
- **Don't edit `src/` while a test runs.** Vite HMR reloads the page and the test fails with `window.app` undefined.
- **Always look at the screenshots** (Read the PNGs). State assertions don't catch visual breakage.

## Architecture

### Coordinate contract (shared by all modules)
- Y is up, units are metres, and the car faces +X with its centre over the origin. Left is -Z: left-hand drive, driver at z = -0.38.
- The environment keeps x ∈ [-9, 9], z ∈ [-7, 7] flat and clear around the car.

### Car (`src/car/`)
The body is a **parametric surface**, not a mesh asset.

- **`shape.js`**
  - Monotone-cubic "tracks" over x (floor, width, belt, glass-base width, rail width and height, crown) define each cross-section.
  - A half section is a Hermite curve through fixed `S_KEYS` values of `s ∈ [0,1]` (0 = bottom centre, 1 = roof centre). The full loop uses `sigma ∈ [0,2]`: >1 is the mirrored -Z side.
  - The wheel arches are part of the section: `lowerEdgeHeight` takes a smooth max of the floor and the arch circles.
  - The loft spans `X_REAR..X_FRONT` and is closed at each end by a rounded fillet ring (`filletPoint`) and a flat end-face polygon (`endFaceOutline`).
  - Keep end sections convex (rail ≥ belt near the ends). Otherwise the fillet inset folds and the end face fails to triangulate, and the face silently disappears.
- **`surfaceBuilder.js`**
  - `sampleGrid` evaluates a parametric function with analytic normals from finite differences, so seams between patches shade continuously.
  - `gridGeometry(grid, classify)` emits per-cell material groups.
    - `classify(a, b)` returns a material key or `null` to skip the cell.
    - Sample arrays must contain every region boundary (`buildSamples(..., breaks)`) so no cell straddles two regions.
    - Descending sample arrays flip the winding; this is handled automatically.
  - Inner shells use a negative `offset` with BackSide `interior` material. `gridRibbonGeometry` builds the panel edge thickness.
  - `projectDecal` raycasts a grid onto existing meshes to make conforming decals: lights, grilles, plates.
    - It is BVH-accelerated through `three-mesh-bvh` (`accelerateRaycasts`).
    - `shape(a, b)` maps the grid to plane coordinates; `roundedShape` uses a polar grid so edges stay smooth.
    - Pieces are grouped by the hit object, so decals landing on a moving panel get re-parented to its hinge.
- **`body.js`**
  - `OPENINGS` defines each door, bonnet and tailgate as an (x-range, s-range) rectangle on the loft (plus fillet or face pieces).
  - The shell skips those cells, and each opening is built as its own grid inset by `GAP_X`/`GAP_S`, which produces the panel gaps.
  - `loftMaterialKey(x, s)` decides paint, glass, trim, satin chrome or black gloss regions (windows and pillars by x-range).
  - Each opening is wrapped by `createHinge`: geometry is translated by minus the pivot, the group sits at the pivot, and `userData {partName, axis, openAngle, openAmount, target}` drives it.
- **`details.js`** places lights, intakes, plates, mirrors, handles, rails, spoiler and exhausts after the body exists, mostly via `projectDecal`/`castOnto`. Mirrors and handles are attached to the door hinges.
- **`wheels.js`**: per-wheel hierarchy is mount → steer (Y rotation, front wheels only) → facing (left wheels rotated π) → spin. Calipers sit on `facing`, so they steer but don't spin.
- **`index.js`** is the public API (`createCar`):
  - `setOpen/toggle/isOpen/getOpenAmount`
  - `setSteer` (Ackermann geometry; the steering wheel turns by `STEERING_RATIO`)
  - `setWheelSpeed`, `setPaint`, `setPaintFinish`
  - `setLights('auto'|'on'|'off')`, `setNightFactor`
  - `setExposure`, `partFromObject`, `update(dt)`

### Environment (`src/environment.js`, `src/env/`)
`createEnvironment({scene, renderer, quality})` owns the sky, sun and moon (the **only** shadow-casting light), the hemisphere light, fog, `scene.environment` (a PMREM rebuild that is throttled while sliders move) and the props. Its API: `setPreset`, `setTimeOfDay`, `setCloudiness`, `nightFactor`, `onChange`.

Two things other code must respect:
- **It overwrites `renderer.toneMappingExposure`**: about 0.1 at noon and 1.35 at night. Lights use large absolute units to match. Car emissives are therefore tuned for exposure 1, and `car.setExposure(exposure)` rescales them every frame. Keep that coupling when adding emissive materials, and add them to `applyLights` in `car/index.js`.
- **Don't set `scene.background`**, and keep `camera.far` ≥ 1500.

### App shell
- **`src/main.js`** wires everything together:
  - renderer (ACES, sRGB, PCF shadows) and the composer: RenderPass → UnrealBloom → OutputPass, high quality only.
  - Bloom threshold and strength scale with `nightFactor`, so bloom is mostly a night effect.
  - The UI in `index.html`/`style.css`, click-picking on doors via raycasting with BVH and `firstHitOnly`, hover labels, and keyboard shortcuts.
  - Shortcuts are ignored only for text inputs; sliders and selects are blurred so keys keep working.
- **`window.app`** exposes the test hooks: `getState()`, `projectPart(name)`, `getFrameCount()`, `goToView`, `setPaint`, `setSteerDegrees`, `setRollSpeed`, `setLightMode`, `rig`, `car`, `environment`.
- **`src/cameraRig.js`** has two modes:
  - orbit: OrbitControls; `WASD` pans the target and `Q`/`E` dolly.
  - walk: `WASD`/`Q`/`E` movement, drag-to-look, with pointer lock when available.
  - `flyTo` animates between preset views.

### Test harness pages
- **`car-test.html` + `src/carTest.js`**: the car alone under RoomEnvironment, with orthographic/perspective `?view=`, `open=`, `steer=` and `lights=` params. Use it to iterate on the body shape.
- **`env-test.html` + `src/env-test.js`**: the environment alone with a placeholder box (`window.envTest`).
