# Artwork drop folder

Don't copy raw generator output here. Import it instead: the importer removes backgrounds,
scales and aligns the art to the footprint, measures its top and effect points into
`art-meta.json`, and validates the result.

```bash
npm run art:import -- path/to/cottage.png --as cottage_r0
# art that paints a garden around its 1x1 tile (logical footprint unchanged):
npm run art:import -- path/to/cottage.png --as cottage_r0 --visual 2x2 [--ground path/to/garden.png]
npm run validate:assets
```

File names, sizes and footprints are listed in `docs/ASSET_SPEC.md`. Extensions must be
lowercase (`.png` / `.webp`), and paths are case-sensitive. Anything missing falls back to the
procedural art, so the game always runs.

No artwork is checked in yet. `art-meta.json` is intentionally `{}`.
