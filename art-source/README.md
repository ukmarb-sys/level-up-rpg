# Raw artwork sources

Original generator output, kept so every shipped sprite can be reproduced. Nothing in this
folder is bundled into the game. The game only loads the processed files in `src/assets/art/`.

| Source | Becomes | Notes |
| --- | --- | --- |
| `raw/levelup_cottage.png` (850×1024) | `src/assets/art/buildings/cottage/cottage_r0.{png,webp}` | Cottage, entrance on the front-left face (r0). Real transparency, no baked checkerboard. Generator alpha (max 254 plus background haze) is cleaned automatically on import. |
| `raw/levelup_mystic_garden.png` (686×1024) | `src/assets/art/buildings/cottage/cottage_r0_ground.{png,webp}` | Decorative ground layer of the cottage, placed on the tile behind-right of it. It never blocks that tile. |
| `raw/trees/tree_{pine,spruce,fir,oak,enchanted,mystic}.png` (320 × 512/576/480/448/480/512) | `src/assets/art/props/tree_*.{png,webp}` | From `levelup_trees_pack.zip`. Delivered at the exact spec canvas with the trunk on the anchor, so they're kept pixel for pixel. Import cleans the generator alpha (haze, 1–5% of the body semi-transparent) and removes slivers of neighbouring trees left by sprite-sheet slicing (fir, oak, enchanted, mystic). |

| `raw/buildings/farm.png` (854×788) | `src/assets/art/buildings/farm/farm_r0.{png,webp}` | From `levelup_buildings_pack.zip`. Farmhouse, wheat field, vegetable rows, fence and coop on one grass base, fitted to the **2×3** footprint (the logical footprint is authoritative; nothing was resized in gameplay). Canvas grown to 704×544 for the (since removed) painted smoke. The static painted plume is erased after alignment (`--erase 470,20,552,118`) and the pale smoke stub left inside the chimney mouth is retouched from the dark mouth beside it (`--inpaint 503,121,511,126`, 40 px); every other pixel is unchanged. Animated smoke rises from the mouth (510, 122). |
| `raw/buildings/castle.png` (1312×1199) | `src/assets/art/buildings/castle/castle_r0.{png,webp}` | Castle Keep, building 10 of 10. Real transparency; only the generator's faint halo (alpha 1–15) is cleaned on import. Fitted to the **4×4** footprint (scale 0.873); the gatehouse and stairs face front-left (r0), so it is **not mirrored**. Fifteen warm glows (eleven lit windows, both gate lanterns, both braziers) and warm rising embers on the braziers (`sparkle` with the castle's ember palette). No smoke and no chimney. The banners and pennants are painted (static). |
| `raw/buildings/temple_original.png` (1536×1024) → `raw/buildings/temple.png` | `src/assets/art/buildings/temple/temple_r0.{png,webp}` | Ancient Temple. Real transparency, but the generator left a semi-transparent glow: a faint halo (alpha 1–15, removed by the importer as haze) and a milky half-transparent fill inside the arch openings. `scripts/cutout-temple.py` clears every semi-transparent *area* (still semi-transparent after a 2 px erosion) and keeps the thin anti-aliased outlines; every remaining pixel is unchanged (tested). Fitted to the **3×3** footprint (scale 0.506). The stairs face front-right, but it is lit from the top-left like the village (pillar faces 144 vs 92), so it is **not mirrored**. Effects: an ice-blue breathing halo on the floating crystal (`orb`), cyan sparkles and rising motes on the runes, both statues' orbs and the altar (`sparkle` ×7), and a warm flicker on the two braziers (`window` ×2). The flames, rune light and crystal sparkle dots are painted, so no extra flames or particles are drawn on them. No chimney, so no smoke. |
| `raw/buildings/marketplace_original.png` (1536×1024) → `raw/buildings/marketplace.png` | `src/assets/art/buildings/marketplace/marketplace_r0.{png,webp}` | Marketplace, delivered **opaque on a textured grass field**. `scripts/cutout-marketplace.py` cuts it out: it keeps the stone-edged plaza diamond, flood-fills the grass from the image border (hue 72–105°, saturation 0.55–0.87, value 0.15–0.6), removes enclosed grass patches behind the bunting, banners and sign, clears darker/lantern-lit grass next to the background, and smooths the edge. Painted greens are protected (tree canopy, flower clusters, roof and facade vines, the bush by the cart, a green-awning stripe, the shrub left of the roof). Kept pixels keep their original colours (tested), and 99.3% of the grass is removed. Fitted to the **3×2** footprint (scale 0.422, not mirrored: the long side runs along the front-left edge). The plaza is painted squarer and flatter than a true 3×2 (sides about 1.15 : 1, edges sloping about 0.4 instead of 0.5), so its left corner sits about 15 world px below the footprint's left corner. Ten warm glows: eight lanterns and two hall windows. The hall's chimney is capped (no opening), so it has no smoke. |
| `raw/buildings/sawmill.png` (789×779) | `src/assets/art/buildings/sawmill/sawmill_r0.{png,webp}` | Fitted to the **2×1** footprint. A sliver of the neighbouring image on the left was removed. The sawdust effect is anchored where the blade meets the timber. The static painted smoke plume is erased after alignment (`--erase 255,75,335,149`) and the smoke stub inside the chimney mouth retouched (`--inpaint 274,150,280,153`, 18 px); every other pixel is unchanged. The original animated smoke rises from the middle of the opening (276, 151). |
| `raw/buildings/mage_tower.png` (707×788) | `src/assets/art/buildings/mageTower/mageTower_r0.{png,webp}` | Fitted to the **2×2** footprint. Imported with `--keep-islands` so the halo's sparkles survive. The crystal is detected as the orb; window glows are set by hand (auto-detection also picked the gold emblem on the banner). |
| `raw/buildings/tavern.png` (1254×1254) | `src/assets/art/buildings/tavern/tavern_r0.{png,webp}` | Tavern, fitted to the **2×2** footprint (scale 0.413). The door and patio face **front-right**, but it is deliberately **not mirrored** (`--no-mirror`): the painting is lit from the top-left like the rest of the village, and mirroring would flip that light. r1/r3 (mirrored r0) show the door front-left. Its base is painted slightly flatter than 2:1, so the side corners sit about 9 world px below the footprint diamond's (not corrected, to avoid distorting the art). The generator painted a **static** smoke plume above the chimney: it is erased from the sprite after alignment (`--erase 170,100,300,187`, output px; every building pixel is unchanged) and the game animates the Tavern's own smoke style from the chimney mouth (`--effect chimney=222,191`). Six warm glows: both dormers, the big latticed window, the hanging lantern by the sign and the two table lanterns (the beer-mug sign and banner are excluded). |
| `raw/buildings/alchemist.png` (1312×1199) | `src/assets/art/buildings/alchemist/alchemist_r0.{png,webp}` | Alchemist's Workshop, fitted to the **2×2** footprint (scale 0.381, no mirroring: the open shop porch already faces front-left). Generator alpha (body at 250–253, background haze) cleaned on import. The painted (static) smoke plume is erased after alignment; the smoke that covered the cap's back rim is trimmed to the rim's peaked outline (four 1-row `--erase` steps) and the smoke stub inside the mouth is retouched (`--inpaint 328,223,337,227`, 36 px). Every other pixel is unchanged. Delicate animated smoke rises from the mouth (332, 225). Warm glows on the dormer, arched window, kiln mouth and porch lantern (the green banner emblem and the green still are excluded); **emerald sparkles** on the still and three potion flasks. |
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
npm run art:import -- art-source/raw/buildings/farm.png --as farm_r0 \
  --erase 470,20,552,118 --inpaint 503,121,511,126 --effect chimney=510,122 \
  --effect window=437,219 --effect window=562,224 --effect window=404,286 --effect window=547,299 \
  --effect window=485,296 --effect window=356,390 \
  --effect butterfly=203,367 --effect butterfly=300,330 --effect butterfly=585,330 --effect butterfly=413,460
npm run art:import -- art-source/raw/buildings/sawmill.png --as sawmill_r0 --effect-src wheel=438,505 \
  --erase 255,75,335,149 --inpaint 274,150,280,153 \
  --effect chimney=276,151 --effect window=215,203 --effect window=339,236 --effect window=178,281 --effect window=365,287
npm run art:import -- art-source/raw/buildings/mage_tower.png --as mageTower_r0 --keep-islands \
  --effect window=332,632 --effect window=255,642 --effect window=170,731 \
  --effect window=184,854 --effect window=302,880 \
  --effect sparkle=129,842 --effect sparkle=447,876 --effect sparkle=414,755 --effect sparkle=244,870 --effect sparkle=368,880
npm run art:import -- art-source/raw/buildings/blacksmith.png --as blacksmith_r0 --effect chimney=148,73 \
  --effect-src window=777,790 --effect-src window=745,838 --effect-src window=828,649 \
  --effect-src window=487,755 --effect-src window=369,547
npm run art:import -- art-source/raw/buildings/alchemist.png --as alchemist_r0 \
  --erase 305,150,420,221 --erase 305,221,330,222 --erase 340,221,420,222 \
  --erase 305,222,326,223 --erase 344,222,420,223 --inpaint 328,223,337,227 --effect chimney=332,225 \
  --effect window=262,296 --effect window=366,428 --effect window=305,500 --effect window=221,389 \
  --effect sparkle=305,418 --effect sparkle=247,466 --effect sparkle=397,346 --effect sparkle=150,428
npm run art:import -- art-source/raw/buildings/tavern.png --as tavern_r0 --no-mirror \
  --erase 170,100,300,187 --effect chimney=222,191 \
  --effect window=271,313 --effect window=370,301 --effect window=171,444 \
  --effect window=87,411 --effect window=342,513 --effect window=445,491
python3 -I scripts/cutout-marketplace.py art-source/raw/buildings/marketplace_original.png \
  art-source/raw/buildings/marketplace.png /tmp/marketplace-cutout-preview.png
npm run art:import -- art-source/raw/buildings/marketplace.png --as marketplace_r0 \
  --effect window=175,223 --effect window=293,242 --effect window=148,300 --effect window=377,279 \
  --effect window=439,281 --effect window=422,376 --effect window=319,399 --effect window=542,255 \
  --effect window=413,205 --effect window=335,255
python3 -I scripts/cutout-temple.py art-source/raw/buildings/temple_original.png \
  art-source/raw/buildings/temple.png /tmp/temple-cutout-preview.png
npm run art:import -- art-source/raw/buildings/temple.png --as temple_r0 --effect orb=428,392 \
  --effect sparkle=338,632 --effect sparkle=350,464 --effect sparkle=347,495 --effect sparkle=392,333 \
  --effect sparkle=270,485 --effect sparkle=557,414 --effect sparkle=425,455 \
  --effect window=605,500 --effect window=437,551
npm run art:import -- art-source/raw/buildings/castle.png --as castle_r0 \
  --effect window=508,512 --effect window=617,522 --effect window=510,600 --effect window=607,607 \
  --effect window=266,762 --effect window=795,765 --effect window=563,853 --effect window=473,693 \
  --effect window=621,707 --effect window=656,741 --effect window=676,590 \
  --effect window=348,887 --effect window=478,926 --effect window=257,957 --effect window=439,1013 \
  --effect sparkle=257,957 --effect sparkle=439,1013
npm run art:webp
```

How the cottage import values were measured, in source image pixels:
- `--base 125,770,890`: the feet of the left and right walls (x 125 and x 770), and the bottom of
  the front stone corner pillar (y 890). This registers the house to its logical 1×1 tile.
- `--visual -0.25,-1,1.25,1.25`: the painted grass plot overhangs the tile by about a quarter
  tile on every side, and the garden needs the extra tile at `v −1…0`.
- `--effect-src chimney=437,100`: the chimney opening; smoke rises from here.
- Lit windows (5, including the porch lantern) and the top point are detected automatically.
