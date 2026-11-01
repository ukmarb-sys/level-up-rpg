# Project status

_Last updated: 2026-11-01, Alchemist's Workshop session._

## Shipped to `main` (merged)

| PR | What |
| --- | --- |
| #1–#3 | Prototype: 20×20 iso map, touch pan and zoom, 4 buildings, placement, rotation, relocation, collision, resources, autosave, procedural art, tests, GitHub Actions and Pages |
| #4–#6 | Asset pipeline: manifest, loader with fallbacks, validator, importer, visual footprints and ground layers, painted **cottage** + mystic garden ground layer, stale-page handling |
| #7 | Enchanted Wilderness phase 1: seamless grass, tone field, 3-tile perimeter forest, ambient life, Android quality tiers, LOD |
| #8 | Six painted **trees**, prop validation, one shared prop atlas (keeps draw calls low on Android) |
| #9 | Painted **farm, sawmill and mage tower** (r0) |
| #10 | Visual Overhaul 2.0: living effects (smoke, windows, butterflies, crystal sparkles), **six new buildings' rules** (art-gated), cloud shadows |
| #11 | Painted **Blacksmith** (`blacksmith_r0`) plus the handoff docs (`CLAUDE.md`, this file, `VISUAL_ROADMAP.md`, `NEXT_SESSION.md`) |

The deploy workflow for `main` at `d2fb43d` (PR #11) **succeeded** in GitHub Actions on
2026-11-01. The live page is https://ukmarb-sys.github.io/level-up-rpg/. Check it in a browser
before claiming what is live.

## Open (awaiting the owner's review; not merged)

| Branch | What |
| --- | --- |
| `claude/level-up-rpg-review-sk02af` | Painted **Alchemist's Workshop** (`alchemist_r0`, 2×2, emerald sparkles on the still and flasks, 4 window glows, painted smoke so no animated smoke) and **per-building sparkle colours** (`src/game/effectPalette.ts`) |

**Still missing:** the **Tavern** painting. It was announced as attached but never reached the
session, so the Tavern remains hidden. No placeholder was made.

## Game state

- **Buildings:**

  | Building | Art | Footprint | Notes |
  | --- | --- | --- | --- |
  | Cottage | painted | 1×1 | starter |
  | Farm | painted | 2×3 | starter |
  | Sawmill | painted | 2×1 | starter |
  | Mage Tower | painted | 2×2 | starter |
  | Blacksmith | painted | 2×1 | tier 2, +3 stone/min, needs a Sawmill |
  | Tavern | no art yet (hidden) | 2×2 | tier 2, +10% all production, needs a Cottage and a Farm, one per realm |
  | Marketplace | no art yet (hidden) | 3×2 | tier 3, +2 wood and +2 stone/min, needs a Tavern |
  | Alchemist's Workshop | painted (open PR) | 2×2 | tier 3, +4 magic/min, needs a Mage Tower |
  | Ancient Temple | no art yet (hidden) | 3×3 | tier 4, +25% magic, needs the Alchemist, one per realm |
  | Castle Keep | no art yet (hidden) | 4×4 | tier 5, +15% all production, needs the Marketplace, Temple and Blacksmith, one per realm |

- **Economy:** wood, stone and magic. Starting resources 200 / 150 / 50. Demolish refunds 50%.
- **Saves:** format v1 in localStorage (`levelup-rpg:save`). Unknown building types are dropped
  on load.
- **Environment:** painted trees, procedural grass and props, fireflies, spores, glows,
  butterflies, crystal sparkles and drifting cloud shadows.
- **Quality:** 199 tests (195 on `main` before the Alchemist). The validator has no errors; its
  warnings are four trees with straight sprite-sheet cut edges and the missing optional grass
  tiles. Performance on the Pixel 7 profile is about 24–26 draw calls per frame for the usual
  starter village; a six-building village (mage tower, alchemist, blacksmith, cottage, farm,
  sawmill) measures 32 with or without the alchemist, so it adds none.

## Known limitations

- Only **r0** artwork exists for the farm, sawmill, mage tower, blacksmith and alchemist (and the cottage).
  r1/r3 are mirrored and r2 reuses r0, so the lighting flips and turned buildings show their
  front instead of their back.
- Painted grass bases overhang the front edges by 11–20 world px (decoration only).
- The sawmill and blacksmith plots are nearly square, so they fit a 2×1 footprint imperfectly.
- Oak, enchanted, fir and spruce trees have truncated right edges from sprite-sheet slicing.
- Grass, ground details, rocks, ruins, the cliff, paths, villagers and decorations are still
  procedural or missing. They need painted art (see `docs/ART_BRIEFS.md`).
- The Alchemist's selection marker sits just above its painted smoke plume (the plume is part of
  the sprite).
- The `src/modules/` gameplay modules (quests, AI coaching, rewards) are scaffolding only
  (`milestones.ts` is the example).

See [VISUAL_ROADMAP.md](VISUAL_ROADMAP.md) for what comes next and
[NEXT_SESSION.md](NEXT_SESSION.md) for how to start.
