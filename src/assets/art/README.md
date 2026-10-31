# Artwork drop folder

Don't copy raw generator output here. Import it instead: the importer removes backgrounds,
scales and aligns the art to the footprint, measures its top and effect points into
`art-meta.json`, and validates the result.

```bash
npm run art:import -- path/to/cottage.png --as cottage_r0
# art that paints a garden around its 1x1 tile (logical footprint unchanged);
# preferred: garden, flowers and fences in a separate ground layer of the same size
npm run art:import -- path/to/cottage.png --as cottage_r0 --visual 2x2 --ground path/to/garden.png
npm run art:webp         # write the WebP the game ships (Python + Pillow)
npm run validate:assets
```

File names, sizes and footprints are listed in `docs/ASSET_SPEC.md`. Extensions must be
lowercase (`.png` / `.webp`), and paths are case-sensitive. Anything missing falls back to the
procedural art, so the game always runs.

Shipped so far: the cottage (`buildings/cottage/cottage_r0`) with the mystic garden as its ground
layer, and six painted trees (`props/tree_pine`, `tree_spruce`, `tree_fir`, `tree_oak`,
`tree_enchanted`, `tree_mystic`). At startup the game packs all painted props and the procedural
prop atlas into one texture, so the forest stays in one draw batch on Android. Raw sources and the exact import command are in `art-source/`. Each sprite has a PNG master
(pixel-validated) and a WebP (shipped, from `npm run art:webp`).
