# Artwork specification

This is the contract for artwork in *LEVEL UP RPG: Realms of Becoming*. Every number below is
generated from `src/assets/spec.ts` and `src/assets/manifest.ts`; those files are the source
of truth. Run `npm run validate:assets` after adding or changing any image.

> **AI image generators do not produce game-ready sprites.** They ignore exact sizes, add
> backgrounds, crop edges, drift the camera angle and never tile seamlessly. Treat each
> generated image as a *painting* that must be cut out, scaled, aligned to the template and
> validated. Nothing in the game assumes a generated image is already correct.

## 1. Art direction

Premium stylized fantasy:
- charming medieval architecture with warm window light;
- enchanted forests and mysterious ancient ruins;
- rich green terrain;
- violet-blue magic with gold accents.

Shapes must read clearly at phone size: a cottage is about 64 px wide on a typical phone at
default zoom. Prefer strong silhouettes and value contrast over fine texture.

## 2. Camera and projection

| Property | Value |
| --- | --- |
| Projection | **2:1 dimetric ("isometric")** — no perspective, no vanishing points |
| Camera | Looking down at the ground, rotated 45° — a square tile appears as a diamond twice as wide as tall |
| Tile in game | 64 × 32 world px |
| Source scale | **4×** — one tile diamond = **256 × 128 px** in the image |
| Vertical scale | Heights use the same 4× scale (a 20 world-px wall = 80 source px) |
| Light | Key light from the **top-left / north**; shadows fall to the bottom-right |
| Visible faces | Top, front-left (+y) and front-right (+x) faces |
| Outlines | Optional dark outline, ≤ 3 px at source scale |

Prompting tip: ask for *"2:1 isometric game sprite, orthographic, 30° elevation (dimetric),
single object, plain flat background, no ground beyond the footprint"*. Then fix the angle by
skewing or redrawing against the template. Don't rely on the prompt alone.

## 3. Footprints, rotation and orientation

A building at rotation `r` occupies `w × d` tiles. Odd rotations swap width and depth.

| Building | r0 / r2 footprint | r1 / r3 footprint |
| --- | --- | --- |
| Cottage | 1 × 1 | 1 × 1 |
| Farm | 2 × 3 | 3 × 2 |
| Sawmill | 2 × 1 | 1 × 2 |
| Mage Tower | 2 × 2 | 2 × 2 |

- **w** runs along grid +x, which is the **down-right** edge on screen.
- **d** runs along grid +y, which is the **down-left** edge on screen.
- **r0** shows the building's *front* facing the viewer on the front-left (+y) face.
- **r1** is r0 turned 90° clockwise (seen from above), **r2** is 180° and **r3** is 270°.
- **Only r0 is required.** The game derives other rotations when they are missing:
  - **r2** reuses r0 (same footprint, but the "back" is never shown);
  - **r1** and **r3** use r0 mirrored horizontally (mirroring swaps the footprint, like a quarter turn).

  Supplying real r1–r3 views removes the mirrored look (e.g. a door on the "wrong" side).

## 4. Canvas size and anchor

### Object sprites (buildings and props)

```
canvas width  = (w + d) × 128 + 2 × 32        (footprint diamond + 32 px margin each side)
canvas height = per asset (see table)
anchor        = (canvas width / 2,  canvas height − 32 − (w + d) × 32)
              = the CENTRE of the footprint diamond at ground level
front corner  = 32 px above the bottom edge
```

- The footprint diamond's **left and right corners touch the 32 px side margins** exactly.
- Its **front (lowest) corner sits 32 px above the bottom edge**. Soft contact shadows may dip
  up to 24 px below it.
- Leave at least 2 px of transparency on every side. Art touching an edge is reported as cropped.
- The background must be **fully transparent** (alpha 0). Semi-transparent glows are fine.

### Terrain tiles

- Exactly **256 × 128 px**. The diamond fills the canvas edge to edge.
- Pixels outside the diamond are fully transparent.
- Pixels inside are fully opaque, so tiles meet without gaps.

## 5. Files

Put the images in `src/assets/art/` (they are bundled by Vite, and only files that exist are
loaded). Use **WebP with alpha** for shipping and keep the **8-bit RGBA PNG master**, which the
validator checks pixel-by-pixel. If both formats exist, the game uses the WebP.

```
src/assets/art/
  buildings/
    cottage/   cottage_r0.webp  cottage_r1.webp  cottage_r2.webp  cottage_r3.webp
    farm/      farm_r0.webp     farm_r1.webp     farm_r2.webp     farm_r3.webp
    sawmill/   sawmill_r0.webp  sawmill_r1.webp  sawmill_r2.webp  sawmill_r3.webp
    mageTower/ mageTower_r0.webp mageTower_r1.webp mageTower_r2.webp mageTower_r3.webp
  terrain/     grass_0.webp  grass_1.webp  grass_2.webp  grass_3.webp
  props/       tree_pine.webp  tree_oak.webp  tree_enchanted.webp
               rock_mossy.webp  ruin_pillar.webp  crystal_cluster.webp
```

Filenames are case-sensitive and must match exactly (`mageTower`, `_r0`, lowercase extension).

## 6. Exact files to produce

**Priority 1 (required set):** five images that replace every procedural building and the
ground.

| File | Canvas (px) | Footprint | Anchor (px) | Front corner (px) | Content |
| --- | --- | --- | --- | --- | --- |
| `buildings/cottage/cottage_r0` | 320 × 448 | 1×1 | (160, 352) | (160, 416) | Timber-framed cottage, warm lit windows, chimney |
| `buildings/farm/farm_r0` | 704 × 512 | 2×3 | (352, 320) | (288, 480) | Fenced moonwheat field with a small red barn at the back |
| `buildings/sawmill/sawmill_r0` | 448 × 448 | 2×1 | (224, 320) | (288, 416) | Timber sawmill with saw blade and log pile |
| `buildings/mageTower/mageTower_r0` | 576 × 1024 | 2×2 | (288, 864) | (288, 992) | Slender stone tower, violet spire, floating orb above |
| `terrain/grass_0` | 256 × 128 | tile | (128, 64) | — | Lush grass diamond, soft detail, no strong features at the edges |

**Priority 2:** terrain variety and scenery.

| File | Canvas (px) | Anchor (px) | Content |
| --- | --- | --- | --- |
| `terrain/grass_1`, `terrain/grass_2`, `terrain/grass_3` | 256 × 128 | (128, 64) | Variants: mossier, sunlit, meadow flowers |
| `props/tree_pine` | 320 × 512 | (160, 416) | Dark pine, enchanted forest |
| `props/tree_oak` | 320 × 448 | (160, 352) | Broad oak, rich green canopy |
| `props/tree_enchanted` | 320 × 480 | (160, 384) | Twisted tree with violet-blue glowing leaves |
| `props/rock_mossy` | 320 × 256 | (160, 160) | Moss-covered boulder |
| `props/ruin_pillar` | 320 × 448 | (160, 352) | Broken ancient pillar, gold-inlaid runes |
| `props/crystal_cluster` | 320 × 288 | (160, 192) | Violet-blue magic crystals |

**Priority 3:** true rotations (removes mirroring).

| File | Canvas (px) | Footprint | Front corner (px) |
| --- | --- | --- | --- |
| `cottage_r1`, `cottage_r2`, `cottage_r3` | 320 × 448 | 1×1 | (160, 416) |
| `farm_r1`, `farm_r3` | 704 × 512 | 3×2 | (416, 480) |
| `farm_r2` | 704 × 512 | 2×3 | (288, 480) |
| `sawmill_r1`, `sawmill_r3` | 448 × 448 | 1×2 | (160, 416) |
| `sawmill_r2` | 448 × 448 | 2×1 | (288, 416) |
| `mageTower_r1`, `mageTower_r2`, `mageTower_r3` | 576 × 1024 | 2×2 | (288, 992) |

Note that for non-square footprints, the **front corner is not horizontally centred**. Paint
the building so its footprint matches the diamond for that orientation.

## 7. Production workflow (recommended)

1. **Template.** Draw the footprint diamond on a canvas of the exact size above (corners from
   the formulas in §4). Keep it as a guide layer.
2. **Generate.** Ask the image tool for the subject on a plain background. Generate larger
   than needed.
3. **Cut out.** Remove the background completely. Check that the corners are alpha 0.
4. **Fit.** Scale and skew the painting so its ground plane matches the guide diamond. The base
   corners must land on the diamond's corners. Don't stretch the building to fill the canvas
   height; empty space above is fine.
5. **Lighting.** Match top-left light. Add a soft contact shadow inside the footprint.
6. **Export.** Save an 8-bit RGBA PNG master, then run `npm run validate:assets`.
7. **Ship.** Convert to WebP with alpha (e.g. `cwebp -q 90 -alpha_q 100 in.png -o out.webp`),
   keep the PNG master, and run the validator again.
8. **Check in game.** `npm run dev`. Place, rotate and move the building, and confirm its base
   sits exactly on the green preview diamond.

Terrain tiles: AI output is **not seamless**. Paint the tiles so the diamond edges carry
low-contrast, similar colours. Avoid strong features within ~16 px of the edges. Check a 4×4
patch in an image editor before exporting. The game varies tint per tile, which helps hide
repetition but cannot fix hard seams.

## 8. Optional effect points

Manifest entries can declare `effects` in source pixels (same space as the anchor) so
animations attach to the painted art:
- `chimney` — smoke origin;
- `orb` — magic orb glow;
- `windows` — warm glow points.

Without them, sprites show no attached effects; the building still works. Add them in
`src/assets/manifest.ts` once the final art exists.

## 9. Validation

`npm run validate:assets` (or `-- --strict` to fail on missing required art) checks every file in
`src/assets/art`:

| Check | Catches |
| --- | --- |
| Filename/folder matches the manifest | typos, wrong rotation suffix, unsupported extensions |
| Exact canvas size | images made for another footprint or scale |
| Alpha channel present; corners transparent | flat backgrounds |
| 8-bit RGBA, non-interlaced PNG | encodings the validator can't inspect |
| Art not touching the edges | cropped generations |
| Lowest pixel near the front corner (not below, not floating) | wrong anchor / vertical offset |
| Horizontal extent matches the footprint diamond | wrong footprint size or scale |
| Front corner position for non-square footprints | mirrored art or the wrong orientation |
| Terrain: transparent outside, opaque inside the diamond | square tiles, holes that cause seams |
| Both WebP and PNG present | ambiguity (warning) |

WebP files get size and alpha checks only. Pixel alignment is verified on the PNG master.
These checks are heuristics: they catch the common failure modes, but always look at the art
in game before shipping.
