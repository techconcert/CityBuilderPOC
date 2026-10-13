# CityBuilderPOC: Ember Isle

A small in-browser proof of concept for a frozen-island colony builder, inspired by *Frostpunk* and *Frozen City*, viewed from a fixed isometric 2.5D camera.

## Concept

Survivors on a small snowy island gather, cook, eat and sleep on a 24-hour cycle. You place and upgrade buildings to grow the colony.

- Four building types: **Lumber Camp**, **Fishing Dock**, **Cookhouse** and **Tent Camp**.
- Six fixed building slots around a central stockpile. Each building upgrades to level 5.
- Units follow a daily schedule (work, eat, rest, sleep) with hunger and energy needs.
- You win when every building reaches level 5 (about 12 minutes at 1× speed).

The POC deliberately keeps scope small. It leaves out the central generator/upgrade mechanic, the hot/cold heat simulation and heroes, and plays closer to a light idle game such as *Survivor Island Idle*.

## Art direction

- **Isometric 2.5D:** an orthographic camera at about 35° pitch and 45° yaw, with pan and zoom.
- **Current art is procedural low-poly:** everything is built from Three.js primitives in code, with no image or model files.
- **AI-generated isometric graphics** are the intended direction for the project, but are not in the code yet.

## Status

🧪 **Proof of concept (v0.2.0).** Expect rough edges and breaking changes. See [CHANGELOG.md](CHANGELOG.md).

## Getting started

You need **Python 3** to serve the game and **Node.js** (tested with v22) to run the tests. There is no build step and nothing to install.

```bash
git clone https://github.com/techconcert/CityBuilderPOC.git
cd CityBuilderPOC

python3 serve.py      # serve the game and open it in your browser
node sim-test.mjs     # run the headless simulation tests
```

`serve.py` picks the first free port from 5173 and prints the URL. Use `--no-open` to skip opening the browser, or `--port 9000` to start scanning from another port.

Opening `index.html` directly from disk won't work, because browsers block ES modules on `file://`.

Three.js r160 loads from the jsDelivr CDN, so the first run needs internet. To play offline:

```bash
mkdir -p vendor
curl -L -o vendor/three.module.js https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js
```

Then change the importmap URL in `index.html` to `./vendor/three.module.js`.

## Project structure

```
.
├── index.html        UI, styles and the Three.js importmap
├── game.js           Rendering, animation and UI wiring (Three.js)
├── sim.js            Pure game logic: clock, economy, unit AI (no DOM, no Three.js)
├── sim-test.mjs      Headless tests for sim.js
├── serve.py          Local dev server with free-port scan
├── docs/
│   ├── ARCHITECTURE.md   How sim.js and game.js fit together
│   ├── TESTING.md        Automated tests and the manual checklist
│   └── TUNING.md         Pacing and economy knobs
├── CHANGELOG.md
└── CONTRIBUTING.md
```

Game rules live in `sim.js` and rendering lives in `game.js`, so the rules can be tested without a browser. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Debugging

In the browser console, `window.__ember` exposes the simulation and helpers such as `setSpeed`, `addRes`, `setHour`, `build`, `upgrade` and `sim.state`. See [docs/TESTING.md](docs/TESTING.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
