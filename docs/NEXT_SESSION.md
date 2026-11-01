# Next session: start here

## 1. Orient yourself (5 minutes)

1. Read [CLAUDE.md](../CLAUDE.md) (rules, commands, layout), then
   [PROJECT_STATUS.md](PROJECT_STATUS.md) and [VISUAL_ROADMAP.md](VISUAL_ROADMAP.md).
2. Check what has been merged since: PR **#11** (Blacksmith + this handoff) was open and
   unmerged at the end of the last session.
   ```bash
   git fetch origin && git log --oneline -5 origin/main
   ```
3. If your designated branch's PR has already been merged, restart the branch from
   `origin/main` before new work (`git checkout -B <branch> origin/main`). Never stack new
   commits on merged history.
4. Sanity-check the baseline:
   ```bash
   npm ci && npm test && npm run validate:assets && npm run build
   ```
   Expect all tests to pass and the validator to report no errors.

## 2. Typical tasks and how to do them

**The owner sends a building painting** (e.g. a tavern):
1. Copy the upload into a new empty scratch directory and inspect it with `python3 -I`
   (mode, size, alpha, corners, fringe on white and magenta, bounding box, base corners).
2. Copy it to `art-source/raw/buildings/<name>.png`.
3. Dry run: `npm run art:import -- art-source/raw/buildings/<name>.png --as <type>_r0 --dry-run`.
   Watch for the auto-mirror warning, and check the preview in `art-previews/` against the
   footprint diamond.
4. Find effect points (warm windows and lanterns, chimney mouth, crystals) in **input** pixels
   and pass them with `--effect-src`. Exclude signs, banners and emblems.
5. Import for real, then `npm run art:webp`. Add a case to `tests/buildingArt.test.ts`
   (pixel-exact reproduction, effect points on lit pixels, unchanged gameplay data) and the
   command to `art-source/README.md`.
6. Run `npm test`, `npm run validate:assets` and `npm run build`. Then build, preview, and
   screenshot it in game (Pixel 7 profile, seeded save; frame it with pinch and drag).
7. Update `docs/BUILDING_ART.md`, `docs/ART_BRIEFS.md`, `docs/VISUAL_OVERHAUL.md` and
   `docs/PROJECT_STATUS.md`. Commit, push, open a PR with screenshots, and report any visual
   limitations.

**Painted-only buildings** (`needsArt: true` in `src/core/buildings.ts`) appear in the build
menu automatically once `buildings/<type>/<type>_r0.{png,webp}` exists. Don't add code to show
them.

## 3. Open questions for the owner

- Merge PR #11 (Blacksmith + handoff)?
- Which art comes next? The roadmap suggests the Tavern and Alchemist first.
- Should r1–r3 rotation paintings be commissioned for the existing buildings (mirrored lighting
  today)?
- When should gameplay work (quests, AI coaching, rewards in `src/modules/`) resume?

## 4. Gotchas

- Headless Chromium reports the **low** quality tier, so only one cloud and fewer particles
  appear in screenshots.
- Playwright won't tap `aria-disabled` build cards; use `{ force: true }` when testing locked
  cards. Match cards by `.build-card__name`, because the text "Needs Sawmill" also contains
  "Sawmill".
- `docs/ASSET_SPEC.md` tables are test-enforced. After manifest changes, regenerate them with
  `npm run art:table` and replace the block between the `asset-tables` markers.
- Shell `pkill -f` can match your own shell; kill the preview server by its port's PID instead.
