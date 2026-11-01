/**
 * Building catalog: all ten definitions are always listed, with a clear status, prerequisites
 * and an exact explanation for anything that can't be placed. Rules and economy are unchanged.
 */
import { describe, expect, it } from 'vitest';
import { availability, BUILDING_ORDER, BUILDINGS, catalogCard, catalogCards, STARTING_RESOURCES } from '../src/core/buildings';
import { createInitialState, placeBuilding } from '../src/core/game';
import type { BuildingType, Resources } from '../src/core/types';

const rich: Resources = { wood: 1e6, stone: 1e6, magic: 1e6 };
const allArt = () => true;
const standing = (...types: BuildingType[]) => types.map((type) => ({ type }));

describe('building catalog', () => {
  it('always lists all ten buildings in progression order, whatever the state', () => {
    for (const state of [
      { buildings: [], resources: { wood: 0, stone: 0, magic: 0 } },
      { buildings: standing(...BUILDING_ORDER), resources: rich },
    ]) {
      const cards = catalogCards(state, () => false);
      expect(cards.map((c) => c.type)).toEqual(BUILDING_ORDER);
      expect(cards).toHaveLength(10);
    }
  });

  it('gives every building a status on a fresh realm', () => {
    const cards = catalogCards({ buildings: [], resources: { ...STARTING_RESOURCES } }, allArt);
    const status = Object.fromEntries(cards.map((c) => [c.type, c.status]));
    expect(status).toEqual({
      cottage: 'available',
      farm: 'available',
      sawmill: 'available',
      mageTower: 'available',
      blacksmith: 'locked',
      tavern: 'locked',
      marketplace: 'locked',
      alchemist: 'locked',
      temple: 'locked',
      castle: 'locked',
    });
    expect(cards.filter((c) => c.placeable).map((c) => c.type)).toEqual(['cottage', 'farm', 'sawmill', 'mageTower']);
  });

  it('shows insufficient resources with the exact shortfall', () => {
    const c = catalogCard('mageTower', { buildings: [], resources: { wood: 50, stone: 70, magic: 10 } }, allArt);
    expect(c.status).toBe('insufficient');
    expect(c.label).toBe('Insufficient resources');
    expect(c.placeable).toBe(false);
    expect(c.shortfall).toEqual({ stone: 10, magic: 20 });
    expect(c.detail).toBe('You need 10 more stone, 20 more magic.');
  });

  it('explains exactly which prerequisites are missing and which already stand', () => {
    const castle = catalogCard('castle', { buildings: standing('temple'), resources: rich }, allArt);
    expect(castle.status).toBe('locked');
    expect(castle.missing).toEqual(['marketplace', 'blacksmith']);
    expect(castle.requires).toEqual([
      { type: 'marketplace', met: false },
      { type: 'temple', met: true },
      { type: 'blacksmith', met: false },
    ]);
    expect(castle.detail).toBe('Build Marketplace and Blacksmith first. (Ancient Temple already stands.)');
    const tavern = catalogCard('tavern', { buildings: [], resources: rich }, allArt);
    expect(tavern.detail).toBe('Build Cottage and Farm first.');
  });

  it('marks one-per-realm buildings as Built, and other limits as Maximum reached', () => {
    const t = catalogCard('tavern', { buildings: standing('cottage', 'farm', 'tavern'), resources: rich }, allArt);
    expect([t.status, t.label, t.placeable]).toEqual(['built', 'Built', false]);
    expect(t.detail).toMatch(/already has its Tavern/);
    // no current building has a limit above 1; a hypothetical limit of 2 shows "Maximum reached"
    const orig = BUILDINGS.cottage.limit;
    try {
      BUILDINGS.cottage.limit = 2;
      const c = catalogCard('cottage', { buildings: standing('cottage', 'cottage'), resources: rich }, allArt);
      expect([c.status, c.label]).toEqual(['max', 'Maximum reached']);
    } finally {
      BUILDINGS.cottage.limit = orig;
    }
  });

  it('lists painted-only buildings without artwork as "Artwork coming soon", never placeable', () => {
    const noCastleArt = (t: BuildingType) => t !== 'castle';
    const c = catalogCard('castle', { buildings: standing(...BUILDING_ORDER.filter((t) => t !== 'castle')), resources: rich }, noCastleArt);
    expect([c.status, c.placeable]).toEqual(['awaiting-art', false]);
    // even with prerequisites bypassed (test mode)
    expect(catalogCard('castle', { buildings: [], resources: rich }, noCastleArt, { ignoreRequirements: true }).status).toBe('awaiting-art');
  });

  it('only marks a card Available when the game itself would accept the building', () => {
    const state = { ...createInitialState(0), resources: rich };
    for (const card of catalogCards(state, allArt)) {
      const res = placeBuilding(state, card.type, { x: 2, y: 2 }, 0, 0);
      expect(res.ok, card.type).toBe(card.placeable);
    }
  });

  it('keeps every cost, production rate and prerequisite exactly as on main', () => {
    expect(BUILDING_ORDER.map((t) => [t, BUILDINGS[t].cost, BUILDINGS[t].produces, BUILDINGS[t].requires ?? [], BUILDINGS[t].limit ?? null])).toEqual([
      ['cottage', { wood: 20, stone: 10, magic: 0 }, {}, [], null],
      ['farm', { wood: 30, stone: 0, magic: 0 }, {}, [], null],
      ['sawmill', { wood: 40, stone: 20, magic: 0 }, { wood: 6 }, [], null],
      ['mageTower', { wood: 50, stone: 80, magic: 30 }, { magic: 3 }, [], null],
      ['blacksmith', { wood: 60, stone: 20, magic: 0 }, { stone: 3 }, ['sawmill'], null],
      ['tavern', { wood: 80, stone: 30, magic: 0 }, {}, ['cottage', 'farm'], 1],
      ['marketplace', { wood: 120, stone: 60, magic: 0 }, { wood: 2, stone: 2 }, ['tavern'], null],
      ['alchemist', { wood: 60, stone: 50, magic: 40 }, { magic: 4 }, ['mageTower'], null],
      ['temple', { wood: 0, stone: 180, magic: 120 }, {}, ['alchemist'], 1],
      ['castle', { wood: 300, stone: 300, magic: 150 }, {}, ['marketplace', 'temple', 'blacksmith'], 1],
    ]);
  });

  it('bypasses prerequisites only when asked; limits still apply', () => {
    expect(availability('temple', [])).toMatchObject({ ok: false, reason: 'locked' });
    expect(availability('temple', [], { ignoreRequirements: true })).toEqual({ ok: true });
    expect(availability('temple', standing('temple'), { ignoreRequirements: true })).toMatchObject({ ok: false, reason: 'limit-reached' });
  });
});
