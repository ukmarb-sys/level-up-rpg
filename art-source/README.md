# Raw artwork sources

Original generator output, kept so every shipped sprite can be reproduced. Nothing in this
folder is bundled into the game. The game only loads the processed files in `src/assets/art/`.

| Source | Becomes | Notes |
| --- | --- | --- |
| `raw/levelup_cottage.png` (850×1024) | `src/assets/art/buildings/cottage/cottage_r0.{png,webp}` | Cottage, entrance on the front-left face (r0). Real transparency, no baked checkerboard. Generator alpha (max 254 plus background haze) is cleaned automatically on import. |
| `raw/levelup_mystic_garden.png` (686×1024) | `src/assets/art/buildings/cottage/cottage_r0_ground.{png,webp}` | Decorative ground layer of the cottage, placed on the tile behind-right of it. It never blocks that tile. |
| `raw/trees/tree_{pine,spruce,fir,oak,enchanted,mystic}.png` (320 × 512/576/480/448/480/512) | `src/assets/art/props/tree_*.{png,webp}` | From `levelup_trees_pack.zip`. Delivered at the exact spec canvas with the trunk on the anchor, so they're kept pixel for pixel. Import cleans the generator alpha (haze, 1–5% of the body semi-transparent) and removes slivers of neighbouring trees left by sprite-sheet slicing (fir, oak, enchanted, mystic). |

| `raw/buildings/farm.png` (854×788) | `src/assets/art/buildings/farm/farm_r0.{png,webp}` | From `levelup_buildings_pack.zip`. Farmhouse, wheat field, vegetable rows, fence and coop on one grass base, fitted to the **2×3** footprint (the logical footprint is authoritative; nothing was resized in gameplay). Canvas grown to 704×544 for the smoke. |
| `raw/buildings/sawmill.png` (789×779) | `src/assets/art/buildings/sawmill/sawmill_r0.{png,webp}` | Fitted to the **2×1** footprint. A sliver of the neighbouring image on the left was removed. The sawdust effect is anchored where the blade meets the timber. |
| `raw/buildings/mage_tower.png` (707×788) | `src/assets/art/buildings/mageTower/mageTower_r0.{png,webp}` | Fitted to the **2×2** footprint. Imported with `--keep-islands` so the halo's sparkles survive. The crystal is detected as the orb; window glows are set by hand (auto-detection also picked the gold emblem on the banner). |
| `raw/buildings/tavern.png` (1254×1254) | `src/assets/art/buildings/tavern/tavern_r0.{png,webp}` | Tavern, fitted to the **2×2** footprint (scale 0.413). The door and patio face **front-right**, but it is deliberately **not mirrored** (`--no-mirror`): the painting is lit from the top-left like the rest of the village, and mirroring would flip that light. r1/r3 (mirrored r0) show the door front-left. Its base is painted slightly flatter than 2:1, so the side corners sit about 9 world px below the footprint diamond's (not corrected, to avoid distorting the art). The generator painted a **static** smoke plume above the chimney: it is erased from the sprite after alignment (`--erase 170,100,300,187`, output px; every building pixel is unchanged) and the game animates the Tavern's own smoke style from the chimney mouth (`--effect chimney=222,191`). Six warm glows: both dormers, the big latticed window, the hanging lantern by the sign and the two table lanterns (the beer-mug sign and banner are excluded). |
| `raw/buildings/alchemist.png` (1312×1199) | `src/assets/art/buildings/alchemist/alchemist_r0.{png,webp}` | Alchemist's Workshop, fitted to the **2×2** footprint (scale 0.381, no mirroring: the open shop porch already faces front-left). Generator alpha (body at 250–253, background haze) cleaned on import. The painting includes its own chimney smoke, so the game's smoke is **off** (`chimney=none`). Warm glows on the dormer, arched window, kiln mouth and porch lantern (the green banner emblem and the green still are excluded); **emerald sparkles** on the still and three potion flasks. |
| `raw/buildings/blacksmith.png` (1254×1254) | `src/assets/art/buildings/blacksmith/blacksmith_r0.{png,webp}` | Blacksmith, fitted to the **2×1** footprint. It was painted for the 1×2 orientation (long forge front facing front-right), so the importer **mirrors** it to put the forge front on the footprint's long edge; r1/r3 (mirrored r0) therefore show it exactly as painted. Forge fire, coal bed, both lanterns and the gable window glow; smoke rises from the chimney. |

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

The buildings (`tests/buildingArt.test.ts` checks these pixel for pixel too):

```bash
npm run art:import -- art-source/raw/buildings/farm.png --as farm_r0 --effect chimney=510,122 \
  --effect window=437,219 --effect window=562,224 --effect window=404,286 --effect window=547,299 \
  --effect window=485,296 --effect window=356,390 \
  --effect butterfly=203,367 --effect butterfly=300,330 --effect butterfly=585,330 --effect butterfly=413,460
npm run art:import -- art-source/raw/buildings/sawmill.png --as sawmill_r0 --effect-src wheel=438,505 \
  --effect chimney=278,155 --effect window=215,203 --effect window=339,236 --effect window=178,281 --effect window=365,287
npm run art:import -- art-source/raw/buildings/mage_tower.png --as mageTower_r0 --keep-islands \
  --effect window=332,632 --effect window=255,642 --effect window=170,731 \
  --effect window=184,854 --effect window=302,880 \
  --effect sparkle=129,842 --effect sparkle=447,876 --effect sparkle=414,755 --effect sparkle=244,870 --effect sparkle=368,880
npm run art:import -- art-source/raw/buildings/blacksmith.png --as blacksmith_r0 --effect-src chimney=858,195 \
  --effect-src window=777,790 --effect-src window=745,838 --effect-src window=828,649 \
  --effect-src window=487,755 --effect-src window=369,547
npm run art:import -- art-source/raw/buildings/alchemist.png --as alchemist_r0 --effect chimney=none \
  --effect window=262,296 --effect window=366,428 --effect window=305,500 --effect window=221,389 \
  --effect sparkle=305,418 --effect sparkle=247,466 --effect sparkle=397,346 --effect sparkle=150,428
npm run art:import -- art-source/raw/buildings/tavern.png --as tavern_r0 --no-mirror \
  --erase 170,100,300,187 --effect chimney=222,191 \
  --effect window=271,313 --effect window=370,301 --effect window=171,444 \
  --effect window=87,411 --effect window=342,513 --effect window=445,491
npm run art:webp
```

How the cottage import values were measured, in source image pixels:
- `--base 125,770,890`: the feet of the left and right walls (x 125 and x 770), and the bottom of
  the front stone corner pillar (y 890). This registers the house to its logical 1×1 tile.
- `--visual -0.25,-1,1.25,1.25`: the painted grass plot overhangs the tile by about a quarter
  tile on every side, and the garden needs the extra tile at `v −1…0`.
- `--effect-src chimney=437,100`: the chimney opening; smoke rises from here.
- Lit windows (5, including the porch lantern) and the top point are detected automatically.
