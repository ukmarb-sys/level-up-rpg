/**
 * Pure state transitions for the city. Every action returns a new GameState and never
 * mutates its input, which keeps the logic easy to test, save and replay.
 */
import { availability, BUILDINGS, DEMOLISH_REFUND, MAP_SIZE, STARTING_RESOURCES, type RuleOptions } from './buildings';
import { checkPlacement } from './grid';
import { add, canAfford, emptyResources, RESOURCE_TYPES, scale, subtract } from './resources';
import type { ActionResult, BuildingType, GameState, GridPos, Resources, Rotation } from './types';

export const STATE_VERSION = 1;

export function createInitialState(now = Date.now()): GameState {
  return {
    version: STATE_VERSION,
    mapSize: MAP_SIZE,
    resources: { ...STARTING_RESOURCES },
    buildings: [],
    productionCarry: emptyResources(),
    nextId: 1,
    createdAt: now,
    updatedAt: now,
  };
}

const fail = (state: GameState, reason: Extract<ActionResult, { ok: false }>['reason']): ActionResult => ({
  ok: false,
  state,
  reason,
});

export function placeBuilding(
  state: GameState,
  type: BuildingType,
  pos: GridPos,
  rotation: Rotation,
  now = Date.now(),
  rules: RuleOptions = {},
): ActionResult {
  const cost = BUILDINGS[type].cost;
  const avail = availability(type, state.buildings, rules);
  if (!avail.ok) return fail(state, avail.reason);
  if (!canAfford(state.resources, cost)) return fail(state, 'insufficient-resources');
  const check = checkPlacement(type, pos, rotation, state.buildings, state.mapSize);
  if (!check.valid) return fail(state, check.reason);
  const building = { id: `b${state.nextId}`, type, x: pos.x, y: pos.y, rotation, builtAt: now };
  return {
    ok: true,
    state: {
      ...state,
      resources: subtract(state.resources, cost),
      buildings: [...state.buildings, building],
      nextId: state.nextId + 1,
      updatedAt: now,
    },
  };
}

/** Moves and/or rotates an existing building. Relocation is free. */
export function relocateBuilding(
  state: GameState,
  id: string,
  pos: GridPos,
  rotation: Rotation,
  now = Date.now(),
): ActionResult {
  const target = state.buildings.find((b) => b.id === id);
  if (!target) return fail(state, 'not-found');
  const check = checkPlacement(target.type, pos, rotation, state.buildings, state.mapSize, id);
  if (!check.valid) return fail(state, check.reason);
  return {
    ok: true,
    state: {
      ...state,
      buildings: state.buildings.map((b) => (b.id === id ? { ...b, x: pos.x, y: pos.y, rotation } : b)),
      updatedAt: now,
    },
  };
}

export function demolishBuilding(state: GameState, id: string, now = Date.now()): ActionResult {
  const target = state.buildings.find((b) => b.id === id);
  if (!target) return fail(state, 'not-found');
  return {
    ok: true,
    state: {
      ...state,
      resources: add(state.resources, scale(BUILDINGS[target.type].cost, DEMOLISH_REFUND)),
      buildings: state.buildings.filter((b) => b.id !== id),
      updatedAt: now,
    },
  };
}

/** Production bonus per resource from standing buildings (e.g. 0.1 = +10%). Bonuses add up. */
export function productionBoost(state: GameState): Resources {
  const out = emptyResources();
  for (const b of state.buildings) {
    const boosts = BUILDINGS[b.type].boosts;
    if (!boosts) continue;
    for (const r of RESOURCE_TYPES) out[r] += (boosts.all ?? 0) + (boosts[r] ?? 0);
  }
  return out;
}

/** Production per minute summed over all standing buildings, with bonuses applied. */
export function productionRate(state: GameState) {
  const base = state.buildings.reduce((acc, b) => add(acc, BUILDINGS[b.type].produces), emptyResources());
  const boost = productionBoost(state);
  const out = emptyResources();
  for (const r of RESOURCE_TYPES) out[r] = base[r] * (1 + boost[r]);
  return out;
}

/**
 * Advances production by `elapsedMs`. Whole units are added to resources and the
 * remainder is kept in `productionCarry` so nothing is lost between short ticks.
 */
export function tick(state: GameState, elapsedMs: number, now = Date.now()): GameState {
  if (elapsedMs <= 0 || state.buildings.length === 0) return state;
  const rate = productionRate(state);
  const minutes = elapsedMs / 60_000;
  const resources = { ...state.resources };
  const carry = { ...state.productionCarry };
  let changed = false;
  for (const r of RESOURCE_TYPES) {
    if (!rate[r]) continue;
    const total = carry[r] + rate[r] * minutes;
    const whole = Math.floor(total);
    carry[r] = total - whole;
    if (whole > 0) {
      resources[r] += whole;
      changed = true;
    }
  }
  return { ...state, resources, productionCarry: carry, updatedAt: changed ? now : state.updatedAt };
}
