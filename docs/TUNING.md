# Tuning

All values below are at the current defaults. Change them in `sim.js` (economy and time) or `game.js` (visuals).

## Time

| Setting | Value | Notes |
| --- | --- | --- |
| `TUNE.HOURS_PER_SEC` | 24 / 90 | One game day = 90 real seconds at 1×. |
| Speeds | 0 (pause), 1, 2, 4 | Set from the top bar. |
| Max real `dt` per frame | 0.1 s | Prevents huge jumps after a tab is backgrounded. |
| Substep | ≤ 0.05 s | Keeps behaviour stable at 4×. |

## Economy

`TUNE.COST_SCALE` is `0.45`. It multiplies every upgrade cost. Base costs are defined in `BASE_COST` and the formula is `round(base × 1.5^(level−1) × COST_SCALE)`.

The table below was generated from the code at the current `COST_SCALE`:

| Building | 1 → 2 | 2 → 3 | 3 → 4 | 4 → 5 |
| --- | --- | --- | --- | --- |
| Lumber Camp (wood / fish) | 9 / 2 | 14 / 3 | 20 / 5 | 30 / 8 |
| Fishing Dock | 11 / 2 | 16 / 3 | 24 / 4 | 36 / 6 |
| Cookhouse | 14 / 3 | 20 / 4 | 30 / 6 | 46 / 9 |
| Tent Camp | 7 / 2 | 11 / 3 | 16 / 4 | 24 / 6 |

Building a new type on an empty slot costs **10 wood** for every type.

## Output by level

| Level | Slots (collector / cookhouse) | Bundle | Gather time | Tent cap |
| --- | --- | --- | --- | --- |
| 1 | 2 / 1 | 3 | 4.00 s | 6 |
| 2 | 3 / 2 | 4 | 3.20 s | 9 |
| 3 | 4 / 3 | 5 | 2.56 s | 12 |
| 4 | 5 / 4 | 6 | 2.05 s | 15 |
| 5 | 6 / 5 | 7 | 1.64 s | 18 |

- Cookhouse cook time is 1.2 × gather time at its level. It turns `bundle` fish into `2 × bundle` meals.
- Tent cap is `3 + 3 × level`. Staffable slots are always below it, so there are always enough beds for the workers.

## Needs

| Need | Rate | Notes |
| --- | --- | --- |
| Hunger | +4 per game hour | Eating takes 1 game hour, uses 1 meal, and reduces hunger by 60 (floor 0). |
| Energy, awake | −5 per game hour | |
| Energy, asleep | +12.5 per game hour | Sleep ends at energy ≥ 30 in daytime. |
| Hunger 100 | Work at ×0.5 speed | Shows a sad emote. Nobody dies. |

Overrides: energy < 15 → sleep. Hunger > 80 with meals in stock → eat.

## Population

- A newcomer spawns every 4 game hours between 06:00 and 18:00.
- Requires `population < cap` and `meals ≥ population`.
- Start: 3 units, 15 wood, 6 fish, 24 meals.

## Movement

| Setting | Value |
| --- | --- |
| `WALK_SPEED` | 2.2 units per second |
| `CARRY_MULT` | 0.75 (carriers walk 25% slower) |
| `SEP_RADIUS` / `SEP_PUSH` | 0.6 / 1.5 |

## Trees (visual only)

Trees don't affect the economy; wood is paid per trip. In `game.js`:

| Setting | Value | Notes |
| --- | --- | --- |
| `STUMP_H` | 0.8 game hours | Time from felled to stump-only. |
| `GROW_H` | 2.4 game hours | Sapling to full tree. Shortened 10% per camp level above 1. |

Measured gaps between two harvests of the same tree were at least about 3.9 game hours in test runs, so a regrown tree is normally waiting when the next harvest happens.

## Pond

`POND_Z = 2.6` and `POND_R = 2.0` in `sim.js`. Fishermen stand 2.7 units from the pond centre, outside the rim stones.

## Suggested tuning workflow

1. Run `node sim-test.mjs`. Note the reported time to win.
2. Change one knob, usually `COST_SCALE`.
3. Re-run the tests. Keep the auto-play time between about 10 and 15 minutes at 1×.
4. Only then change time or output values.
