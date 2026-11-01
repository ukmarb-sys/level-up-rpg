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
- **Only r0 is required.** Mirrored rotations are a **temporary fallback** until all four
  directional images (`_r0`–`_r3`) exist. `npm run validate:assets` lists each direction that is
  still borrowed as an `info` line. When other rotations are missing:
  - r2 reuses r0;
  - r1 and r3 use r0 **mirrored horizontally**. That keeps the footprint correct, but it also
    flips the lighting to come from the top-right and mirrors doors and signs.

  Painting r1–r3 removes these artefacts. A real directional image always takes priority over a
  fallback; no code change is needed when one is added.

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

If the artwork paints more ground than the building occupies (a garden, a path, lanterns), the
canvas is sized from the **visual footprint** instead. The anchor stays at the centre of the
**logical** footprint. See §11.

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
  by pixel. `npm run art:webp` (Python + Pillow) then writes the WebP the game ships: quality 95
  with sharp YUV for colour, full-quality alpha, typically 4–5× smaller. When both exist, the game
  loads only the WebP, and the validator pixel-checks the PNG master. A WebP whose size differs
  from its master is reported as stale.
- **Raw sources:** original generator output goes in `art-source/raw/`. It isn't bundled; see
  `art-source/README.md` for the exact command that reproduces each committed sprite.
- **Backgrounds:** fully transparent (alpha 0). Glows may be semi-transparent. JPEG is rejected
  because it cannot hold transparency.
- **Metadata:** `src/assets/art/art-meta.json` records each imported sprite's measured **top**
  and **effect points** (§7). It is written by the importer and can be edited by hand.

```
src/assets/art/
  art-meta.json
  buildings/
    cottage/    cottage_r0.png  cottage_r1.png  cottage_r2.png  cottage_r3.png
                cottage_r0_ground.png   (optional ground layer, see §11)
    farm/       farm_r0.png     farm_r1.png     farm_r2.png     farm_r3.png
    sawmill/    sawmill_r0.png  sawmill_r1.png  sawmill_r2.png  sawmill_r3.png
    mageTower/  mageTower_r0.png mageTower_r1.png mageTower_r2.png mageTower_r3.png
  terrain/      grass_0.png  grass_1.png  grass_2.png  grass_3.png
  props/        tree_pine.png  tree_spruce.png  tree_fir.png  tree_oak.png
                tree_enchanted.png  tree_mystic.png  bush_fern.png  glow_shroom.png
                glow_bloom.png  rock_mossy.png  rock_small.png  ruin_pillar.png
                standing_stone.png  crystal_cluster.png
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
| `buildings/blacksmith/blacksmith_r0.png` | no | 2×1 | 448 × 448 | (224, 320) | (32, 288) | (416, 352) | (288, 416) |
| `buildings/blacksmith/blacksmith_r1.png` | no | 1×2 | 448 × 448 | (224, 320) | (32, 352) | (416, 288) | (160, 416) |
| `buildings/blacksmith/blacksmith_r2.png` | no | 2×1 | 448 × 448 | (224, 320) | (32, 288) | (416, 352) | (288, 416) |
| `buildings/blacksmith/blacksmith_r3.png` | no | 1×2 | 448 × 448 | (224, 320) | (32, 352) | (416, 288) | (160, 416) |
| `buildings/tavern/tavern_r0.png` | no | 2×2 | 576 × 640 | (288, 480) | (32, 480) | (544, 480) | (288, 608) |
| `buildings/tavern/tavern_r1.png` | no | 2×2 | 576 × 640 | (288, 480) | (32, 480) | (544, 480) | (288, 608) |
| `buildings/tavern/tavern_r2.png` | no | 2×2 | 576 × 640 | (288, 480) | (32, 480) | (544, 480) | (288, 608) |
| `buildings/tavern/tavern_r3.png` | no | 2×2 | 576 × 640 | (288, 480) | (32, 480) | (544, 480) | (288, 608) |
| `buildings/marketplace/marketplace_r0.png` | no | 3×2 | 704 × 512 | (352, 320) | (32, 288) | (672, 352) | (416, 480) |
| `buildings/marketplace/marketplace_r1.png` | no | 2×3 | 704 × 512 | (352, 320) | (32, 352) | (672, 288) | (288, 480) |
| `buildings/marketplace/marketplace_r2.png` | no | 3×2 | 704 × 512 | (352, 320) | (32, 288) | (672, 352) | (416, 480) |
| `buildings/marketplace/marketplace_r3.png` | no | 2×3 | 704 × 512 | (352, 320) | (32, 352) | (672, 288) | (288, 480) |
| `buildings/alchemist/alchemist_r0.png` | no | 2×2 | 576 × 640 | (288, 480) | (32, 480) | (544, 480) | (288, 608) |
| `buildings/alchemist/alchemist_r1.png` | no | 2×2 | 576 × 640 | (288, 480) | (32, 480) | (544, 480) | (288, 608) |
| `buildings/alchemist/alchemist_r2.png` | no | 2×2 | 576 × 640 | (288, 480) | (32, 480) | (544, 480) | (288, 608) |
| `buildings/alchemist/alchemist_r3.png` | no | 2×2 | 576 × 640 | (288, 480) | (32, 480) | (544, 480) | (288, 608) |
| `buildings/temple/temple_r0.png` | no | 3×3 | 832 × 768 | (416, 544) | (32, 544) | (800, 544) | (416, 736) |
| `buildings/temple/temple_r1.png` | no | 3×3 | 832 × 768 | (416, 544) | (32, 544) | (800, 544) | (416, 736) |
| `buildings/temple/temple_r2.png` | no | 3×3 | 832 × 768 | (416, 544) | (32, 544) | (800, 544) | (416, 736) |
| `buildings/temple/temple_r3.png` | no | 3×3 | 832 × 768 | (416, 544) | (32, 544) | (800, 544) | (416, 736) |
| `buildings/castle/castle_r0.png` | no | 4×4 | 1088 × 1280 | (544, 992) | (32, 992) | (1056, 992) | (544, 1248) |
| `buildings/castle/castle_r1.png` | no | 4×4 | 1088 × 1280 | (544, 992) | (32, 992) | (1056, 992) | (544, 1248) |
| `buildings/castle/castle_r2.png` | no | 4×4 | 1088 × 1280 | (544, 992) | (32, 992) | (1056, 992) | (544, 1248) |
| `buildings/castle/castle_r3.png` | no | 4×4 | 1088 × 1280 | (544, 992) | (32, 992) | (1056, 992) | (544, 1248) |

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
| `props/tree_spruce.png` | no | 1×1 | 320 × 576 | (160, 480) | (32, 480) | (288, 480) | (160, 544) |
| `props/tree_fir.png` | no | 1×1 | 320 × 480 | (160, 384) | (32, 384) | (288, 384) | (160, 448) |
| `props/tree_oak.png` | no | 1×1 | 320 × 448 | (160, 352) | (32, 352) | (288, 352) | (160, 416) |
| `props/tree_enchanted.png` | no | 1×1 | 320 × 480 | (160, 384) | (32, 384) | (288, 384) | (160, 448) |
| `props/tree_mystic.png` | no | 1×1 | 320 × 512 | (160, 416) | (32, 416) | (288, 416) | (160, 480) |
| `props/bush_fern.png` | no | 1×1 | 320 × 224 | (160, 128) | (32, 128) | (288, 128) | (160, 192) |
| `props/glow_shroom.png` | no | 1×1 | 320 × 224 | (160, 128) | (32, 128) | (288, 128) | (160, 192) |
| `props/glow_bloom.png` | no | 1×1 | 320 × 256 | (160, 160) | (32, 160) | (288, 160) | (160, 224) |
| `props/rock_mossy.png` | no | 1×1 | 320 × 256 | (160, 160) | (32, 160) | (288, 160) | (160, 224) |
| `props/rock_small.png` | no | 1×1 | 320 × 192 | (160, 96) | (32, 96) | (288, 96) | (160, 160) |
| `props/ruin_pillar.png` | no | 1×1 | 320 × 448 | (160, 352) | (32, 352) | (288, 352) | (160, 416) |
| `props/standing_stone.png` | no | 1×1 | 320 × 448 | (160, 352) | (32, 352) | (288, 352) | (160, 416) |
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
| `blacksmith_r0` | (320, 166) | (320, 174) | — | — | (122, 293) |
| `blacksmith_r1` | (179, 192) | (179, 200) | — | — | (198, 229) |
| `blacksmith_r2` | (128, 122) | (128, 130) | — | — | (326, 267) |
| `blacksmith_r3` | (269, 96) | (269, 104) | — | — | (250, 331) |
| `tavern_r0` | (422, 237) | (422, 245) | — | — | (122, 477) (390, 509) |
| `tavern_r1` | (294, 307) | (294, 315) | — | — | (198, 349) (134, 483) |
| `tavern_r2` | (154, 243) | (154, 251) | — | — | (454, 387) (186, 355) |
| `tavern_r3` | (282, 173) | (282, 181) | — | — | (378, 515) (442, 381) |
| `marketplace_r0` | (352, 184) | — | — | — | — |
| `marketplace_r1` | (352, 184) | — | — | — | — |
| `marketplace_r2` | (352, 184) | — | — | — | — |
| `marketplace_r3` | (352, 184) | — | — | — | — |
| `alchemist_r0` | (403, 242) | (403, 250) | — | — | (186, 509) |
| `alchemist_r1` | (301, 306) | (301, 314) | — | — | (134, 381) |
| `alchemist_r2` | (173, 254) | (173, 262) | — | — | (390, 355) |
| `alchemist_r3` | (275, 190) | (275, 198) | — | — | (442, 483) |
| `temple_r0` | (416, 208) | — | — | — | — |
| `temple_r1` | (416, 208) | — | — | — | — |
| `temple_r2` | (416, 208) | — | — | — | — |
| `temple_r3` | (416, 208) | — | — | — | — |
| `castle_r0` | (544, 290) | — | — | — | (288, 1000) (800, 1000) |
| `castle_r1` | (749, 392) | — | — | — | (288, 744) (288, 1000) |
| `castle_r2` | (544, 494) | — | — | — | (800, 744) (288, 744) |
| `castle_r3` | (339, 392) | — | — | — | (800, 1000) (800, 744) |

### Cottage artwork with an overhanging garden (logical footprint stays 1×1)

| Cottage `--visual` | art-meta `visual` | Canvas (px) | Anchor (logical centre) | Logical tile corners L / R / front | Visual corners L / R / front |
| --- | --- | --- | --- | --- | --- |
| `2x2` | `{ u0: -0.5, v0: -0.5, u1: 1.5, v1: 1.5 }` | 576 × 896 | (288, 736) | (160, 736) (416, 736) (288, 800) | (32, 736) (544, 736) (288, 864) |
| `3x3` | `{ u0: -1, v0: -1, u1: 2, v1: 2 }` | 832 × 1344 | (416, 1120) | (288, 1120) (544, 1120) (416, 1184) | (32, 1120) (800, 1120) (416, 1312) |
<!-- asset-tables:end -->

The reference points in the last table come from the built-in procedural buildings. Art painted
in the same proportions lines up with them. Imported art does not rely on them: the importer
records the real positions in `art-meta.json`.

**Priority 1 (required set):** `cottage_r0`, `farm_r0`, `sawmill_r0`, `mageTower_r0` and
`terrain/grass_0`.
**Priority 2:** `grass_1`–`grass_3` and the 14 scenery props. Every prop already has a procedural painted version (see `docs/ENVIRONMENT.md`); a painted file replaces it automatically.
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
2. **Cleans generator alpha:** some generators never write fully opaque pixels (max alpha
   251–254) and leave near-invisible haze (alpha 1–8) over the background. When it detects
   this, the importer clears the haze, makes the body fully opaque and stretches the soft edge
   in between, so anti-aliasing is kept.
3. **Removes the background** when the image has no real transparency: flat colour or a fake
   checkerboard, flood-filled from the border.
4. **Despeckles:** removes stray specks of 16 px or less, but keeps detached parts such as
   floating orbs and sparks.
5. **Crops** to the painted pixels.
6. **Checks orientation:** for non-square footprints, art drawn for the other orientation is
   mirrored, with a warning.
7. **Scales** the art to span `fill` (default 96%) of the footprint diamond's width (the
   *visual* footprint if `--visual` is given), using high-quality premultiplied-alpha
   resampling. For buildings that are too tall, the canvas height is increased (and recorded
   in `art-meta.json`); with `--no-auto-height`, and for props, the art is scaled down instead.
8. **Aligns** the lowest painted pixel to the footprint's front corner, centred on the anchor.
9. **Measures** `top`, lit windows and the orb, and writes `art-meta.json`.
10. **Writes** `src/assets/art/<file>.png` and a preview at `art-previews/<name>.preview.png`
   (green = footprint, cyan = anchor, yellow = top, magenta = effects). Previews are
   git-ignored.
11. **Validates** the result. It exits with an error if anything fails.

Options:

| Option | Effect |
| --- | --- |
| `--fill F` | Footprint-width coverage (0.3–1.2, default 0.96). Lower it for art with wide overhangs. |
| `--offset-y PX` | Move the art down (+) or up (−) after alignment, e.g. to sink a drop shadow |
| `--mirror` / `--no-mirror` | Force or forbid mirroring (default: auto-detect) |
| `--key auto/on/off` | Background removal (default auto) |
| `--keep-islands` | Don't despeckle |
| `--erase X0,Y0,X1,Y1` | Clear an output-pixel rectangle after aligning, before the top and effect points are measured (e.g. a static smoke plume painted above a chimney). Every other pixel is unchanged. Repeatable. |
| `--inpaint X0,Y0,X1,Y1` | After `--erase`: repaint an output-pixel rectangle row by row as a blend between the opaque pixels just left and right of it (e.g. a smoke stub left inside a chimney mouth). Keep it small. Repeatable. |
| `--visual WxD` / `--visual U0,V0,U1,V1` | The art paints more than its logical footprint (§11) |
| `--ground FILE` | Ground-layer image (same pixel size as the input) for gardens, paths and shadows (§11) |
| `--height PX` / `--no-auto-height` | Set the canvas height / shrink tall art instead of growing the canvas |
| `--base L,R,FRONT` | Register by the building's **base** instead of fitting the whole image: input-pixel x of the base's left and right corners, and y of its front corner. The base fills the logical footprint, and everything painted around it becomes overhang. Needs `--visual`. Also trims unused canvas height. |
| `--base-fill F` | Fraction of the logical footprint the base spans (default 1) |
| `--ground-rect U0,V0,U1,V1` | With `--base`: the tiles (local frame) an **independent** `--ground` image of any size covers, e.g. a garden beside the building |
| `--ground-scale match/fit` | Ground image at the building's painted scale (default) or fitted to the rect |
| `--effect-src NAME=X,Y` | Effect point in **input** image pixels; mapped through the import transform |
| `--tile square/diamond` | Terrain source type (default auto) |
| `--effect NAME=X,Y` / `NAME=none` | Set or disable chimney, orb, wheel or window (repeatable) |
| `--dry-run` | Report only; write nothing |

**Terrain:** generating a **seamless top-down square texture** and letting the importer project
it (rotate 45°, squash 2:1, wrap-around sampling) gives tiles that meet without seams. Painted
diamonds are stretched to 256×128 and masked, and they will show seams unless their edges are
painted to match.

**Props:** 1×1 footprint, but unlike buildings a prop **stands on the anchor**: the trunk or
base sits on the ground centre of its tile `(160, height − 96)`, exactly where the procedural
props are drawn. Props are usually narrower than the tile, which is fine.
- A prop delivered at its **exact spec canvas** with real transparency is kept pixel for pixel:
  no crop, scale or shift. Only the alpha is cleaned.
- Other props are fitted like buildings (`--fill`), then aligned with their lowest pixel on the
  anchor.
- The importer also removes **sprite-sheet slivers**: detached pieces whose outer side is a
  straight vertical cut (fragments of a neighbouring sprite). Round sparks and motes are kept.
- The game randomly mirrors props and varies their size by ±15%, so avoid asymmetric details
  and strongly one-sided lighting.
- Leave at least **16 px of side margin**. Art sliced from a sheet with no margin is truncated
  by a straight vertical edge, and the validator warns about it.

Alpha clean-up also covers bodies that are noisy rather than nearly opaque: when more than 1% of
the solid interior is still semi-transparent after the standard clean-up (typical: foliage at
alpha 215–250), the interior is made fully opaque. The outer 2 px keep their anti-aliasing, and
genuinely translucent areas (shadows and glows below alpha 200) are untouched. Ground layers are
never solidified.

## 9. Validation

`npm run validate:assets` (add `-- --strict` to fail on missing required art) checks:

| Check | Catches |
| --- | --- |
| Filename, folder, letter case and lowercase extension | Files the game would silently ignore (with the exact fix) |
| Exact canvas size | Art made for another footprint or scale |
| Alpha channel; transparent corners | Flat backgrounds |
| 8-bit RGBA, non-interlaced PNG | Encodings the validator can't inspect |
| Art not touching the edges | Cropped generations |
| Lowest pixel at the front corner (buildings) | Wrong anchor or vertical offset |
| Horizontal extent vs. footprint (buildings) | Wrong footprint or scale |
| Lowest pixel on the anchor, base near its x (props) | Floating props, or props aligned to the front corner like a building |
| Solid body (≤ 1% of the interior semi-transparent) | See-through generator output that skipped `art:import` |
| Slivers with a straight cut; straight cut on a prop's side (warning) | Art sliced from a sprite sheet: neighbour fragments, truncated foliage |
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
- **Real rotations:** providing `_r1`, `_r2` and `_r3` for each building. Mirrored rotations are
  temporary fallbacks, and the validator lists them until they're replaced.
- **Seamless terrain:** making terrain textures seamless before import.
- **WebP:** run `npm run art:webp` (needs Python with Pillow) after importing. Alternatively, convert the PNG masters with an external tool such as
  `cwebp -q 90 -alpha_q 100 in.png -o out.webp` and re-running the validator. Not required:
  PNG works in game.

## 11. Artwork larger than its logical footprint

> **Project decisions**
> - The cottage's logical (collision) footprint stays **1×1**.
> - Gardens, flowers, paths and fences are **visual decoration only**: they never block
>   neighbouring tiles.
> - Use **separate ground and building layers** wherever possible: decoration goes in
>   `_ground.png`, and the building image holds the building.
> - Mirrored rotations are **temporary fallbacks** until four directional images exist.
> - Gameplay and saves are unaffected.

Premium illustrations often paint more than the building itself: a cottage with a garden,
lanterns, a path and flower beds around a 1×1 tile. The pipeline supports this without changing
gameplay.

### Two footprints

| | Logical footprint | Visual footprint |
| --- | --- | --- |
| Defined in | `src/core/buildings.ts` (cottage stays **1×1**) | `art-meta.json` → `visual`, per image |
| Used for | Collision, placement, moving, saves, the "occupied" shading | Canvas size, art alignment, the dashed outline |
| Shown as | The solid green/red diamond while placing; the solid gold tile when selected | A dashed outline around the art |

- Decorative overhang **never blocks placement**: other buildings can be built right up against
  the cottage's tile, even where its garden is painted.
- Overhang can run past the edge of the map.
- Saves contain only logical positions, so old saves load unchanged.

### Declaring the visual footprint

`visual` is given in the building's **own** tile frame: `u` along its width and `v` along its
depth, as at r0. The logical footprint is `u 0…W`, `v 0…D`. The game rotates the bounds with the
building, so one declaration works for every rotation.

```json
"buildings/cottage/cottage_r0": { "visual": { "u0": -0.5, "v0": -0.5, "u1": 1.5, "v1": 1.5 } }
```

Rules (checked by `npm run validate:assets`):
- the bounds must contain the logical footprint;
- values must be in quarter tiles;
- overhang is at most 2 tiles per side (more than 1 tile gives a warning).

`height` (a multiple of 32, from 128 to 4096) overrides the canvas height. By default, the canvas
height scales with the visual width, and the importer grows it automatically for tall art.

For the cottage, the canvas and anchor become (generated values, also in §6):

| Visual footprint | Canvas | Anchor | Logical 1×1 tile front corner | Visual front corner |
| --- | --- | --- | --- | --- |
| 2×2 (half a tile all round) | 576 × 896 | (288, 736) | (288, 800) | (288, 864) |
| 3×3 (one tile all round) | 832 × 1344 | (416, 1120) | (416, 1184) | (416, 1312) |

### Ground layer and building layer (preferred)

Export decoration that extends beyond the tile as a separate image of the exact same size:

`buildings/<type>/<type>_r<N>_ground.png` (for example `buildings/cottage/cottage_r0_ground.png`)

| Layer | Contains | Drawn |
| --- | --- | --- |
| `cottage_r0_ground.png` | Lawn, flower beds, **fences**, paths, stepping stones, low hedges, the soft contact shadow | In the ground band: above terrain, below the build grid and below **every** building |
| `cottage_r0.png` | The cottage itself: walls, roof, chimney, door, windows, and anything attached to it (porch lantern, window boxes) | Sorted with the buildings by the 1×1 logical tile |

- **Fences** go in the ground layer even though they stand up. They're low, and in the ground
  layer they can never cover a neighbouring building or its base.
- **Neighbours:** a building placed on a tile under the garden is always drawn over it, and
  never conflicts with it in placement or collision.
- **Fallback:** a single image (house and garden together) still works, but then everything is
  sorted with the house, so its back edge can paint over a building directly behind.
  `npm run validate:assets` warns about every image that overhangs without a ground layer.
- **Directions:** each directional image has its own ground layer (`_r1_ground.png`, …). Mirrored
  fallbacks mirror the ground layer with the building.
- **Shared metadata:** the ground layer uses its building image's metadata; it has no
  `art-meta.json` entry of its own. Alignment is validated on building and ground layer
  together. Import every direction with the same `--visual`; the validator warns if the
  directions disagree.

### Selection, taps and zoom

- **Taps** are pixel-accurate on painted art. A tap selects:
  1. the front-most building whose upright art is under the finger (so tapping a roof that
     overlaps the tile behind selects the cottage);
  2. otherwise, the building that occupies the tapped tile;
  3. otherwise, a building whose ground layer is under the finger.

  A garden therefore never steals a tap from the building standing on that tile. While placing
  or moving, taps still only move the preview.
- **Selected:** the logical tile gets the gold highlight, and the visual footprint gets a dashed
  outline. **Placing/moving:** the solid diamond is the collision area, and the dashed outline is
  the decoration.
- **Mobile zoom:**
  - the game builds half- and quarter-resolution copies of every painted texture and switches
    between them as you zoom, so zoomed-out art doesn't shimmer;
  - when painted art is loaded, maximum zoom is capped at one source pixel per device pixel
    (2.0× on a typical 2× phone), so art is never shown blurry and upscaled.

### Importing an illustration with overhang

**Shipped example: the cottage and mystic garden.** These are the exact commands that produce
the committed files (also in `art-source/README.md`):

```bash
npm run art:import -- art-source/raw/levelup_cottage.png --as cottage_r0 \
  --base 125,770,890 --visual -0.25,-1,1.25,1.25 \
  --ground art-source/raw/levelup_mystic_garden.png --ground-rect 0,-1,1,0 \
  --effect-src chimney=437,100
npm run art:webp
```

What this does:
- The house's base (x 125–770, front corner y 890 in the painting) is registered to the 1×1 tile.
- The painted plot around it overhangs by about a quarter tile.
- The garden goes on the tile behind-right of the cottage (`v −1…0`), at the same painted scale.
  That tile stays free for building; anything built there draws over the garden.


```bash
# preferred: house and garden (incl. flowers and fences) exported as two layers of the same pixel size
npm run art:import -- path/to/cottage_house.png --as cottage_r0 --visual 2x2 --ground path/to/cottage_garden.png

# fallback: one image (house + garden), garden half a tile beyond the tile on every side
npm run art:import -- path/to/cottage.png --as cottage_r0 --visual 2x2

# asymmetric: garden only in front of the cottage (one extra tile along +v)
npm run art:import -- path/to/cottage.png --as cottage_r0 --visual 0,0,1,2
```

The importer scales the art so it spans the **visual** footprint, aligns the lowest painted
pixel (of house and garden together) to the **visual** front corner, writes `visual` (and
`height` if it grew the canvas) into `art-meta.json`, and validates the result.

The preview (`art-previews/<name>.preview.png`) shows:
- green: the visual footprint;
- orange: the logical tile;
- cyan: the anchor;
- yellow: the top;
- magenta: effect points.

The house should stand on the orange diamond. If it doesn't, the illustration's garden isn't
centred on the house. Re-import with asymmetric bounds (e.g. `--visual -0.5,-0.25,1.5,1.75`) and
check the preview again.

