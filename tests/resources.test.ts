import { describe, expect, it } from 'vitest';
import { BUILDINGS, STARTING_RESOURCES } from '../src/core/buildings';
import { createInitialState, placeBuilding, productionRate, tick } from '../src/core/game';
import { canAfford, shortfall } from '../src/core/resources';

describe('starting resources and costs', () => {
  it('starts every realm with 200 wood, 150 stone and 50 magic', () => {
    expect(STARTING_RESOURCES).toEqual({ wood: 200, stone: 150, magic: 50 });
    expect(createInitialState(0).resources).toEqual(STARTING_RESOURCES);
  });

  it('defines the expected cost for each building', () => {
    expect(BUILDINGS.cottage.cost).toEqual({ wood: 20, stone: 10, magic: 0 });
    expect(BUILDINGS.farm.cost).toEqual({ wood: 30, stone: 0, magic: 0 });
    expect(BUILDINGS.sawmill.cost).toEqual({ wood: 40, stone: 20, magic: 0 });
    expect(BUILDINGS.mageTower.cost).toEqual({ wood: 50, stone: 80, magic: 30 });
  });

  it('every building is affordable from a fresh start', () => {
    for (const def of Object.values(BUILDINGS)) expect(canAfford(STARTING_RESOURCES, def.cost)).toBe(true);
  });

  it('deducts the exact cost when building', () => {
    const s = placeBuilding(createInitialState(0), 'mageTower', { x: 0, y: 0 }, 0).state;
    expect(s.resources).toEqual({ wood: 150, stone: 70, magic: 20 });
  });

  it('refuses to build without enough resources and leaves state unchanged', () => {
    let s = createInitialState(0);
    s = placeBuilding(s, 'mageTower', { x: 0, y: 0 }, 0).state; // magic 50 -> 20
    const res = placeBuilding(s, 'mageTower', { x: 5, y: 5 }, 0);
    expect(res).toMatchObject({ ok: false, reason: 'insufficient-resources' });
    expect(res.state).toBe(s);
    expect(shortfall(s.resources, BUILDINGS.mageTower.cost)).toEqual({ stone: 10, magic: 10 });
  });

  it('can build exactly until wood runs out', () => {
    let s = createInitialState(0);
    let built = 0;
    for (let i = 0; i < 20; i++) {
      const res = placeBuilding(s, 'farm', { x: (i % 10) * 2, y: Math.floor(i / 10) * 3 }, 0);
      if (!res.ok) break;
      s = res.state;
      built++;
    }
    expect(built).toBe(6); // 200 wood / 30 per farm
    expect(s.resources.wood).toBe(20);
  });
});

describe('production', () => {
  it('sawmills produce wood and mage towers produce magic over time', () => {
    let s = createInitialState(0);
    s = placeBuilding(s, 'sawmill', { x: 0, y: 0 }, 0).state;
    s = placeBuilding(s, 'mageTower', { x: 4, y: 4 }, 0).state;
    expect(productionRate(s)).toEqual({ wood: 6, stone: 0, magic: 3 });
    const before = s.resources;
    s = tick(s, 60_000);
    expect(s.resources).toEqual({ wood: before.wood + 6, stone: before.stone, magic: before.magic + 3 });
  });

  it('accumulates fractional production across many small ticks', () => {
    let s = placeBuilding(createInitialState(0), 'sawmill', { x: 0, y: 0 }, 0).state;
    const start = s.resources.wood;
    for (let i = 0; i < 600; i++) s = tick(s, 100); // 60s in 100ms steps
    expect(s.resources.wood).toBe(start + 6);
  });

  it('does nothing without producers', () => {
    const s = createInitialState(0);
    expect(tick(s, 60_000)).toBe(s);
  });
});
