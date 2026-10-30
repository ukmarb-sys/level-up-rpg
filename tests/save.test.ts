import { describe, expect, it } from 'vitest';
import { createInitialState, placeBuilding } from '../src/core/game';
import { clearSave, hasSave, loadGame, SAVE_KEY, saveGame, sanitizeState } from '../src/core/save';
import { GameStore } from '../src/core/store';
import { MemoryStorage } from './memoryStorage';

const sample = () => {
  let s = createInitialState(1000);
  s = placeBuilding(s, 'farm', { x: 2, y: 2 }, 1, 2000).state;
  s = placeBuilding(s, 'cottage', { x: 10, y: 10 }, 0, 3000).state;
  return s;
};

describe('save / load', () => {
  it('round-trips a game state', () => {
    const storage = new MemoryStorage();
    const s = sample();
    expect(saveGame(s, storage)).toBe(true);
    expect(hasSave(storage)).toBe(true);
    expect(loadGame(storage)).toEqual(s);
  });

  it('returns null when there is no save or it is corrupted', () => {
    const storage = new MemoryStorage();
    expect(loadGame(storage)).toBeNull();
    storage.setItem(SAVE_KEY, '{not json');
    expect(loadGame(storage)).toBeNull();
    storage.setItem(SAVE_KEY, JSON.stringify({ state: { version: 1, resources: { wood: 'lots' } } }));
    expect(loadGame(storage)).toBeNull();
  });

  it('rejects saves from a newer, unknown version', () => {
    expect(sanitizeState({ ...sample(), version: 999 })).toBeNull();
  });

  it('drops invalid, unknown or overlapping buildings from tampered saves', () => {
    const s = sample();
    const tampered = {
      ...s,
      buildings: [
        ...s.buildings,
        { id: 'b9', type: 'dragonLair', x: 0, y: 0, rotation: 0, builtAt: 0 },
        { id: 'b10', type: 'cottage', x: 3, y: 2, rotation: 0, builtAt: 0 }, // overlaps the farm
        { id: 'b11', type: 'cottage', x: 25, y: 2, rotation: 0, builtAt: 0 },
        { id: 'b12', type: 'cottage', x: 1.5, y: 2, rotation: 0, builtAt: 0 },
        { id: 'b1', type: 'cottage', x: 15, y: 15, rotation: 0, builtAt: 0 }, // duplicate id
        { id: 'b13', type: 'toString', x: 16, y: 16, rotation: 0, builtAt: 0 },
        { id: 'b14', type: 'cottage', x: 18, y: 18, rotation: 0, builtAt: 0 },
      ],
    };
    const loaded = sanitizeState(JSON.parse(JSON.stringify(tampered)))!;
    expect(loaded.buildings.map((b) => b.id)).toEqual(['b1', 'b2', 'b14']);
    expect(loaded.nextId).toBe(15);
  });

  it('clears a save', () => {
    const storage = new MemoryStorage();
    saveGame(sample(), storage);
    clearSave(storage);
    expect(hasSave(storage)).toBe(false);
  });

  it('survives a storage that throws (private mode / quota)', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    expect(saveGame(sample(), broken)).toBe(false);
    expect(loadGame(broken)).toBeNull();
    expect(hasSave(broken)).toBe(false);
  });
});

describe('GameStore autosave and restore', () => {
  it('autosaves after building and restores on reopen', async () => {
    const storage = new MemoryStorage();
    const store = GameStore.restore({ storage, autosaveMs: 5 });
    store.startPlacing('cottage');
    expect(store.mode.kind).toBe('placing');
    store.tapTile({ x: 4, y: 7 });
    store.confirm();
    expect(store.state.buildings).toHaveLength(1);

    await new Promise((r) => setTimeout(r, 30));
    expect(hasSave(storage)).toBe(true);

    // "reopen the app"
    const reopened = GameStore.restore({ storage });
    expect(reopened.state.buildings).toEqual(store.state.buildings);
    expect(reopened.state.resources).toEqual({ wood: 180, stone: 140, magic: 50 });
  });

  it('persists relocation and rotation of a selected building', () => {
    const storage = new MemoryStorage();
    const store = new GameStore(undefined, { storage });
    store.startPlacing('farm');
    store.tapTile({ x: 0, y: 0 });
    store.confirm();
    store.cancel();
    store.tapTile({ x: 0, y: 0 });
    expect(store.mode).toEqual({ kind: 'selected', id: 'b1' });
    store.startMove();
    store.tapTile({ x: 12, y: 12 });
    store.rotate();
    expect(store.getSnapshot().ghostValid).toBe(true);
    store.confirm();
    store.saveNow();
    const loaded = loadGame(storage)!;
    expect(loaded.buildings[0]).toMatchObject({ x: 12, y: 12, rotation: 1 });
  });

  it('blocks confirming an invalid ghost and reports why', () => {
    const store = new GameStore(undefined, { storage: new MemoryStorage() });
    store.startPlacing('mageTower');
    store.tapTile({ x: 3, y: 3 });
    store.confirm();
    store.startPlacing('cottage');
    store.tapTile({ x: 4, y: 4 });
    expect(store.getSnapshot().ghostValid).toBe(false);
    store.confirm();
    expect(store.state.buildings).toHaveLength(1);
    expect(store.getSnapshot().toast).toMatchObject({ tone: 'error' });
  });
});
