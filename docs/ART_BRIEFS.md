# Art briefs: what still needs painting

Each image below unlocks or improves something in the game **with no code changes**. Drop it in
through the existing pipeline (`npm run art:import`, then `npm run art:webp` and
`npm run validate:assets`). Sizes, anchors and corners come from the manifest. The full,
test-checked tables are in [ASSET_SPEC.md](ASSET_SPEC.md) §6.

## Shared art direction (match the painted cottage)

- **Benchmark:** `src/assets/art/buildings/cottage/cottage_r0.png`: hand-painted, richly
  textured, warm and cozy, slightly stylised fairy-tale realism.
- **Projection:** 2:1 isometric (true dimetric, about 26.57°). Building edges follow the
  footprint diamond. No perspective and no fisheye.
- **Light:** warm sunlight from the **top-left**. Shadows fall to the lower right. Windows and
  lanterns glow warm amber (except the magical buildings, which glow violet or green).
- **Scale:** one tile ≈ a cottage: a door is about 0.25 of a tile wide, and a storey is about a
  third of a tile tall. Keep every building at the same scale as the cottage, farm and sawmill.
- **Composition:** the building sits on a **small grass base no larger than its footprint**. Keep
  **16 px of empty margin** on every side: no cropping, nothing cut by the canvas edge.
- **Separate layers:** put paths, gardens, crates and flowerbeds that spread around the building
  in a `_ground.png` layer at the same canvas size (see ASSET_SPEC §11). Collision always uses
  the logical footprint.
- **No baked smoke or particles.** The game animates chimneys, windows, sparkles and butterflies
  at the points you mark (see "Effects" below).
- **Deliver:** transparent PNG (real alpha, not a checkerboard), at least 2× the canvas size or
  any larger size, with **one building per image**. The importer crops, scales and aligns it.

Prompt skeleton (fill in the subject line):

> Hand-painted isometric 2:1 game building for a cozy fantasy city builder, matching a
> timber-framed storybook cottage style: rich painterly textures, warm top-left sunlight, soft
> shadows to the lower right, warm glowing windows. **[SUBJECT]**. Standing on a small grass
> base, centred, whole building visible with empty margin, transparent background, no text, no
> UI, no smoke.

## The six new buildings (unlocked in game as soon as `_r0` exists)

**Tip:** paint each building in its **r0 orientation**: the long side of a non-square footprint
runs along the **front-left** edge (for the 2×1 Blacksmith and the 3×2 Marketplace). Art painted
the other way round is mirrored automatically on import, which also flips its lighting.

| Building | File (r0) | Footprint | Canvas | Anchor | Front corner | Subject for the prompt | Effects to mark |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Blacksmith | `buildings/blacksmith/blacksmith_r0.png` | 2×1 | 448 × 448 | (224, 320) | (288, 416) | **✔ Delivered and in game** (see [BUILDING_ART.md](BUILDING_ART.md)). A painted `_r1` would add the true opposite view | done: `chimney`, forge, lanterns, window |
| Tavern | `buildings/tavern/tavern_r0.png` | 2×2 | 576 × 640 | (288, 480) | (288, 608) | **✔ Delivered and in game** (see [BUILDING_ART.md](BUILDING_ART.md)). Door faces front-right as painted (kept for the top-left light) | done: 6 `window`s and lanterns; animated `chimney` smoke (painted plume removed) |
| Marketplace | `buildings/marketplace/marketplace_r0.png` | 3×2 | 704 × 512 | (352, 320) | (416, 480) | small market square: three stalls with striped awnings (red, gold, teal), crates of produce, a stone well in the middle | none, or `butterfly` over the flower crates |
| Alchemist's Workshop | `buildings/alchemist/alchemist_r0.png` | 2×2 | 576 × 640 | (288, 480) | (288, 608) | **✔ Delivered and in game** (see [BUILDING_ART.md](BUILDING_ART.md)). A painted `_r1` would add the true side view | done: emerald `sparkle`s on the still and flasks, 4 `window`s; delicate animated `chimney` smoke (painted plume removed) |
| Ancient Temple | `buildings/temple/temple_r0.png` | 3×3 | 832 × 768 | (416, 544) | (416, 736) | ancient pale-stone temple: columns, mossy steps, a domed roof with a gold finial, a softly glowing rune altar at the entrance | `sparkle` on the altar and runes |
| Castle Keep | `buildings/castle/castle_r0.png` | 4×4 | 1088 × 1280 | (544, 992) | (544, 1248) | stone castle keep with four corner towers, conical slate roofs, banners in violet and gold, a gatehouse facing the front-left | `window`s, optional `chimney` |

The left and right corners always touch the 32 px side margins at the anchor's height. Rotations
`_r1`–`_r3` use the same canvas (2×1 and 3×2 swap to 1×2 and 2×3; see ASSET_SPEC §6).

**Sparkle colour** is configurable per building in `src/game/effectPalette.ts` (violet by
default, emerald for the alchemist). If a painting already includes smoke, that smoke is
static. Prefer erasing it on import (`--erase X0,Y0,X1,Y1`, output px, read off the preview) and
setting `--effect chimney=X,Y` on the chimney mouth, so the smoke animates (see the Tavern). If a
pale smoke stub is left inside the chimney mouth, retouch it with `--inpaint X0,Y0,X1,Y1`.
`--effect chimney=none` keeps the painted plume but leaves it frozen. Chimney smoke can be tuned
per building in `SMOKE_STYLES` (`src/game/effectPalette.ts`).

Import, using the mage tower as an example:

```bash
npm run art:import -- path/to/tavern.png --as tavern_r0 \
  --effect-src chimney=X,Y --effect-src window=X,Y --effect-src window=X,Y
npm run art:webp && npm run validate:assets
```

`--effect-src` takes points in the *input* image's pixels. `--effect` takes points in the
output sprite, readable from the preview the importer writes to `art-previews/`.

## Rotations for the existing buildings

The farm, sawmill and mage tower only have `_r0`. Turned buildings reuse it (r1/r3 mirrored, r2
as-is), so the lighting flips and r2 shows the front instead of the back. Paint `_r1`, `_r2` and
`_r3` with the same canvas sizes:

| Building | Canvas | Footprint r0 / r1 |
| --- | --- | --- |
| Farm | 704 × 544 | 2×3 / 3×2 |
| Sawmill | 448 × 448 | 2×1 / 1×2 |
| Mage tower | 576 × 1024 | 2×2 |
| Blacksmith | 448 × 448 | 2×1 / 1×2 |
| Alchemist's Workshop | 576 × 640 | 2×2 |
| Tavern | 576 × 640 | 2×2 |
| Cottage | as in `art-meta.json` | 1×1 |

## World details that need painted art (not yet supported in code)

These would make the settlement feel inhabited, but they need artwork that can't be generated
here. Drawing them as code shapes would fall below the cottage's quality, so they're deliberately
not faked.

| Detail | What to paint | Integration needed |
| --- | --- | --- |
| Cobbled paths | 16 iso path tiles 256 × 128 (straight, corner, T, cross, end, plus 2 grass-edge variants), the same style as the cottage's stepping stones | path tool or auto-paths between doors (code) |
| Flower beds and fences | 6 low decorations on a 1×1 canvas (320 × 256): flowerbed, picket fence ×2, lantern post, bench, cart | a "decorate" build category (code) |
| Villagers | 4 small characters (farmer, smith, mage, child), 4 directions × 4-frame walk, about 48 × 64 px per frame at 4× | walking agents between buildings (code) |
| Painted island cliff | 1 seamless strip 512 × 256 of earth, roots and rock | replaces the vector cliff (small manifest addition) |
| Seamless grass | `terrain/grass_0…3` (256 × 128, or seamless square textures) | already supported |
