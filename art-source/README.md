# Raw artwork sources

Original generator output, kept so every shipped sprite can be reproduced. Nothing in this
folder is bundled into the game. The game only loads the processed files in `src/assets/art/`.

| Source | Becomes | Notes |
| --- | --- | --- |
| `raw/levelup_cottage.png` (850×1024) | `src/assets/art/buildings/cottage/cottage_r0.{png,webp}` | Cottage, entrance on the front-left face (r0). Real transparency, no baked checkerboard. Generator alpha (max 254 plus background haze) is cleaned automatically on import. |
| `raw/levelup_mystic_garden.png` (686×1024) | `src/assets/art/buildings/cottage/cottage_r0_ground.{png,webp}` | Decorative ground layer of the cottage, placed on the tile behind-right of it. It never blocks that tile. |
| `raw/trees/tree_{pine,spruce,fir,oak,enchanted,mystic}.png` (320 × 512/576/480/448/480/512) | `src/assets/art/props/tree_*.{png,webp}` | From `levelup_trees_pack.zip`. Delivered at the exact spec canvas with the trunk on the anchor, so they're kept pixel for pixel. Import cleans the generator alpha (haze, 1–5% of the body semi-transparent) and removes slivers of neighbouring trees left by sprite-sheet slicing (fir, oak, enchanted, mystic). |

Reproduce the committed sprites exactly. `tests/realArt.test.ts` checks this pixel for pixel.

```bash
npm run art:import -- art-source/raw/levelup_cottage.png --as cottage_r0 \
  --base 125,770,890 --visual -0.25,-1,1.25,1.25 \
  --ground art-source/raw/levelup_mystic_garden.png --ground-rect 0,-1,1,0 \
  --effect-src chimney=437,100
npm run art:webp
npm run validate:assets
```

The trees need no options (spec-exact canvases are detected automatically):

```bash
for t in pine spruce fir oak enchanted mystic; do
  npm run art:import -- art-source/raw/trees/tree_$t.png --as tree_$t
done
npm run art:webp
```

How the cottage import values were measured, in source image pixels:
- `--base 125,770,890`: the feet of the left and right walls (x 125 and x 770), and the bottom of
  the front stone corner pillar (y 890). This registers the house to its logical 1×1 tile.
- `--visual -0.25,-1,1.25,1.25`: the painted grass plot overhangs the tile by about a quarter
  tile on every side, and the garden needs the extra tile at `v −1…0`.
- `--effect-src chimney=437,100`: the chimney opening; smoke rises from here.
- Lit windows (5, including the porch lantern) and the top point are detected automatically.
