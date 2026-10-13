# Contributing

Thanks for looking at Ember Isle.

## Getting set up

```bash
python3 serve.py   # play the game
node sim-test.mjs  # run the headless tests
```

No build step and no package install.

## Ground rules

- **Game rules belong in `sim.js`.** `game.js` should only read simulation state and draw it. If a change affects the economy, unit behaviour or timing, make it in `sim.js` and add a test in `sim-test.mjs`.
- **`sim.js` must stay free of DOM and Three.js.** It has to run under plain Node.
- **Keep the art procedural.** Don't add binary assets without discussion. Everything is built from primitives.
- **Keep the numbers in one place.** Add new tuning knobs to the constants at the top of the file and document them in [docs/TUNING.md](docs/TUNING.md).

## Before opening a pull request

1. `node --check sim.js && node --check game.js` passes.
2. `node sim-test.mjs` passes, and you've noted any change to the auto-play time.
3. You've played the game in a browser for at least one in-game day if you touched rendering or animation.
4. You've updated [CHANGELOG.md](CHANGELOG.md) under "Unreleased".

## Style

- ES modules, no build tools.
- Plain functions and objects over classes unless there's a clear reason.
- Short comments that explain *why*, not what the code does.
- Keep line lengths reasonable, and match the existing formatting in the file you're editing.

## Reporting bugs

Open an issue with:

- Browser and version
- What you did, what you expected, and what happened
- A screenshot or the console output, if relevant
- The speed setting and time of day, if it's a timing issue
