/**
 * GameStore is the single source of truth shared by the Phaser scene and the React UI.
 * It wraps the pure functions in game.ts with interaction state (placing, moving,
 * selection), autosave and events. React reads it via useSyncExternalStore.
 */
import { availability, BUILDINGS, type RuleOptions } from './buildings';
import { EventBus } from './events';
import { checkPlacement, buildingAt, findNearestFree, clampToMap, nextRotation } from './grid';
import { createInitialState, demolishBuilding, placeBuilding, relocateBuilding, tick } from './game';
import { add, canAfford } from './resources';
import { loadGame, saveGame, SAVE_KEY, type KeyValueStorage, defaultStorage } from './save';
import type { BuildingType, FailureReason, GameState, GridPos, Resources, Rotation } from './types';

export type Mode =
  | { kind: 'idle' }
  | { kind: 'selected'; id: string }
  | { kind: 'placing'; type: BuildingType; pos: GridPos; rotation: Rotation }
  | { kind: 'moving'; id: string; type: BuildingType; pos: GridPos; rotation: Rotation };

export interface Snapshot {
  state: GameState;
  mode: Mode;
  /** Whether the current ghost (placing/moving) can be committed where it is. */
  ghostValid: boolean;
  /** Why the ghost can't be committed (null when valid or not placing/moving). UI only; never saved. */
  ghostIssue: Exclude<FailureReason, 'not-found'> | null;
  toast: { id: number; text: string; tone: 'info' | 'error' } | null;
}

const FAILURE_TEXT: Record<FailureReason, string> = {
  'out-of-bounds': 'That spot lies beyond the realm.',
  collision: 'Something already stands there.',
  'insufficient-resources': 'Not enough resources.',
  locked: 'Not unlocked yet.',
  'limit-reached': 'Your realm already has one.',
  'not-found': 'That building has vanished.',
};

export interface StoreOptions {
  storage?: KeyValueStorage;
  autosaveMs?: number;
  now?: () => number;
  /** Storage key for this realm (default: the player's village, SAVE_KEY). */
  saveKey?: string;
  /**
   * Developer Test Mode store: may grant resources and bypass prerequisites. Must be paired with
   * a saveKey other than SAVE_KEY, so a test store can never touch the player's village.
   */
  testMode?: boolean;
}

export class GameStore {
  readonly events = new EventBus();
  /** Grid position under the camera centre, kept up to date by the scene. */
  viewCenter: GridPos = { x: 10, y: 10 };

  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private toastSeq = 0;
  private readonly storage?: KeyValueStorage;
  private readonly autosaveMs: number;
  private readonly now: () => number;
  readonly saveKey: string;
  readonly testMode: boolean;
  private rules: RuleOptions = {};

  constructor(initial?: GameState, opts: StoreOptions = {}) {
    this.saveKey = opts.saveKey ?? SAVE_KEY;
    this.testMode = opts.testMode ?? false;
    if (this.testMode && this.saveKey === SAVE_KEY) throw new Error('A test-mode store must not use the village save key');
    this.storage = opts.storage ?? defaultStorage();
    this.autosaveMs = opts.autosaveMs ?? 600;
    this.now = opts.now ?? Date.now;
    const state = initial ?? createInitialState(this.now());
    this.viewCenter = { x: state.mapSize / 2, y: state.mapSize / 2 };
    this.snapshot = { state, mode: { kind: 'idle' }, ghostValid: false, ghostIssue: null, toast: null };
  }

  /** Restores the last autosave, or starts a fresh realm. */
  static restore(opts: StoreOptions = {}): GameStore {
    const storage = opts.storage ?? defaultStorage();
    const loaded = loadGame(storage, opts.saveKey ?? SAVE_KEY);
    const store = new GameStore(loaded ?? undefined, { ...opts, storage });
    if (loaded) store.events.emit('game:loaded', { state: loaded });
    return store;
  }

  // --- external store protocol ---------------------------------------------------------
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): Snapshot => this.snapshot;
  get state(): GameState {
    return this.snapshot.state;
  }
  get mode(): Mode {
    return this.snapshot.mode;
  }
  /** Rule overrides in force (always empty outside Developer Test Mode). */
  get ruleOptions(): RuleOptions {
    return this.rules;
  }

  // --- developer test mode (test stores only) ----------------------------------------------
  /** Test mode only: bypass prerequisites or not. Ignored (returns false) on a normal store. */
  setRules(rules: RuleOptions): boolean {
    if (!this.testMode) return false;
    this.rules = { ...rules };
    this.set({});
    return true;
  }

  /** Test mode only: adds resources to the test island. Refused (returns false) on a normal store. */
  grantResources(amount: Resources): boolean {
    if (!this.testMode) return false;
    this.set({ state: { ...this.state, resources: add(this.state.resources, amount), updatedAt: this.now() } }, true);
    return true;
  }

  private set(patch: Partial<Snapshot>, persist = false) {
    const next = { ...this.snapshot, ...patch };
    next.ghostIssue = this.computeGhostIssue(next);
    next.ghostValid = (next.mode.kind === 'placing' || next.mode.kind === 'moving') && next.ghostIssue === null;
    this.snapshot = next;
    if (patch.state) this.events.emit('state:changed', { state: next.state });
    if (persist) this.scheduleSave();
    this.listeners.forEach((l) => l());
  }

  private computeGhostIssue({ mode, state }: Snapshot): Snapshot['ghostIssue'] {
    if (mode.kind !== 'placing' && mode.kind !== 'moving') return null;
    const ignore = mode.kind === 'moving' ? mode.id : undefined;
    const check = checkPlacement(mode.type, mode.pos, mode.rotation, state.buildings, state.mapSize, ignore);
    if (!check.valid) return check.reason;
    if (mode.kind === 'placing' && !canAfford(state.resources, BUILDINGS[mode.type].cost)) return 'insufficient-resources';
    return null;
  }

  toast(text: string, tone: 'info' | 'error' = 'info') {
    this.set({ toast: { id: ++this.toastSeq, text, tone } });
  }

  private failed(reason: FailureReason) {
    this.events.emit('action:failed', { reason });
    this.toast(FAILURE_TEXT[reason], 'error');
  }

  // --- interactions ----------------------------------------------------------------------
  startPlacing(type: BuildingType) {
    const { state } = this;
    const avail = availability(type, state.buildings, this.rules);
    if (!avail.ok) {
      const text =
        avail.reason === 'locked'
          ? `Build ${avail.missing.map((t) => BUILDINGS[t].name).join(' and ')} first.`
          : FAILURE_TEXT['limit-reached'];
      this.events.emit('action:failed', { reason: avail.reason });
      return this.toast(text, 'error');
    }
    if (!canAfford(state.resources, BUILDINGS[type].cost)) return this.failed('insufficient-resources');
    const rotation: Rotation = 0;
    const pos =
      findNearestFree(type, rotation, this.viewCenter, state.buildings, state.mapSize) ??
      clampToMap(type, this.viewCenter, rotation, state.mapSize);
    this.set({ mode: { kind: 'placing', type, pos, rotation } });
  }

  /** Tap on a tile: moves the ghost while placing/moving, otherwise selects a building. */
  tapTile(pos: GridPos) {
    const { mode, state } = this.snapshot;
    if (mode.kind === 'placing' || mode.kind === 'moving') {
      this.set({ mode: { ...mode, pos: clampToMap(mode.type, pos, mode.rotation, state.mapSize) } });
      return;
    }
    const hit = buildingAt(pos, state.buildings);
    this.set({ mode: hit ? { kind: 'selected', id: hit.id } : { kind: 'idle' } });
  }

  /**
   * Tap that the renderer resolved to a specific building (e.g. by hitting its artwork, which
   * may extend beyond its tiles). While placing/moving it still just moves the ghost to `pos`.
   */
  tapBuilding(id: string | null, pos: GridPos) {
    const { mode, state } = this.snapshot;
    if (mode.kind === 'placing' || mode.kind === 'moving' || !id || !state.buildings.some((b) => b.id === id)) {
      this.tapTile(pos);
      return;
    }
    this.set({ mode: { kind: 'selected', id } });
  }

  /** Drag the ghost; same as tapping but without selection side-effects. */
  moveGhost(pos: GridPos) {
    const { mode, state } = this.snapshot;
    if (mode.kind !== 'placing' && mode.kind !== 'moving') return;
    const next = clampToMap(mode.type, pos, mode.rotation, state.mapSize);
    if (next.x === mode.pos.x && next.y === mode.pos.y) return;
    this.set({ mode: { ...mode, pos: next } });
  }

  rotate() {
    const { mode, state } = this.snapshot;
    if (mode.kind === 'placing' || mode.kind === 'moving') {
      const rotation = nextRotation(mode.rotation);
      const ignore = mode.kind === 'moving' ? mode.id : undefined;
      // Nudge the ghost to a nearby free spot if the turned footprint would collide.
      const pos =
        findNearestFree(mode.type, rotation, mode.pos, state.buildings, state.mapSize, ignore, 2) ??
        clampToMap(mode.type, mode.pos, rotation, state.mapSize);
      this.set({ mode: { ...mode, rotation, pos } });
    } else if (mode.kind === 'selected') {
      const b = state.buildings.find((x) => x.id === mode.id);
      if (!b) return;
      const res = relocateBuilding(state, b.id, b, nextRotation(b.rotation), this.now());
      if (!res.ok) return this.failed(res.reason);
      this.set({ state: res.state }, true);
      this.events.emit('building:moved', { building: res.state.buildings.find((x) => x.id === b.id)! });
    }
  }

  startMove() {
    const { mode, state } = this.snapshot;
    if (mode.kind !== 'selected') return;
    const b = state.buildings.find((x) => x.id === mode.id);
    if (!b) return;
    this.set({ mode: { kind: 'moving', id: b.id, type: b.type, pos: { x: b.x, y: b.y }, rotation: b.rotation } });
  }

  confirm() {
    const { mode, state } = this.snapshot;
    if (mode.kind === 'placing') {
      const res = placeBuilding(state, mode.type, mode.pos, mode.rotation, this.now(), this.rules);
      if (!res.ok) return this.failed(res.reason);
      const building = res.state.buildings[res.state.buildings.length - 1];
      // Stay in placing mode for quick repeated building when still affordable.
      const affordable = canAfford(res.state.resources, BUILDINGS[mode.type].cost);
      const again = affordable
        ? findNearestFree(mode.type, mode.rotation, mode.pos, res.state.buildings, res.state.mapSize)
        : null;
      this.set(
        { state: res.state, mode: again ? { ...mode, pos: again } : { kind: 'selected', id: building.id } },
        true,
      );
      this.toast(`${BUILDINGS[mode.type].name} built!`);
      this.events.emit('building:placed', { building });
    } else if (mode.kind === 'moving') {
      const res = relocateBuilding(state, mode.id, mode.pos, mode.rotation, this.now());
      if (!res.ok) return this.failed(res.reason);
      this.set({ state: res.state, mode: { kind: 'selected', id: mode.id } }, true);
      this.events.emit('building:moved', { building: res.state.buildings.find((b) => b.id === mode.id)! });
    }
  }

  demolishSelected() {
    const { mode, state } = this.snapshot;
    if (mode.kind !== 'selected') return;
    const b = state.buildings.find((x) => x.id === mode.id);
    const res = demolishBuilding(state, mode.id, this.now());
    if (!res.ok || !b) return this.failed(res.ok ? 'not-found' : res.reason);
    this.set({ state: res.state, mode: { kind: 'idle' } }, true);
    this.events.emit('building:demolished', { building: b });
    this.toast(`${BUILDINGS[b.type].name} dismantled. Half the cost refunded.`);
  }

  cancel() {
    const { mode } = this.snapshot;
    this.set({ mode: mode.kind === 'moving' ? { kind: 'selected', id: mode.id } : { kind: 'idle' } });
  }

  advance(elapsedMs: number) {
    const next = tick(this.state, elapsedMs, this.now());
    if (next.resources !== this.state.resources || next.productionCarry !== this.state.productionCarry) {
      // Carry-only changes are persisted lazily; don't wake React for them.
      if (next.updatedAt !== this.state.updatedAt) this.set({ state: next }, true);
      else this.snapshot = { ...this.snapshot, state: next };
    }
  }

  /** Starts a brand new realm (keeps the store instance so subscribers stay attached). */
  reset() {
    this.set({ state: createInitialState(this.now()), mode: { kind: 'idle' }, toast: null }, true);
  }

  // --- persistence ---------------------------------------------------------------------
  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), this.autosaveMs);
  }

  saveNow(): boolean {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const at = this.now();
    const ok = saveGame(this.state, this.storage, at, this.saveKey);
    if (ok) this.events.emit('game:saved', { at });
    return ok;
  }
}
