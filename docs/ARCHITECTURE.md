# Architecture

Ember Isle is split into two layers so the game rules can be tested without a browser.

```
┌────────────────────────┐        reads state, drains events        ┌──────────────────────┐
│  sim.js  (rules + AI)  │ ───────────────────────────────────────▶ │  game.js (render+UI) │
│  pure JS, no DOM, no   │ ◀─────────────────────────────────────── │  Three.js, HTML UI,  │
│  Three.js              │        build / upgrade / step           │  input, animation    │
└────────────────────────┘                                          └──────────────────────┘
```

## `sim.js`: the simulation

`createSim(opts)` returns a self-contained simulation. Nothing in it touches the DOM or Three.js.

**Public API**

| Member | Purpose |
| --- | --- |
| `state` | Plain data: `t` (game hours), `day`, `hour`, `res` (wood/fish/meals), `slots`, `buildings`, `units`, `won`, `winAt` |
| `step(simDt)` | Advance the simulation by `simDt` real seconds. Substeps internally at ≤ 0.05 s. Ignores non-finite or non-positive input. |
| `build(slotId, type)` | Build an empty slot. Returns `{ ok, reason? }`. |
| `upgrade(buildingId)` | Upgrade a building. Returns `{ ok, reason? }`. |
| `drainEvents()` | Return and clear queued events for the renderer (`strike`, `harvest`, `drop`, `spawn`, `built`, `upgrade`, `win`). |
| `costFor`, `buildCostFor`, `canAfford`, `slotsFor`, `capFor`, `bundleFor`, `gatherTimeFor`, `cookTimeFor` | Economy formulas, exported so the UI and tests use the same numbers. |
| `layout` | Positions the renderer needs: `workSpot`, `treeSite`, `pondCenter`, `tentPos`, `bedPos`, `dropSpots`, `eatSpots`. |

**Simulation loop**

Each substep (≤ 0.05 s) does this, in order:

1. Advance the clock by `dt × HOURS_PER_SEC`.
2. Once per game hour, reassign jobs.
3. Every 4 game hours between 06:00 and 18:00, spawn a newcomer if the population is below cap and meals ≥ population.
4. Update needs: hunger rises 4/h, energy falls 5/h awake or rises 12.5/h asleep.
5. Run each unit's state machine.
6. Push apart units that are closer than `SEP_RADIUS`.

## Unit state machine

```
IDLE ──decide()──▶ GO_SLEEP ─▶ SLEEP ─────────────────────────────▶ IDLE
  │                GO_EAT ───▶ EAT ─────────────────────────────────▶ IDLE
  │                REST (wander, idle) ─────────────────────────────▶ IDLE
  │                GO_WORK ─▶ WORK ─▶ CARRY ─▶ DROP ────────────────▶ IDLE
  │                GO_STOCK ─▶ CARRY (fish to cookhouse) ─▶ WORK (stir) ─▶ CARRY ─▶ DROP
  │                WAIT_FISH (stockpile empty, retry in 3 s)
```

- `decide()` picks the next action. Needs override the schedule: energy below 15 means sleep, and hunger above 80 with meals in stock means eat.
- A unit can be interrupted mid-cycle to eat or sleep, except while carrying a bundle or stirring the cookhouse pot. A carried bundle is always delivered first.
- Collectors call `harvest` when a work cycle finishes, which the renderer uses to fell the tree.

## Schedule

Each unit has its own offset in ±0.5 h. Its local hour is `hour − offset`:

| Local time | Activity |
| --- | --- |
| 06:00–12:00 | Work |
| 12:00–13:00 | Eat |
| 13:00–19:00 | Work |
| 19:00–20:00 | Eat |
| 20:00–22:00 | Rest |
| 22:00–06:00 | Sleep |

Sleep ends once energy is at least 30 and the local hour is between 06 and 22.

## Pathing

There is no A\*. The island has one hub (the stockpile at the origin) and six slots on a ring. Each building has a door, and each route is `[own door?, target]`. If a straight segment passes within 1.6 units of the hub, a waypoint is inserted on the outer ring. Lumber and dock workers use two corner waypoints to walk around their building. A unit that has been walking for more than 45 s is snapped to its destination as a safety net.

## Layout

World coordinates, Y up, island centre at the origin, radius 14.

| Slot | Position | Start |
| --- | --- | --- |
| S0 | (0, −8) | Tent Camp |
| S1 | (6.9, −4) | Lumber Camp |
| S2 | (6.9, 4) | empty |
| S3 | (0, 8) | empty |
| S4 | (−6.9, 4) | Fishing Dock |
| S5 | (−6.9, −4) | empty |

Each slot has an outward direction `dir` and a perpendicular `perp`. Buildings, trees, ponds and tents are placed relative to these.

## `game.js`: rendering and UI

- **Scene:** an orthographic camera at roughly 35° pitch and 45° yaw, with pan and zoom. One directional light casts shadows; a hemisphere light fills in. Fog and tone mapping are on.
- **Props:** scatter props (pines, rocks, mounds, snow) are placed with clearance from every slot, tree site, pond and tent, because the player can build any type on any slot.
- **Units:** each unit is a procedural group of about 11 meshes. Animation is driven by simulation state: walk cycle, gather swing, fishing casts, eating, sleeping. Limbs ease toward target poses with exponential smoothing so state changes don't snap.
- **Groves:** each Lumber Camp has six trees. Harvests shake the tree; a finished cycle fells it, then it becomes a stump and regrows.
- **Pond:** each Fishing Dock has a pond. Each catch casts a line, waits, nibbles, sets the hook, and lifts the fish into the basket.
- **HUD and panels:** plain HTML over the canvas. The HUD updates at about 4 Hz.
- **Debug hook:** `window.__ember` exposes the simulation and helpers (`setSpeed`, `addRes`, `setHour`, `build`, `upgrade`). See [TESTING.md](TESTING.md).

## Design decisions

- **Logic and rendering are separate** so rules can be tested headlessly and rendering changes can't break the economy.
- **Fixed slots** keep the base readable and make layout deterministic.
- **FSM over utility AI.** Units follow a schedule with a few needs overrides, which is easy to read and tune.
- **Procedural art only.** Everything is built from primitives, so there are no asset files to download or license.
