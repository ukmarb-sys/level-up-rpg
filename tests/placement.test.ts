import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/core/buildings';
import { createInitialState, demolishBuilding, placeBuilding, relocateBuilding } from '../src/core/game';
import { checkPlacement, clampToMap, findNearestFree, footprintSize, overlaps } from '../src/core/grid';
import type { GameState } from '../src/core/types';

const rich = (): GameState => ({ ...createInitialState(0), resources: { wood: 10_000, stone: 10_000, magic: 10_000 } });

describe('footprints and rotation', () => {
  it('swaps width and depth on odd rotations', () => {
    expect(footprintSize('farm', 0)).toEqual({ w: 2, d: 3 });
    expect(footprintSize('farm', 1)).toEqual({ w: 3, d: 2 });
    expect(footprintSize('farm', 2)).toEqual({ w: 2, d: 3 });
    expect(footprintSize('sawmill', 3)).toEqual({ w: 1, d: 2 });
    expect(footprintSize('cottage', 1)).toEqual({ w: 1, d: 1 });
  });

  it('detects rectangle overlap but not edge contact', () => {
    expect(overlaps({ x: 0, y: 0, w: 2, d: 2 }, { x: 1, y: 1, w: 2, d: 2 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 2, d: 2 }, { x: 2, y: 0, w: 1, d: 1 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, w: 2, d: 2 }, { x: 0, y: 2, w: 1, d: 1 })).toBe(false);
  });
});

describe('placing buildings', () => {
  it('places a building anywhere free on the 20x20 map', () => {
    const res = placeBuilding(rich(), 'cottage', { x: 19, y: 19 }, 0, 5);
    expect(res.ok).toBe(true);
    expect(res.state.buildings).toEqual([{ id: 'b1', type: 'cottage', x: 19, y: 19, rotation: 0, builtAt: 5 }]);
    expect(res.state.nextId).toBe(2);
  });

  it('rejects out-of-bounds placement, including after rotation', () => {
    const s = rich();
    expect(placeBuilding(s, 'cottage', { x: 20, y: 0 }, 0)).toMatchObject({ ok: false, reason: 'out-of-bounds' });
    expect(placeBuilding(s, 'cottage', { x: -1, y: 3 }, 0)).toMatchObject({ ok: false, reason: 'out-of-bounds' });
    // farm is 2x3: fits at y=17 unrotated, but rotated (3x2) it does not fit at x=18
    expect(placeBuilding(s, 'farm', { x: 18, y: 17 }, 0).ok).toBe(true);
    expect(placeBuilding(s, 'farm', { x: 18, y: 17 }, 1)).toMatchObject({ ok: false, reason: 'out-of-bounds' });
  });

  it('rejects overlapping buildings and allows adjacent ones', () => {
    let s = placeBuilding(rich(), 'mageTower', { x: 5, y: 5 }, 0).state; // covers 5..6 x 5..6
    expect(placeBuilding(s, 'cottage', { x: 6, y: 6 }, 0)).toMatchObject({ ok: false, reason: 'collision' });
    expect(placeBuilding(s, 'sawmill', { x: 4, y: 5 }, 0)).toMatchObject({ ok: false, reason: 'collision' });
    const adj = placeBuilding(s, 'sawmill', { x: 3, y: 5 }, 0);
    expect(adj.ok).toBe(true);
    s = adj.state;
    expect(s.buildings).toHaveLength(2);
  });

  it('does not mutate the input state', () => {
    const s = rich();
    const snapshot = JSON.stringify(s);
    placeBuilding(s, 'farm', { x: 0, y: 0 }, 0);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('clamps ghost positions onto the map and finds the nearest free tile', () => {
    expect(clampToMap('mageTower', { x: 25, y: -3 }, 0, 20)).toEqual({ x: 18, y: 0 });
    const s = placeBuilding(rich(), 'cottage', { x: 10, y: 10 }, 0).state;
    const p = findNearestFree('cottage', 0, { x: 10, y: 10 }, s.buildings, 20)!;
    expect(checkPlacement('cottage', p, 0, s.buildings, 20).valid).toBe(true);
    expect(Math.max(Math.abs(p.x - 10), Math.abs(p.y - 10))).toBe(1);
  });
});

describe('relocation and rotation of placed buildings', () => {
  it('moves a building to a free spot without charging resources', () => {
    const placed = placeBuilding(rich(), 'farm', { x: 0, y: 0 }, 0).state;
    const res = relocateBuilding(placed, 'b1', { x: 10, y: 10 }, 1);
    expect(res.ok).toBe(true);
    expect(res.state.buildings[0]).toMatchObject({ x: 10, y: 10, rotation: 1 });
    expect(res.state.resources).toEqual(placed.resources);
  });

  it('ignores its own footprint when relocating so small nudges work', () => {
    const placed = placeBuilding(rich(), 'farm', { x: 4, y: 4 }, 0).state;
    expect(relocateBuilding(placed, 'b1', { x: 5, y: 4 }, 0).ok).toBe(true);
    expect(relocateBuilding(placed, 'b1', { x: 4, y: 4 }, 1).ok).toBe(true);
  });

  it('rejects moving onto another building or off the map', () => {
    let s = placeBuilding(rich(), 'cottage', { x: 0, y: 0 }, 0).state;
    s = placeBuilding(s, 'cottage', { x: 3, y: 3 }, 0).state;
    expect(relocateBuilding(s, 'b1', { x: 3, y: 3 }, 0)).toMatchObject({ ok: false, reason: 'collision' });
    expect(relocateBuilding(s, 'b1', { x: 19, y: 20 }, 0)).toMatchObject({ ok: false, reason: 'out-of-bounds' });
    expect(relocateBuilding(s, 'nope', { x: 5, y: 5 }, 0)).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('rejects a rotation that would collide', () => {
    let s = placeBuilding(rich(), 'sawmill', { x: 0, y: 0 }, 0).state; // 2x1 at (0,0)-(1,0)
    s = placeBuilding(s, 'cottage', { x: 0, y: 1 }, 0).state;
    expect(relocateBuilding(s, 'b1', { x: 0, y: 0 }, 1)).toMatchObject({ ok: false, reason: 'collision' });
  });

  it('demolishing frees the tiles and refunds half the cost', () => {
    const s0 = createInitialState(0);
    const placed = placeBuilding(s0, 'sawmill', { x: 2, y: 2 }, 0).state;
    const res = demolishBuilding(placed, 'b1');
    expect(res.ok).toBe(true);
    expect(res.state.buildings).toHaveLength(0);
    const c = BUILDINGS.sawmill.cost;
    expect(res.state.resources).toEqual({
      wood: s0.resources.wood - c.wood + c.wood / 2,
      stone: s0.resources.stone - c.stone + c.stone / 2,
      magic: s0.resources.magic,
    });
    expect(placeBuilding(res.state, 'cottage', { x: 2, y: 2 }, 0).ok).toBe(true);
  });
});

describe('store rotation nudging', async () => {
  const { GameStore } = await import('../src/core/store');
  const { MemoryStorage } = await import('./memoryStorage');
  it('nudges a rotated ghost to a nearby free spot instead of leaving it blocked', () => {
    const store = new GameStore(undefined, { storage: new MemoryStorage() });
    store.startPlacing('cottage');
    store.tapTile({ x: 5, y: 6 });
    store.confirm();
    store.cancel();
    store.startPlacing('sawmill'); // 2x1
    store.tapTile({ x: 5, y: 5 });
    expect(store.getSnapshot().ghostValid).toBe(true);
    store.rotate(); // 1x2 at (5,5) would overlap the cottage at (5,6)
    const m = store.mode;
    expect(m.kind === 'placing' && m.rotation).toBe(1);
    expect(store.getSnapshot().ghostValid).toBe(true);
  });
});
