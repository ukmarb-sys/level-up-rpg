/**
 * The expanded building catalog: art-gated offering, unlock requirements, limits, production
 * bonuses, save compatibility, and that the whole progression is reachable from a new realm.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { availability, buildCatalog, BUILDING_ORDER, BUILDINGS, STARTER_BUILDINGS } from '../src/core/buildings';
import { createInitialState, placeBuilding, productionRate, tick } from '../src/core/game';
import { checkPlacement } from '../src/core/grid';
import { canAfford } from '../src/core/resources';
import { sanitizeState } from '../src/core/save';
import type { BuildingType, GameState } from '../src/core/types';
import { manifestByKey, buildingKey } from '../src/assets/manifest';

const NEW: BuildingType[] = ['blacksmith', 'tavern', 'marketplace', 'alchemist', 'temple', 'castle'];

/** Places `type` at the first free spot (scanning the grid), ignoring resources if `free`. */
function build(state: GameState, type: BuildingType, free = false): GameState {
  const s = free ? { ...state, resources: { wood: 1e6, stone: 1e6, magic: 1e6 } } : state;
  for (let y = 0; y < s.mapSize; y++) {
    for (let x = 0; x < s.mapSize; x++) {
      if (!checkPlacement(type, { x, y }, 0, s.buildings, s.mapSize).valid) continue;
      const res = placeBuilding(s, type, { x, y }, 0, 0);
      if (!res.ok) throw new Error(`${type}: ${res.reason}`);
      return free ? { ...res.state, resources: state.resources } : res.state;
    }
  }
  throw new Error(`no room for ${type}`);
}

describe('building catalog', () => {
  it('keeps the four original buildings exactly as they were', () => {
    expect(STARTER_BUILDINGS).toEqual(['cottage', 'farm', 'sawmill', 'mageTower']);
    for (const t of STARTER_BUILDINGS) {
      expect(BUILDINGS[t].tier).toBe(1);
      expect(BUILDINGS[t].requires).toBeUndefined();
      expect(BUILDINGS[t].limit).toBeUndefined();
      expect(BUILDINGS[t].boosts).toBeUndefined();
    }
  });

  it('adds six painted-only buildings, each with a purpose, a cost and a place in the progression', () => {
    for (const t of NEW) {
      const d = BUILDINGS[t];
      expect(d.needsArt, t).toBe(true);
      expect(d.tier, t).toBeGreaterThan(1);
      expect(d.requires?.length, t).toBeGreaterThan(0);
      expect(Object.keys(d.produces).length + Object.keys(d.boosts ?? {}).length, `${t} has a purpose`).toBeGreaterThan(0);
      expect(d.cost.wood + d.cost.stone + d.cost.magic, t).toBeGreaterThan(0);
      // requirements always come earlier in the progression
      for (const r of d.requires!) expect(BUILDINGS[r].tier, `${t} needs ${r}`).toBeLessThan(d.tier);
    }
    expect(BUILDING_ORDER).toEqual([...STARTER_BUILDINGS, ...NEW]);
  });

  it('offers painted-only buildings only once their artwork exists (no placeholders)', () => {
    expect(buildCatalog([], () => false).map((e) => e.type)).toEqual(STARTER_BUILDINGS);
    const withTavernArt = buildCatalog([], (t) => t === 'tavern').map((e) => e.type);
    expect(withTavernArt).toEqual([...STARTER_BUILDINGS, 'tavern']);
    const all = buildCatalog([], () => true);
    expect(all).toHaveLength(10);
    expect(all.find((e) => e.type === 'blacksmith')!.availability).toEqual({ ok: false, reason: 'locked', missing: ['sawmill'] });
    expect(all.find((e) => e.type === 'tavern')!.availability).toEqual({ ok: false, reason: 'locked', missing: ['cottage', 'farm'] });
  });

  it('declares painted-only buildings in the asset manifest as optional, with spec canvases', () => {
    for (const t of NEW) {
      const e = manifestByKey.get(buildingKey(t, 0))!;
      expect(e, t).toBeDefined();
      expect(e.required).toBe(false);
      const { w, d } = { w: BUILDINGS[t].width, d: BUILDINGS[t].depth };
      expect(e.geometry.canvas.width).toBe((w + d) * 128 + 64);
      expect(e.geometry.canvas.height % 32).toBe(0);
      expect(e.top!.y).toBeGreaterThan(0);
    }
  });
});

describe('unlocks, limits and production bonuses', () => {
  it('rejects a locked building and enforces one-per-realm limits', () => {
    let s = createInitialState(0);
    expect(placeBuilding({ ...s, resources: { wood: 999, stone: 999, magic: 999 } }, 'blacksmith', { x: 0, y: 0 }, 0).ok).toBe(false);
    expect(placeBuilding({ ...s, resources: { wood: 999, stone: 999, magic: 999 } }, 'blacksmith', { x: 0, y: 0 }, 0)).toMatchObject({ reason: 'locked' });
    s = build(build(s, 'cottage', true), 'farm', true);
    expect(availability('tavern', s.buildings)).toEqual({ ok: true });
    s = build(s, 'tavern', true);
    expect(availability('tavern', s.buildings)).toEqual({ ok: false, reason: 'limit-reached', limit: 1 });
    const again = placeBuilding({ ...s, resources: { wood: 999, stone: 999, magic: 999 } }, 'tavern', { x: 15, y: 15 }, 0);
    expect(again).toMatchObject({ ok: false, reason: 'limit-reached' });
  });

  it('applies bonuses on top of base production, adding up', () => {
    let s = build(createInitialState(0), 'sawmill', true);
    expect(productionRate(s).wood).toBe(6);
    s = build(build(build(s, 'cottage', true), 'farm', true), 'tavern', true);
    expect(productionRate(s).wood).toBeCloseTo(6.6);
    s = build(build(s, 'mageTower', true), 'alchemist', true);
    expect(productionRate(s).magic).toBeCloseTo((3 + 4) * 1.1);
    s = build(s, 'temple', true);
    expect(productionRate(s).magic).toBeCloseTo(7 * 1.35);
    s = build(build(build(s, 'blacksmith', true), 'marketplace', true), 'castle', true);
    const r = productionRate(s);
    expect(r.wood).toBeCloseTo((6 + 2) * 1.25);
    expect(r.stone).toBeCloseTo((3 + 2) * 1.25);
    expect(r.magic).toBeCloseTo(7 * 1.5);
  });

  it('fractional bonus production is paid out exactly over time', () => {
    let s = build(build(build(build(createInitialState(0), 'sawmill', true), 'cottage', true), 'farm', true), 'tavern', true);
    const before = s.resources.wood;
    for (let i = 0; i < 600; i++) s = tick(s, 1000, i * 1000); // 10 minutes in 1 s ticks
    expect(s.resources.wood - before).toBe(66);
  });

  it('can reach every building from a fresh start by playing normally', () => {
    let s = createInitialState(0);
    const order: BuildingType[] = ['sawmill', 'cottage', 'farm', 'mageTower', 'blacksmith', 'tavern', 'alchemist', 'marketplace', 'temple', 'castle'];
    let minutes = 0;
    for (const t of order) {
      while (!canAfford(s.resources, BUILDINGS[t].cost)) {
        s = tick(s, 60_000, minutes * 60_000);
        minutes++;
        expect(minutes, `waiting for ${t}`).toBeLessThan(600);
      }
      s = build(s, t);
    }
    expect(s.buildings.map((b) => b.type)).toEqual(order);
    // a long-term goal, not a quick one: the keep takes a real session of play
    expect(minutes).toBeGreaterThan(30);
  });
});

describe('saved games', () => {
  it('loads existing v1 saves unchanged', () => {
    const raw = JSON.parse(readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8'));
    const s = sanitizeState(raw.state ?? raw)!;
    expect(s).not.toBeNull();
    expect(s.version).toBe(1);
  });

  it('round-trips the new building types and drops types it does not know', () => {
    let s = build(build(build(createInitialState(0), 'cottage', true), 'farm', true), 'tavern', true);
    const json = JSON.parse(JSON.stringify(s));
    expect(sanitizeState(json)!.buildings.map((b) => b.type)).toEqual(['cottage', 'farm', 'tavern']);
    json.buildings.push({ id: 'b99', type: 'dragonLair', x: 18, y: 18, rotation: 0, builtAt: 0 });
    expect(sanitizeState(json)!.buildings.map((b) => b.type)).toEqual(['cottage', 'farm', 'tavern']);
    s = sanitizeState(json)!;
    expect(s.version).toBe(1);
  });
});
