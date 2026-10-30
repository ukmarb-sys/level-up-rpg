# Architecture

```
src/
  core/      Pure TypeScript game rules — no Phaser, no React. Unit-tested.
    types.ts       Domain types (GameState, Building, Resources, ...)
    buildings.ts   Building catalogue, starting resources, map size
    grid.ts        Footprints, rotation, bounds and collision checks
    resources.ts   Resource arithmetic
    game.ts        Immutable state transitions: place, relocate, demolish, tick
    save.ts        Versioned localStorage persistence + validation of untrusted saves
    events.ts      Typed event bus
    store.ts       GameStore: state + interaction mode + autosave + events
  assets/    Artwork contract — pure data shared by the game, validator and tests
    spec.ts        Projection scale, canvas/anchor formulas
    manifest.ts    Every sprite the renderer can use, with expected geometry
    resolve.ts     Sprite choice + fallbacks (exact rotation → opposite → mirrored)
    art/           Drop folder for PNG/WebP artwork (bundled only if present)
  game/      Phaser rendering and input (reads the store, calls its methods)
    iso.ts         Isometric projection math
    art.ts         Procedural fallback art (buildings, props, ground textures)
    assets.ts      Loads artwork via import.meta.glob, builds anchored sprites
    noise.ts       Deterministic value noise for terrain variation
    props.ts       Scenery layout on the ring outside the playable grid
    CityScene.ts   Map, buildings, ghost, grid overlay, animations, pan/pinch/wheel input
    createGame.ts  Boots Phaser at device pixel ratio inside a DOM node
  ui/        React HUD: start screen, resource bar, build menu, action bar, toasts
  modules/   Pluggable gameplay modules (see below)
scripts/     validate-assets.ts (+ lib/: PNG/WebP inspection and validation rules)
tests/       Vitest specs for core logic, assets, validation and save compatibility
```

See also [RENDERING.md](RENDERING.md) and [ASSET_SPEC.md](ASSET_SPEC.md).

## Data flow

1. React and Phaser both read from one `GameStore` (`useSyncExternalStore` in React,
   `store.subscribe` in the scene).
2. User intent (tap a tile, press **Rotate**) calls a store method.
3. The store runs a pure function from `core/game.ts`, publishes the new snapshot,
   emits events (`building:placed`, ...) and schedules an autosave.

Because rules live in `core/`, they can later run on a server or be reused by other
clients without Phaser.

## Adding a gameplay module

Future systems — real-life quests, AI coaching, character progression, weekly
rewards and ancient mysteries — are meant to be `GameModule`s:

```ts
export const weeklyRewards: GameModule = {
  id: 'weekly-rewards',
  install({ store }) {
    return store.events.on('building:placed', ({ building }) => {
      /* award progress, show a toast, ... */
    });
  },
};
```

Register it in `src/modules/index.ts`. `milestones.ts` is a working example.

Guidelines:

- Keep module state in its own versioned slice when persistence is needed; bump
  `STATE_VERSION` and extend `sanitizeState` with a migration.
- Any AI coaching or cloud feature must call a backend you control; never ship API
  keys in the client bundle.
