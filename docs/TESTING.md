# Testing

## Headless simulation tests

```bash
node sim-test.mjs
```

Requires Node.js (tested with v22). No dependencies to install. The script runs these scenarios and exits non-zero if any check fails:

| Scenario | What it checks |
| --- | --- |
| 1. Passive three-day run | Units rest, work and eat in order. No `NaN` positions, no negative meals, no unit stuck for more than 120 s, residence cap is never below staffable slots. |
| 2. No food for two days | Nobody is removed. Hunger-100 units work at half speed. Sad state appears. |
| 3. Upgrade rules | Costs match the formula, deductions are exact, and "cannot afford" and "max level" are rejected. |
| 4. Auto-play | Builds a Cookhouse, then upgrades the cheapest affordable building. Reports the real time to reach all level 5 at 1×. |

## What is not tested automatically

- **Rendering, lighting, shadows, and unit poses.** These need a real browser and WebGL. Check them by hand.
- **UI interaction:** clicks, drags, touch, panels and tooltips.
- **Three.js API behaviour.** Tests use a stub, so calls that differ in the real library won't be caught.

## Manual checklist

Run `python3 serve.py`, open the printed URL, and check:

1. The island renders with shadows and fog, and resizing the window doesn't distort it.
2. A full day passes in about 90 seconds at 1×. Night is dark blue with glowing windows.
3. Speeds 2× and 4× run faster, and pause freezes everything.
4. At start: 3 units, 3 buildings, 3 empty slots. HUD shows 15 wood, 6 fish, 24 meals and 3/6 population.
5. Building a Cookhouse deducts 10 wood. No slot offers a duplicate building type.
6. Fishermen cast, wait, get a bite, and reel in fish. Fish are delivered to the basket.
7. Lumberjacks chop, the tree falls, becomes a stump, and regrows.
8. Around 12:00 and 19:00, units gather and eat.
9. Around 22:00, units sleep in the tents, and wake around 06:00.
10. Upgrade button is disabled when unaffordable. A successful upgrade changes the visuals.
11. Hovering a unit shows its state, job and needs.
12. Reaching level 5 on all buildings shows the win banner.

## Debugging in the browser

`window.__ember` is exposed for testing from the console:

```js
__ember.setSpeed(4)             // 0 = pause, 1, 2 or 4
__ember.addRes(50, 50, 50)      // add wood, fish, meals
__ember.setHour(21)             // jump to 21:00 on the current day
__ember.build(2, 'cook')        // build on slot 2
__ember.upgrade(buildingId)     // upgrade a building by id
__ember.sim.state               // full simulation state
__ember.groves                  // tree states per Lumber Camp
```
