/**
 * Local persistence. Storage is injected so tests (and future cloud sync) can swap
 * the backend; the browser default is window.localStorage.
 */
import { BUILDINGS, MAP_SIZE } from './buildings';
import { checkPlacement } from './grid';
import { createInitialState, STATE_VERSION } from './game';
import { emptyResources, RESOURCE_TYPES } from './resources';
import type { Building, GameState, Resources, Rotation } from './types';

/** The player's village. Developer Test Mode never reads or writes this key (see testMode.ts). */
export const SAVE_KEY = 'levelup-rpg:save';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface SaveEnvelope {
  savedAt: number;
  state: GameState;
}

export function defaultStorage(): KeyValueStorage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined; // storage can be blocked (private mode, sandboxed iframes)
  }
}

export function saveGame(state: GameState, storage = defaultStorage(), now = Date.now(), key = SAVE_KEY): boolean {
  if (!storage) return false;
  try {
    const envelope: SaveEnvelope = { savedAt: now, state };
    storage.setItem(key, JSON.stringify(envelope));
    return true;
  } catch {
    return false; // quota exceeded or storage unavailable
  }
}

export function hasSave(storage = defaultStorage(), key = SAVE_KEY): boolean {
  try {
    return !!storage?.getItem(key);
  } catch {
    return false;
  }
}

export function clearSave(storage = defaultStorage(), key = SAVE_KEY): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Loads and validates a save. Returns null when absent or unreadable. */
export function loadGame(storage = defaultStorage(), key = SAVE_KEY): GameState | null {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SaveEnvelope>;
    return sanitizeState(parsed.state);
  } catch {
    return null;
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function sanitizeResources(r: unknown): Resources | null {
  if (!r || typeof r !== 'object') return null;
  const out = emptyResources();
  for (const k of RESOURCE_TYPES) {
    const v = (r as Record<string, unknown>)[k];
    if (!isNum(v) || v < 0) return null;
    out[k] = v;
  }
  return out;
}

/**
 * Rebuilds a trusted GameState from untrusted JSON: unknown building types,
 * malformed entries and overlapping/out-of-bounds buildings are dropped.
 */
export function sanitizeState(input: unknown): GameState | null {
  if (!input || typeof input !== 'object') return null;
  const s = input as Partial<GameState>;
  if (!isNum(s.version) || s.version > STATE_VERSION) return null;
  const resources = sanitizeResources(s.resources);
  if (!resources) return null;

  const base = createInitialState(isNum(s.createdAt) ? s.createdAt : Date.now());
  const mapSize = MAP_SIZE;
  const buildings: Building[] = [];
  let maxId = 0;
  for (const b of Array.isArray(s.buildings) ? s.buildings : []) {
    if (!b || typeof b !== 'object' || typeof b.type !== 'string' || !Object.hasOwn(BUILDINGS, b.type)) continue;
    if (!Number.isInteger(b.x) || !Number.isInteger(b.y) || ![0, 1, 2, 3].includes(b.rotation)) continue;
    if (typeof b.id !== 'string' || buildings.some((o) => o.id === b.id)) continue;
    if (!checkPlacement(b.type, b, b.rotation as Rotation, buildings, mapSize).valid) continue;
    buildings.push({
      id: b.id,
      type: b.type,
      x: b.x,
      y: b.y,
      rotation: b.rotation as Rotation,
      builtAt: isNum(b.builtAt) ? b.builtAt : base.createdAt,
    });
    const n = Number(b.id.replace(/^b/, ''));
    if (Number.isInteger(n)) maxId = Math.max(maxId, n);
  }

  return {
    ...base,
    mapSize,
    resources,
    buildings,
    productionCarry: sanitizeResources(s.productionCarry) ?? emptyResources(),
    nextId: Math.max(isNum(s.nextId) ? s.nextId : 1, maxId + 1),
    updatedAt: isNum(s.updatedAt) ? s.updatedAt : base.updatedAt,
  };
}
