# Raw artwork sources

Original generator output, kept so every shipped sprite can be reproduced. Nothing in this
folder is bundled into the game. The game only loads the processed files in `src/assets/art/`.

| Source | Becomes | Notes |
| --- | --- | --- |
| `raw/levelup_cottage.png` (850×1024) | `src/assets/art/buildings/cottage/cottage_r0.{png,webp}` | Cottage, entrance on the front-left face (r0). Real transparency, no baked checkerboard. Generator alpha (max 254 plus background haze) is cleaned automatically on import. |
| `raw/levelup_mystic_garden.png` (686×1024) | `src/assets/art/buildings/cottage/cottage_r0_ground.{png,webp}` | Decorative ground layer of the cottage, placed on the tile behind-right of it. It never blocks that tile. |

Reproduce the committed sprites exactly. `tests/realArt.test.ts` checks this pixel for pixel.

```bash
npm run art:import -- art-source/raw/levelup_cottage.png --as cottage_r0 \
  --base 125,770,890 --visual -0.25,-1,1.25,1.25 \
  --ground art-source/raw/levelup_mystic_garden.png --ground-rect 0,-1,1,0 \
  --effect-src chimney=437,100
npm run art:webp
npm run validate:assets
```

How the import values were measured, in source image pixels:
- `--base 125,770,890`: the feet of the left and right walls (x 125 and x 770), and the bottom of
  the front stone corner pillar (y 890). This registers the house to its logical 1×1 tile.
- `--visual -0.25,-1,1.25,1.25`: the painted grass plot overhangs the tile by about a quarter
  tile on every side, and the garden needs the extra tile at `v −1…0`.
- `--effect-src chimney=437,100`: the chimney opening; smoke rises from here.
- Lit windows (5, including the porch lantern) and the top point are detected automatically.
