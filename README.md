# LEVEL UP RPG: Realms of Becoming

Fantasy city-building RPG powered by real-life goals and AI coaching.

This repository contains the first playable, mobile-first prototype: build a small
fantasy realm on a floating isometric island.

## Play

- **Live build:** https://ukmarb-sys.github.io/level-up-rpg/ (published by the
  _Deploy to GitHub Pages_ workflow once Pages is enabled — see below)
- **Locally:** `npm install && npm run dev`, then open the printed URL (use your phone
  on the same network with `npm run dev -- --host`).

### Controls

| Action | Touch | Desktop |
| --- | --- | --- |
| Pan | drag with one finger | drag |
| Zoom | pinch, or the +/− buttons | mouse wheel, or +/− buttons |
| Build | pick a card in the build menu, tap/drag the ghost, **Build** | same, `Enter` to confirm |
| Rotate | **Rotate** button | `R` |
| Select / move / demolish | tap a building, then **Move**, **Rotate** or **Demolish** | click |
| Cancel | **Cancel** / **Close** | `Esc` |

While placing or moving, the construction grid appears and occupied tiles are shaded. The
preview footprint is green where the building fits and red where it is blocked; the action bar
says why (overlap, outside the realm, or not enough resources). The build tray can be
collapsed to see more of the map. Rotating a ghost next to another building nudges it
to the nearest free spot within two tiles.

### Buildings and resources

Every realm starts with **200 wood, 150 stone and 50 magic**.

| Building | Footprint | Cost | Produces |
| --- | --- | --- | --- |
| Cottage | 1×1 | 20 wood, 10 stone | — |
| Farm | 2×3 | 30 wood | — |
| Sawmill | 2×1 | 40 wood, 20 stone | 6 wood / min |
| Mage Tower | 2×2 | 50 wood, 80 stone, 30 magic | 3 magic / min |

Moving and rotating placed buildings is free. Demolishing refunds half the cost.

The game autosaves to `localStorage` shortly after every change and when the tab is
hidden or closed; reopening the page offers **Continue your realm**.

## Development

```bash
npm install
npm run dev        # Vite dev server
npm test           # Vitest unit tests (placement, resources, save/load, projection)
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ at /level-up-rpg/ like GitHub Pages
npm run art:import -- art.png --as cottage_r0   # cut out, scale, align, measure, validate
npm run art:webp          # PNG masters -> shipped WebP (Python + Pillow)
npm run validate:assets   # check artwork in src/assets/art against the manifest
npm run art:table         # print the asset reference tables used in docs/ASSET_SPEC.md
```

Tech: React 19, TypeScript, Vite, Phaser 3. No paid APIs or secrets.

### Artwork

The game is ready for painted / AI-generated sprites. Import each image with
`npm run art:import -- <file.png> --as <name>`, which removes the background, scales and aligns
it to the footprint, measures its top and effect points, and validates it. Names, sizes and
footprints are listed in [docs/ASSET_SPEC.md](docs/ASSET_SPEC.md). Art that paints more than its
tile (for example a cottage with a garden) is supported with `--visual 2x2`. The building's
gameplay footprint stays the same; see §11 of the spec.
Anything missing falls back to the built-in procedural art. The cottage now uses painted art,
with the mystic garden as its ground layer (sources in `art-source/`).
[docs/RENDERING.md](docs/RENDERING.md) explains how terrain, buildings, depth sorting and
the build-mode grid are drawn.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code is organised and how
future systems (quests, coaching, progression, rewards, mysteries) plug in.

## Deployment

- `.github/workflows/ci.yml` runs tests and the production build on pull requests and
  on pushes to non-`main` branches.
- `.github/workflows/deploy.yml` runs on pushes to `main` (or manually): tests, builds
  with `VITE_BASE=/<repo-name>/`, and publishes `dist/` to GitHub Pages.

**One-time setup:** in the repository settings go to _Settings → Pages_ and set
_Source_ to **GitHub Actions**. The workflow cannot enable Pages itself with the default
token.
