# How the city is rendered

This page describes the rendering pipeline as of the asset-pipeline milestone. Gameplay
rules (`src/core`) are not involved in rendering and are unchanged by it.

## Layers and depth

Phaser draws objects by `depth` (higher draws later / on top). The scene uses fixed bands:

| Depth | Layer | Source |
| --- | --- | --- |
| -2000 | Floating-island cliff, strata and roots | `CityScene.drawIsland` (procedural) |
| -1000 | Ground tiles (playable 20×20 grid + 2-tile scenery ring) | terrain art or procedural textures |
| -999 | Ley-line rim around the buildable area | procedural |
| -900 | Ground details (flowers, pebbles, mushrooms) | procedural, inside the grid only |
| -500 / -499 | Construction grid and occupied-tile tint (build mode only) | procedural |
| ≈ x + y + (w + d)/2 | Buildings, scenery props, selection glow | sprites or procedural fallbacks |
| 8000 | Placement/move preview ("ghost") | same visuals as buildings, 75% alpha |
| 9000+ | Floating motes, puffs, selection marker | procedural |

**Depth sorting.** Buildings and props use `footprintDepth(x, y, w, d) = (x + w/2) + (y + d/2)`,
the sum of the footprint centre's grid coordinates (`src/game/iso.ts`). In this projection
things further down the screen have larger `x + y`, so they draw later. This is a heuristic.
Two large footprints that touch along a long edge can occasionally sort the wrong way. Sprites
use exactly the same value as the procedural art, so swapping in artwork does not change the
ordering.

## Projection

- 2:1 isometric diamonds, 64×32 world px per tile (`TILE_W`, `TILE_H` in `src/game/iso.ts`).
- `isoPoint(gx, gy, z)` → world `x = (gx − gy)·32`, `y = (gx + gy)·16 − z`. Grid `(0,0)` is the
  top corner of the map. +x runs down-right and +y runs down-left on screen.
- The camera zoom is `userZoom × devicePixelRatio` (DPR capped at 2). The canvas is rendered
  at device resolution and scaled down by CSS.

## Terrain

- Every tile is one image anchored at its top corner (origin `0.5, 0`).
- **With artwork:** `src/assets/art/terrain/grass_N` images are scaled to 64×32 world px and
  tinted towards white (72%), so the painted colours stay dominant and the noise only adds variation.
- **Without artwork:** four near-white procedural textures (`grass-0..3`) carry tuft detail,
  and each tile is tinted to its final colour. That colour comes from:
  - two-octave value noise (moss ↔ lush green),
  - meadow patches,
  - a soft "light from the north" gradient,
  - a little per-tile jitter.

  All of it is deterministic (`src/game/noise.ts`), so the island looks the same on every load.
- No outlines are baked into the tiles. The grid is a separate overlay (below).
- The logical grid is still exactly 20×20. The 2-tile ring outside it is scenery only: it has
  no tiles in `GameState`, and placement and collision never see it.

## Construction grid (build mode only)

`CityScene.drawGrid` draws the 21 + 21 grid lines once. The overlay fades in (220 ms) when the
store's mode becomes `placing` or `moving`, and fades out otherwise. While it is visible, tiles
occupied by other buildings get a faint dark tint. The building being moved is excluded so it
reads as free space.

## Buildings

`CityScene.addBuildingVisual(container, type, rotation, alpha)` is the single entry point. It
is used for placed buildings and for the preview:

1. `resolveBuildingSprite` (`src/assets/resolve.ts`) looks for loaded artwork, in this order:
   1. the exact rotation;
   2. the opposite rotation (same footprint);
   3. a horizontally mirrored adjacent rotation. Mirroring an isometric image swaps the
      footprint's width and depth, which is exactly what a quarter turn does.
2. **Sprite path.** `makeSprite` creates an image whose origin is the manifest anchor (the
   ground centre of the footprint diamond), scaled to `1/SOURCE_SCALE` (0.25). It is placed at
   the footprint centre inside the building's container, with a soft contact shadow below. If
   the manifest lists effect points (chimney, orb, windows), smoke and glows attach there.
3. **Fallback path.** If no art is available, `drawBuilding` (`src/game/art.ts`) draws the
   original procedural building from isometric primitives (boxes, gable roofs, spires). This
   path also provides the animation anchors (chimney smoke, crop sway, saw blade, orb).

The container sits at the footprint's top corner for both paths. That means placement, the
pop-in tween, selection, movement and demolition code are shared.

## Scenery

`layoutProps` (`src/game/props.ts`) places pines, oaks, enchanted trees, rocks, ruins and
crystals on the ring outside the grid:
- dense forest along the far edges;
- only low props along the front edges, so nothing hides buildings;
- ruins at the left and right corners.

Each prop uses its sprite if present, otherwise `drawProp`.

## Selection feedback

A selected building gets a soft gold footprint fill, a glow outline (drawn just below the
building, so the building itself is never covered) and a bobbing marker above its top anchor.
The bottom action bar shows its footprint, its production or description, and its actions.

## Asset loading

`queueArt` (`src/game/assets.ts`) runs in `CityScene.preload`. Vite's `import.meta.glob`
bundles only the image files that exist under `src/assets/art`:
- missing art costs nothing and produces no network 404s;
- URLs automatically include the GitHub Pages base path and a content hash.

If a file fails to decode at runtime, it is treated as missing and the fallback is drawn.
