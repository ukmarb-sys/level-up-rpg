# Artwork specification

This is the contract for artwork in *LEVEL UP RPG: Realms of Becoming*. The numbers come from
`src/assets/spec.ts` and `src/assets/manifest.ts`. The tables in §6 are generated with
`npm run art:table`, and a test fails if this page and the code disagree.

> **AI image generators do not produce game-ready sprites.** They ignore exact sizes, add
> backgrounds (often a fake "transparency" checkerboard), crop edges, drift the camera angle and
> never tile seamlessly. Use `npm run art:import` (§8): it automates cutting out, scaling and
> aligning, measures the result and validates it. A person still has to look at every result
> in game.

## 1. Art direction

Premium stylized fantasy:
- charming medieval architecture with warm window light;
- enchanted forests and mysterious ancient ruins;
- rich green terrain;
- violet-blue magic with gold accents.

Shapes must read clearly at phone size: a cottage is about 64 px wide on screen at default zoom.
Prefer strong silhouettes and value contrast over fine texture.

## 2. Camera and projection

| Property | Value |
| --- | --- |
| Projection | **2:1 dimetric ("isometric")**, orthographic — no perspective, no vanishing points |
| Camera | Rotated **45°** around the vertical, looking down at **30°** elevation |
| Tile edges on screen | 1:2 pixel slope (26.57° from horizontal) |
| Tile in game | 64 × 32 world px (`TILE_W`, `TILE_H` in `src/game/iso.ts`) |
| Source scale | **4×** — one tile diamond = **256 × 128 px** in the image; sprites are drawn at 0.25 |
| Vertical scale | Heights are not foreshortened: 1 world px of height = 4 source px |
| Light | Key light from the **top-left**; shadows fall to the bottom-right |
| Visible faces | Top, front-left (+y) and front-right (+x) |

## 3. Footprints, rotation and orientation

| Building | r0 / r2 footprint | r1 / r3 footprint |
| --- | --- | --- |
| Cottage | 1 × 1 | 1 × 1 |
| Farm | 2 × 3 | 3 × 2 |
| Sawmill | 2 × 1 | 1 × 2 |
| Mage Tower | 2 × 2 | 2 × 2 |

- **w** runs along grid +x, which is the **down-right** edge on screen.
- **d** runs along grid +y, which is the **down-left** edge on screen.
- **r0** puts the entrance on the **front-left** face.
- Each rotation turns the building 90° clockwise as seen on screen. The entrance then faces:
  - r1: up-left (hidden);
  - r2: up-right (hidden);
  - r3: down-right.
- **Only r0 is required.** When other rotations are missing:
  - r2 reuses r0;
  - r1 and r3 use r0 **mirrored horizontally**. That keeps the footprint correct, but it also
    flips the lighting to come from the top-right and mirrors doors and signs.

  Painting r1–r3 removes these artefacts.

## 4. Canvas size and anchor

### Object sprites (buildings and props)

```
canvas width  = (w + d) × 128 + 2 × 32      footprint diamond + 32 px margin left and right
canvas height = per asset (buildings: cottage 448, farm 512, sawmill 448, mage tower 1024)
anchor        = (width / 2, height − 32 − (w + d) × 32)   ground centre of the footprint diamond
front corner  = 32 px above the bottom edge
```

- The diamond's left and right corners touch the 32 px side margins.
- Soft contact shadows may extend up to 24 px below the front corner.
- Keep at least 2 px of transparency on every side.
- Empty space above a building is fine. Never stretch art to fill the height.

### Terrain tiles

- Exactly **256 × 128 px**. The diamond touches all four edges, pixels outside it are fully
  transparent, and pixels inside are fully opaque.
- The game tints each tile towards a noise colour mixed 72% with white, which multiplies the
  art to roughly **80–89%** brightness (the scenery ring outside the grid gets about 77–80%).
  **Paint tiles 10–20% brighter** than the final look you want.

## 5. Files and formats

- **Location:** everything goes in `src/assets/art/`. Vite bundles only the files that exist,
  and anything missing falls back to the built-in procedural art.
- **Extensions:** must be **lowercase** `.png` or `.webp`. Paths are **case-sensitive**
  (`mageTower`, `_r0`). The game ignores `cottage_r0.PNG`, and the validator reports it with the
  exact rename to make.
- **Formats:** `art:import` writes **8-bit RGBA PNG** masters, which the validator inspects pixel
  by pixel. WebP with alpha also loads; if both exist the game uses the WebP. WebP files get
  only size and alpha checks, so keep the PNG master.
- **Backgrounds:** fully transparent (alpha 0). Glows may be semi-transparent. JPEG is rejected
  because it cannot hold transparency.
- **Metadata:** `src/assets/art/art-meta.json` records each imported sprite's measured **top**
  and **effect points** (§7). It is written by the importer and can be edited by hand.

```
src/assets/art/
  art-meta.json
  buildings/
    cottage/    cottage_r0.png  cottage_r1.png  cottage_r2.png  cottage_r3.png
    farm/       farm_r0.png     farm_r1.png     farm_r2.png     farm_r3.png
    sawmill/    sawmill_r0.png  sawmill_r1.png  sawmill_r2.png  sawmill_r3.png
    mageTower/  mageTower_r0.png mageTower_r1.png mageTower_r2.png mageTower_r3.png
  terrain/      grass_0.png  grass_1.png  grass_2.png  grass_3.png
  props/        tree_pine.png  tree_oak.png  tree_enchanted.png
                rock_mossy.png  ruin_pillar.png  crystal_cluster.png
```

## 6. Exact files, dimensions and footprints

All coordinates are in source pixels from the image's top-left corner. Corners are where the
footprint diamond meets the ground.

<!-- asset-tables:start (generated by `npm run art:table`; do not edit by hand) -->
### Buildings

| File (`src/assets/art/…`) | Required | Footprint (w×d) | Canvas (px) | Anchor | Left corner | Right corner | Front corner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `buildings/cottage/cottage_r0.png` | **yes** | 1×1 | 320 × 448 | (160, 352) | (32, 352) | (288, 352) | (160, 416) |
| `buildings/cottage/cottage_r1.png` | no | 1×1 | 320 × 448 | (160, 352) | (32, 352) | (288, 352) | (160, 416) |
| `buildings/cottage/cottage_r2.png` | no | 1×1 | 320 × 448 | (160, 352) | (32, 352) | (288, 352) | (160, 416) |
| `buildings/cottage/cottage_r3.png` | no | 1×1 | 320 × 448 | (160, 352) | (32, 352) | (288, 352) | (160, 416) |
| `buildings/farm/farm_r0.png` | **yes** | 2×3 | 704 × 512 | (352, 320) | (32, 352) | (672, 288) | (288, 480) |
| `buildings/farm/farm_r1.png` | no | 3×2 | 704 × 512 | (352, 320) | (32, 288) | (672, 352) | (416, 480) |
| `buildings/farm/farm_r2.png` | no | 2×3 | 704 × 512 | (352, 320) | (32, 352) | (672, 288) | (288, 480) |
| `buildings/farm/farm_r3.png` | no | 3×2 | 704 × 512 | (352, 320) | (32, 288) | (672, 352) | (416, 480) |
| `buildings/sawmill/sawmill_r0.png` | **yes** | 2×1 | 448 × 448 | (224, 320) | (32, 288) | (416, 352) | (288, 416) |
| `buildings/sawmill/sawmill_r1.png` | no | 1×2 | 448 × 448 | (224, 320) | (32, 352) | (416, 288) | (160, 416) |
| `buildings/sawmill/sawmill_r2.png` | no | 2×1 | 448 × 448 | (224, 320) | (32, 288) | (416, 352) | (288, 416) |
| `buildings/sawmill/sawmill_r3.png` | no | 1×2 | 448 × 448 | (224, 320) | (32, 352) | (416, 288) | (160, 416) |
| `buildings/mageTower/mageTower_r0.png` | **yes** | 2×2 | 576 × 1024 | (288, 864) | (32, 864) | (544, 864) | (288, 992) |
| `buildings/mageTower/mageTower_r1.png` | no | 2×2 | 576 × 1024 | (288, 864) | (32, 864) | (544, 864) | (288, 992) |
| `buildings/mageTower/mageTower_r2.png` | no | 2×2 | 576 × 1024 | (288, 864) | (32, 864) | (544, 864) | (288, 992) |
| `buildings/mageTower/mageTower_r3.png` | no | 2×2 | 576 × 1024 | (288, 864) | (32, 864) | (544, 864) | (288, 992) |

### Terrain

| File (`src/assets/art/…`) | Required | Footprint (w×d) | Canvas (px) | Anchor | Left corner | Right corner | Front corner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `terrain/grass_0.png` | **yes** | 1×1 | 256 × 128 | (128, 64) | (0, 64) | (256, 64) | (128, 128) |
| `terrain/grass_1.png` | no | 1×1 | 256 × 128 | (128, 64) | (0, 64) | (256, 64) | (128, 128) |
| `terrain/grass_2.png` | no | 1×1 | 256 × 128 | (128, 64) | (0, 64) | (256, 64) | (128, 128) |
| `terrain/grass_3.png` | no | 1×1 | 256 × 128 | (128, 64) | (0, 64) | (256, 64) | (128, 128) |

### Props

| File (`src/assets/art/…`) | Required | Footprint (w×d) | Canvas (px) | Anchor | Left corner | Right corner | Front corner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `props/tree_pine.png` | no | 1×1 | 320 × 512 | (160, 416) | (32, 416) | (288, 416) | (160, 480) |
| `props/tree_oak.png` | no | 1×1 | 320 × 448 | (160, 352) | (32, 352) | (288, 352) | (160, 416) |
| `props/tree_enchanted.png` | no | 1×1 | 320 × 480 | (160, 384) | (32, 384) | (288, 384) | (160, 448) |
| `props/rock_mossy.png` | no | 1×1 | 320 × 256 | (160, 160) | (32, 160) | (288, 160) | (160, 224) |
| `props/ruin_pillar.png` | no | 1×1 | 320 × 448 | (160, 352) | (32, 352) | (288, 352) | (160, 416) |
| `props/crystal_cluster.png` | no | 1×1 | 320 × 288 | (160, 192) | (32, 192) | (288, 192) | (160, 256) |

### Reference top and effect points (source px)

| File | Top (marker) | Chimney | Orb | Saw blade | Windows |
| --- | --- | --- | --- | --- | --- |
| `cottage_r0` | (160, 192) | (204, 197) | — | — | (206, 333) |
| `cottage_r1` | (160, 192) | (166, 222) | — | — | (114, 333) |
| `cottage_r2` | (160, 192) | (116, 203) | — | — | (116, 331) |
| `cottage_r3` | (160, 192) | (154, 178) | — | — | (204, 331) |
| `farm_r0` | (561, 175) | — | — | — | — |
| `farm_r1` | (417, 312) | — | — | — | — |
| `farm_r2` | (143, 241) | — | — | — | — |
| `farm_r3` | (287, 104) | — | — | — | — |
| `sawmill_r0` | (307, 187) | — | — | (250, 261) | — |
| `sawmill_r1` | (141, 187) | — | — | (198, 261) | — |
| `sawmill_r2` | (147, 107) | — | — | (198, 235) | — |
| `sawmill_r3` | (301, 107) | — | — | (250, 235) | — |
| `mageTower_r0` | (288, 416) | — | (288, 352) | — | (237, 790) (339, 790) |
| `mageTower_r1` | (288, 416) | — | (288, 352) | — | (237, 790) (339, 790) |
| `mageTower_r2` | (288, 416) | — | (288, 352) | — | (237, 790) (339, 790) |
| `mageTower_r3` | (288, 416) | — | (288, 352) | — | (237, 790) (339, 790) |
<!-- asset-tables:end -->

The reference points in the last table come from the built-in procedural buildings. Art painted
in the same proportions lines up with them. Imported art does not rely on them: the importer
records the real positions in `art-meta.json`.

**Priority 1 (required set):** `cottage_r0`, `farm_r0`, `sawmill_r0`, `mageTower_r0` and
`terrain/grass_0`.
**Priority 2:** `grass_1`–`grass_3` and the six props.
**Priority 3:** r1–r3 for each building (removes mirroring).

## 7. Top and effect points

| Point | Used for | Set by |
| --- | --- | --- |
| `top` | Selection marker above the building | **Automatic:** highest painted pixel |
| `windows` (cottage, mage tower) | Warm flickering window glow | **Automatic:** warm lit-window clusters (up to 4) |
| `orb` (mage tower) | Orb glow, bob and orbiting runes | **Automatic:** bright white/violet blob in the top 35% of the art |
| `chimney` (cottage) | Rising smoke | **Manual:** `--effect chimney=X,Y` |
| `wheel` (sawmill) | Sawdust puffs at the blade | **Manual:** `--effect wheel=X,Y` |

- A point that isn't detected or set is stored as `null`, and that effect stays off. The game
  never guesses a location for painted art.
- Procedural crop sway and the spinning blade are only drawn on the procedural buildings. A
  painted farm or sawmill keeps its own painted crops and blade.
- The selection marker uses the recorded `top`, so it sits right above the painted art.
  Without metadata it falls back to the reference point in §6.

Example `art-meta.json` entry:

```json
{
  "buildings/cottage/cottage_r0": {
    "top": { "x": 160, "y": 158 },
    "effects": { "windows": [{ "x": 116, "y": 326 }], "chimney": { "x": 175, "y": 185 } },
    "import": { "source": "cottage.png", "fill": 0.96, "offsetY": 0, "mirrored": false, "scale": 0.4735 }
  }
}
```

## 8. Importing AI-generated artwork

```bash
# buildings and props: any size, transparent or flat/checkerboard background
npm run art:import -- path/to/cottage.png --as cottage_r0
npm run art:import -- path/to/farm.png    --as farm_r0
npm run art:import -- path/to/sawmill.png --as sawmill_r0 --effect wheel=250,260
npm run art:import -- path/to/tower.png   --as mageTower_r0

# set or fix points afterwards, without re-importing the pixels
npm run art:import -- --measure cottage_r0 --effect chimney=175,185

# terrain from a seamless top-down square texture (best for seamless tiles) or a painted diamond
npm run art:import -- path/to/grass_square.png --as grass_0

npm run validate:assets
```

What the importer does automatically:
1. **Decodes** RGBA, RGB, palette, grey and 16-bit PNGs (convert WebP or JPEG inputs to PNG
   first).
2. **Removes the background** when the image has no real transparency: flat colour or a fake
   checkerboard, flood-filled from the border.
3. **Despeckles:** removes stray specks of 16 px or less, but keeps detached parts such as
   floating orbs and sparks.
4. **Crops** to the painted pixels.
5. **Checks orientation:** for non-square footprints, art drawn for the other orientation is
   mirrored, with a warning.
6. **Scales** the art to span `fill` (default 96%) of the footprint diamond's width, using
   high-quality premultiplied-alpha resampling. Art that's too tall is scaled down and
   reported.
7. **Aligns** the lowest painted pixel to the footprint's front corner, centred on the anchor.
8. **Measures** `top`, lit windows and the orb, and writes `art-meta.json`.
9. **Writes** `src/assets/art/<file>.png` and a preview at `art-previews/<name>.preview.png`
   (green = footprint, cyan = anchor, yellow = top, magenta = effects). Previews are
   git-ignored.
10. **Validates** the result. It exits with an error if anything fails.

Options:

| Option | Effect |
| --- | --- |
| `--fill F` | Footprint-width coverage (0.3–1.2, default 0.96). Lower it for art with wide overhangs. |
| `--offset-y PX` | Move the art down (+) or up (−) after alignment, e.g. to sink a drop shadow |
| `--mirror` / `--no-mirror` | Force or forbid mirroring (default: auto-detect) |
| `--key auto/on/off` | Background removal (default auto) |
| `--keep-islands` | Don't despeckle |
| `--tile square/diamond` | Terrain source type (default auto) |
| `--effect NAME=X,Y` / `NAME=none` | Set or disable chimney, orb, wheel or window (repeatable) |
| `--dry-run` | Report only; write nothing |

**Terrain:** generating a **seamless top-down square texture** and letting the importer project
it (rotate 45°, squash 2:1, wrap-around sampling) gives tiles that meet without seams. Painted
diamonds are stretched to 256×128 and masked, and they will show seams unless their edges are
painted to match.

**Props:** imported exactly like buildings (1×1 footprint). The game randomly mirrors props,
so avoid asymmetric details and strongly one-sided lighting.

## 9. Validation

`npm run validate:assets` (add `-- --strict` to fail on missing required art) checks:

| Check | Catches |
| --- | --- |
| Filename, folder, letter case and lowercase extension | Files the game would silently ignore (with the exact fix) |
| Exact canvas size | Art made for another footprint or scale |
| Alpha channel; transparent corners | Flat backgrounds |
| 8-bit RGBA, non-interlaced PNG | Encodings the validator can't inspect |
| Art not touching the edges | Cropped generations |
| Lowest pixel at the front corner | Wrong anchor or vertical offset |
| Horizontal extent vs. footprint | Wrong footprint or scale |
| Front-corner position (non-square) | Mirrored art or the wrong orientation |
| Terrain diamond coverage | Square tiles, and holes that cause seams |
| `art-meta.json` keys and points | Typos, points off the canvas, a stale `top`, effects over transparent pixels, sprites without metadata |

These checks are heuristics. Always place, rotate and move the building in game
(`npm run dev`) and confirm its base sits on the green preview diamond.

## 10. What still needs a person

- **Prompting:** getting the 2:1 angle and top-left lighting out of the generator.
- **Visual judgement:** checking every preview and every building in game.
- **Effect points:** placing the cottage `chimney` and sawmill `wheel` (and the `orb` if it
  isn't detected).
- **Real rotations:** painting r1–r3 if mirrored rotations look wrong.
- **Seamless terrain:** making terrain textures seamless before import.
- **WebP (optional):** converting the PNG masters with an external tool such as
  `cwebp -q 90 -alpha_q 100 in.png -o out.webp` and re-running the validator. Not required:
  PNG works in game.
