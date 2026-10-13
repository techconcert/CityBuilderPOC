# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.2.0]

### Added
- Fishing Dock now has a stone-ringed pond. Fishermen cast a line, wait, get a bite, set the hook, and reel in fish.
- Lumber Camps have six trees, one per work slot. Lumberjacks fell their tree, which becomes a stump and regrows.
- Scatter props (pines, rocks, mounds, snow) keep clear of slots, tree sites, ponds and tents.

### Changed
- Lumberjacks stand beside their trunk, not inside the canopy.
- Fishermen stand outside the pond's rim stones.
- Upgrade costs lowered: `COST_SCALE` is now 0.45. Auto-play time to win is about 12 minutes at 1×.
- A newly built or upgraded building with no workers now takes one from the most-staffed building.
- Units stop for meals and bedtime mid-cycle, instead of waiting for their current work cycle to finish.

### Fixed
- Units could miss their meal and bedtime windows because decisions were only made while idle.
- A newly built Cookhouse could be left with no workers.
- Fishing and tree animation ran at half speed at 4×.
- Sleeping units clipped into their beds.
- Passing an invalid slot id to `build()` threw an error after the wood had already been deducted.
- Calling `step()` with `Infinity` could hang.

## [0.1.0]

### Added
- Initial proof of concept: four building types, fixed slots, upgrades to level 5, the population cap, the 24-hour unit cycle, day and night lighting, speed controls, and the headless test suite.
