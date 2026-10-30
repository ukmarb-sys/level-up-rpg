# Artwork drop folder

Put finished sprites here using the exact paths in `docs/ASSET_SPEC.md`, e.g.
`buildings/cottage/cottage_r0.webp`. Only files that exist are bundled. Anything missing falls
back to the procedural art, so the game always runs.

After adding or changing art, run:

```bash
npm run validate:assets
```

This folder intentionally contains no images yet: no placeholder art is checked in.
