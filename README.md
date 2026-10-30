# Cayenne 3D

An interactive, approximate Porsche Cayenne-style SUV built procedurally in three.js and placed in an outdoor plaza. There are no downloaded models or textures: the body, wheels, interior and scene are all generated in code.

## Run

```bash
npm install
npm run dev          # open http://localhost:5173
```

Add `?quality=low` to the URL on slow machines. It turns off bloom and uses smaller shadow and reflection maps.

## What you can do

- **Doors, bonnet, tailgate:** click them on the car, use the panel buttons, or press `1`–`4`, `H`, `T`. `O` opens or closes everything.
- **Wheels:**
  - Steering: hold `←`/`→` or use the slider. The front wheels follow Ackermann geometry and the steering wheel turns with them.
  - Rolling speed: `↑`/`↓` or the slider.
- **Paint:** 12 preset colours, a custom picker, and metallic / solid gloss / satin finishes. `P` cycles the colours.
- **Lighting:**
  - Day, sunset, overcast and night presets, a time-of-day slider and a cloud slider.
  - `N` toggles day and night.
  - Headlights are auto, on or off; `L` cycles them. In auto they come on at dusk.
- **Camera:**
  - **Orbit:** left-drag rotates, right-drag pans, the wheel zooms, `WASD` pans and `Q`/`E` zoom.
  - **Walk/fly** (`V`): drag or click to capture the mouse and look around, `WASD` moves, `Q`/`E` go down/up, `Shift` runs.
  - Preset views include the driver's seat and the engine bay.

## Code map

| File | Purpose |
| --- | --- |
| `src/car/shape.js` | Parametric body: cross-section loft along X, wheel-arch cut-outs, rounded end caps |
| `src/car/surfaceBuilder.js` | Grid meshing, inner shells, panel edges, raycast-projected decals (BVH accelerated) |
| `src/car/body.js` | Body shell, glass, and the hinged doors, bonnet and tailgate |
| `src/car/details.js` | Lights, intakes, plates, mirrors, handles, roof rails, spoiler, exhausts |
| `src/car/wheels.js`, `interior.js` | 21" wheels and brakes; cabin, steering wheel, engine bay |
| `src/car/index.js` | Car API: `setOpen`, `toggle`, `setSteer`, `setWheelSpeed`, `setPaint`, `setLights` … |
| `src/environment.js`, `src/env/*` | Sky, sun and moon, stars, fog, reflections, plaza, trees, lamps, buildings |
| `src/cameraRig.js`, `src/main.js` | Orbit and walk controls, UI, picking, keyboard, post-processing |

Coordinates: Y is up, units are metres, and the car faces +X with its centre over the origin.

## Tests

The tests use Playwright with the bundled Chromium in headless mode, with WebGL rendered by SwiftShader. Start `npm run dev` first.

```bash
npm test                          # end-to-end interaction checks + screenshots in tests/screenshots
node tests/carViews.mjs side,front,rear,top,persp   # car-only views (car-test.html)
node tests/env-screenshots.mjs    # environment presets (env-test.html, served on :5199)
```

This machine has no system Chrome and no root access. Chromium's missing shared libraries were therefore unpacked from Debian packages into `~/.cache/ms-playwright/local-libs`, and `tests/browser.mjs` adds that directory to `LD_LIBRARY_PATH`.
