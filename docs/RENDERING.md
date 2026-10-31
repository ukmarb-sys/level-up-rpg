# How the city is rendered

This page describes the rendering pipeline as of the asset-pipeline milestone. Gameplay
rules (`src/core`) are not involved in rendering and are unchanged by it.

## Layers and depth

Phaser draws objects by `depth` (higher draws later / on top). The scene uses fixed bands:

| Depth | Layer | Source |
| --- | --- | --- |
| -2000 | Floating-island cliff, strata and roots | `EnvironmentLayer.drawCliff` (procedural) |
| -1000 | Ground: one seamless grass TileSprite masked to the island (or painted terrain tiles) | `env-grass` / terrain art |
| -999 | Tone field multiplied over the grass (moss, meadow, forest floor) | procedural canvas |
| -998 | Ley-line rim around the buildable area | procedural |
| -900 | Ground details (flowers, clover, moss, pebbles, leaves) | `env-details` atlas |
| -800 + depth/1000 | Building ground layers (`*_ground.png`: gardens, paths, shadows) | painted art only |
| -500 / -499 | Construction grid and occupied-tile tint (build mode only) | procedural |
| ≈ x + y + (w + d)/2 | Buildings, scenery props, selection glow | sprites or procedural fallbacks |
| 8000 | Placement/move preview ("ghost") | same visuals as buildings, 75% alpha |
| 9000 | Ambient: fireflies, floating spores, soft magical glows (additive) | `env-glow` |
| 9200+ | Puffs, selection marker | procedural |

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

See [ENVIRONMENT.md](ENVIRONMENT.md) for the full Enchanted Wilderness environment.

- **Without terrain artwork (default):** one seamless 512² grass texture (power of two, so it
  repeats and mipmaps) is drawn as a single TileSprite in world space and masked to the island
  diamond, so there are no tile seams. A low-resolution tone field (8 world px per pixel, upscaled
  with bilinear filtering and multiplied over the grass) adds soft moss and meadow patches, shade
  near the back forest and the darker forest floor of the ring. `groundTone` is a continuous
  function of position, so the field has no steps or staircase edges.
- **With artwork:** `src/assets/art/terrain/grass_N` images replace the procedural ground. They
  are drawn per tile, scaled to 64×32 world px and tinted gently by the same tone field.
- The logical grid is still exactly 20×20. The 3-tile ring outside it is scenery only: it has
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
   the footprint centre inside the building's container, with a soft contact shadow below.
   Effects attach to the sprite's points: manifest reference values, overridden per file by
   `src/assets/art/art-meta.json` (which `npm run art:import` writes). These cover chimney
   smoke, the orb glow with runes, window glow and sawdust at the saw blade. A `null` point
   switches that effect off. Points are mirrored along with the image.
3. **Fallback path.** If no art is available, `drawBuilding` (`src/game/art.ts`) draws the
   original procedural building from isometric primitives (boxes, gable roofs, spires). Its
   animation anchors (chimney smoke, crop sway, saw blade, orb) come from
   `proceduralAnchors` in `src/assets/geometry.ts`, the same pure function the manifest uses
   for its reference points.

The container sits at the footprint's top corner for both paths. That means placement, the
pop-in tween, selection, movement and demolition code are shared.

## Scenery

`layoutProps` (`src/game/props.ts`) places 14 kinds of prop on the 3-tile ring:
- **Back edges:** layered forest (pine, spruce, fir, oak, mystical and enchanted trees), with
  undergrowth next to the grid.
- **Side corners:** ancient ruins, standing stones, mystical trees and crystals.
- **Front edges:** only low ferns, rocks and glowing plants.

Tall props stand only where their silhouette rises away from the grid on screen. A test checks
this geometrically for every placement. Each prop uses its painted sprite when one exists (see
the asset manifest), otherwise its frame from the procedural `env-props` atlas.

## Selection feedback

A selected building gets a soft gold footprint fill, a glow outline (drawn just below the
building, so the building itself is never covered) and a bobbing marker above its top point.
For procedural buildings that point comes from `proceduralAnchors`. For sprites it's the
measured top in `art-meta.json`, or the manifest's reference value when no metadata exists.
The bottom action bar shows its footprint, its production or description, and its actions.

## Asset loading

`queueArt` (`src/game/assets.ts`) runs in `CityScene.preload`. Vite's
`import.meta.glob('../assets/art/**/*.{webp,png}')` bundles only the image files that exist
under `src/assets/art`. The pattern is case-sensitive, and `matchArtFiles` matches the same way,
so the validator and the game always agree on which files load:
- missing art costs nothing and produces no network 404s;
- URLs automatically include the GitHub Pages base path and a content hash.

If a file fails to decode at runtime, it is treated as missing and the fallback is drawn.

## Artwork larger than its footprint

Each painted building image has two footprints:
- a **logical** one (`src/core/buildings.ts`), used for gameplay, collision and saves;
- a **visual** one (`art-meta.json` → `visual`), used only for drawing.

`buildingGeometry` (`src/assets/manifest.ts`) sizes the canvas from the visual footprint and
keeps the anchor at the logical footprint's centre. That means the scene positions every sprite
exactly as before: at the centre of the tiles the building occupies.

- **Layers:** by project decision, decoration (gardens, flowers, fences, paths) goes in the
  ground layer and the building image holds only the building. Collision always uses the logical
  footprint, so decoration never blocks neighbouring tiles.
- **Depth:** the upright sprite sorts by its logical footprint. Its optional ground layer
  (`*_ground.png`) goes in the `groundDecalDepth` band (`src/game/spriteRules.ts`), below every
  building.
- **Picking:** `CityScene.pick` checks the upright art pixel by pixel (`spritePixelAt` +
  `textures.getPixelAlpha`) from the front-most building backwards, then the tapped tile, then
  ground layers (`resolveTap`).
- **Preview over painted art:** painted art can fully cover its own tile, so the placement
  preview repeats the collision outline above the art and tints painted art red while blocked.
- **Outlines:** the selection highlight and the placement preview draw the logical diamond solid
  and the visual footprint dashed (`drawnVisualRect` mirrors it with the image).
- **Level of detail:** `lodTextureKey` (`src/game/assets.ts`) lazily creates ½- and ¼-size copies
  of each painted texture. `updateLod` switches all tracked images when the zoom crosses the
  thresholds from `chooseLod`, keeping on-screen texels between about 0.5 and 1 device px.
- **Zoom limit:** `maxZoomFor` caps zoom at `SOURCE_SCALE / devicePixelRatio` when painted art is
  loaded.

## Painted art in the UI, opening camera and stale pages

These three behaviours make sure a newly imported sprite is actually *visible* to players:

- **UI icons:** `BuildingIcon` (build menu, action bar) uses the same bundled sprite as the map
  (`src/assets/artUrls.ts`), cropped to the building by `buildingIconCrop`: the logical tile,
  from the painted top down to the front corner. Buildings without painted art keep their
  vector icon.
- **Opening camera:** `initialView` (`src/game/spriteRules.ts`) centres on the player's
  buildings, or the map centre for a new realm. Its zoom shows about six tiles across a phone
  (a 1×1 building is about 65 CSS px wide), capped at the previous desktop zoom. Pinch out to see
  the whole island.
- **Stale pages:** GitHub Pages caches `index.html` for about 10 minutes, and home-screen web apps
  can keep a page alive longer, so a player may still run the previous build after a deploy.
  - Every build carries an id (the commit SHA, shown on the title screen as `build abc1234`) and
    emits `version.json`.
  - The app fetches it with `cache: 'no-store'` on start and whenever it returns to the
    foreground. If a different build is deployed, it shows "A new version of the realm is
    available" with a Reload button, which saves before reloading.

