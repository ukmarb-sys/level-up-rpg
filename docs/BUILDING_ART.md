# Painted buildings

All four buildings have painted artwork for rotation **r0**. Sources and the exact import commands
are in [`art-source/README.md`](../art-source/README.md).

![Default view: procedural buildings (left), painted (right)](screenshots/buildings-default-before-after.jpg)
![Close up, before and after](screenshots/buildings-close-before-after.jpg)
![Placing a painted farm: preview with its 2×3 collision outline](screenshots/buildings-placing-farm.jpg)

| Building | Logical footprint (unchanged) | Canvas | Effects |
| --- | --- | --- | --- |
| Cottage | 1×1 (+ garden ground layer) | 544 × 416 | chimney smoke, 5 window glows |
| Farm | **2×3** | 704 × 544 (height grown for the painted smoke) | chimney smoke, 6 window/lantern glows, butterflies |
| Sawmill | **2×1** | 448 × 448 | chimney smoke, 4 window/lantern glows, sawdust at the blade |
| Mage tower | **2×2** | 576 × 1024 | soft halo and runes on the crystal, 5 window/lantern glows, sparkles on the ground crystals, door rune and spell book |
| Blacksmith | **2×1** | 448 × 448 | chimney smoke; forge fire, coal bed, two lanterns and the gable window glow |
| Tavern | **2×2** | 576 × 640 | both dormers, the big latticed window, the hanging lantern and two table lanterns glow; the chimney smoke is **painted** (no animated smoke) |
| Alchemist's Workshop | **2×2** | 576 × 640 | **emerald sparkles** on the copper still and three potion flasks; the dormer, arched window, kiln mouth and porch lantern glow; the chimney smoke is **painted** (no animated smoke) |

![The blacksmith on the island](screenshots/blacksmith-close.jpg)

![The Alchemist's Workshop on the island](screenshots/alchemist-close.jpg)

![The Tavern on the island](screenshots/tavern-close.jpg)

Gameplay is untouched: footprints, costs, production, collision, placement rules and saves
(format v1) are all as before. `tests/buildingArt.test.ts` pins the footprints and costs.

**How the art was fitted.** Each image is a small diorama: the building on its own grass base.
The importer scales each one so its base spans the logical footprint's width (96%), puts the
lowest point on the footprint's front corner, and leaves the rest of the canvas transparent. The
art never extends past the footprint to the left or right, so side neighbours are never covered.

**Build menu and action bar.** The icons use the same painted sprites, cropped to each
building. This happens automatically whenever a painted r0 exists.

**Performance** (Pixel 7 profile): 20–21 WebGL draw calls per frame (15–16 before; each building
is its own texture), and about 4,400 vertices per frame instead of about 17,300, because the
procedural building geometry is gone.

## Visual limitations

- **Grass bases overhang the front edges.** The painted grass rim reaches 11–20 world px
  (up to about 0.6 of a tile's depth) past the footprint's two front edges: farm up to 20 px,
  sawmill 17, mage tower 11. It's decoration only and never blocks a tile, and a building
  placed in front draws over it.
- **Sawmill shape.** The sawmill was painted on a roughly square base, but its footprint is a
  long 2×1. Fitted to the footprint width, the building is a little small and the grass bulges
  in front of the short edge.
- **Clipped edges in the source crop.** The farm's right-hand bush and the bush beside the
  sawmill's timber pile end in a straight vertical cut (37 and 29 source px, about 9 and 7 world
  px). It's small, but visible up close.
- **Smoke:** the farm and sawmill smoke plumes are painted; animated puffs rise from the
  chimneys over them (Visual Overhaul 2.0). The farm's selection marker sits above the plume.
- **Blacksmith orientation.** It was painted with its long forge front facing front-right (the
  1×2 view), so it is mirrored to fit the 2×1 footprint. The light then comes slightly from the
  right instead of the left. Its plot is nearly square (1 : 1.2), so like the sawmill the grass
  reaches up to 12 world px past the short front edge. Turning it (r1/r3) shows the painting
  exactly as delivered.
- **Alchemist smoke and colour.** The painting already has a smoke plume above its chimney, so
  the game's chimney smoke is switched off (`chimney: null`) to avoid two plumes. Because the
  painted plume is part of the sprite, the selection marker sits just above the smoke. Its
  sparkles use the building's own **emerald** palette (`src/game/effectPalette.ts`) instead of
  the mage tower's violet.
- **Tavern orientation and base.** Its door and patio face front-right instead of the r0
  front-left, but it is kept as painted: the light comes from the top-left like every other
  building, and mirroring would flip it. Gameplay doesn't depend on which face the door is on;
  turning the Tavern (r1/r3) shows the door front-left. Its base is painted slightly flatter than
  2:1, so the grass at the side corners sits about 9 world px below the footprint's side corners.
  Its painted smoke replaces the game's (`chimney: null`), and the selection marker sits above it.
- **Similar houses.** The farmhouse and the cottage share a red-roof, stone-and-timber style,
  so they're easy to mix up at a glance. The farm's field and fence tell them apart.

## Missing rotation artwork

Only **r0** exists for the farm, sawmill, mage tower, blacksmith, alchemist and tavern. The other rotations are
**temporary fallbacks**, reported by `validate:assets`:

| Building | r1 | r2 | r3 |
| --- | --- | --- | --- |
| Farm (2×3 / 3×2) | r0 mirrored | r0 | r0 mirrored |
| Sawmill (2×1 / 1×2) | r0 mirrored | r0 | r0 mirrored |
| Mage tower (2×2) | r0 mirrored | r0 | r0 mirrored |
| Blacksmith (2×1 / 1×2) | r0 mirrored (= the painting as delivered) | r0 | r0 mirrored (= as delivered) |
| Alchemist (2×2) | r0 mirrored | r0 | r0 mirrored |
| Tavern (2×2) | r0 mirrored (door front-left) | r0 | r0 mirrored (door front-left) |

Mirroring swaps the footprint's width and depth, which matches the quarter turn, so collision
lines up. But the lighting flips, and r2 shows the same front as r0 instead of the back. Painted
`_r1`, `_r2` and `_r3` images (same canvas sizes as r0; see `docs/ASSET_SPEC.md` §6) replace the
fallbacks with no code changes.
