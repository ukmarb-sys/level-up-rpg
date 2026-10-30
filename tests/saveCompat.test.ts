import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STATE_VERSION } from '../src/core/game';
import { loadGame, SAVE_KEY, saveGame } from '../src/core/save';
import { GameStore } from '../src/core/store';
import { MemoryStorage } from './memoryStorage';

/** A save written by the first released prototype (PR #1). It must keep loading unchanged. */
const fixture = readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8');

describe('save compatibility', () => {
  it('still uses save format version 1', () => {
    expect(STATE_VERSION).toBe(1);
  });

  it('loads a v1 save exactly as written', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, fixture);
    expect(loadGame(storage)).toEqual(JSON.parse(fixture).state);
  });

  it('keeps every building and lets play continue from the restored state', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, fixture);
    const store = GameStore.restore({ storage });
    expect(store.state.buildings.map((b) => b.id)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5']);
    store.startPlacing('cottage');
    store.tapTile({ x: 0, y: 0 });
    store.confirm();
    expect(store.state.buildings.at(-1)).toMatchObject({ id: 'b6', type: 'cottage', x: 0, y: 0 });
    expect(store.state.resources).toEqual({ wood: 20, stone: 20, magic: 20 });
  });

  it('never writes rendering or UI state into saves', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, fixture);
    const store = GameStore.restore({ storage });
    store.startPlacing('farm');
    store.saveNow();
    const saved = JSON.parse(storage.getItem(SAVE_KEY)!);
    expect(Object.keys(saved.state).sort()).toEqual(Object.keys(JSON.parse(fixture).state).sort());
    expect(JSON.stringify(saved)).not.toMatch(/ghost|sprite|texture|asset|grid/i);
  });

  it('round-trips through save/load without changes', () => {
    const storage = new MemoryStorage();
    const state = JSON.parse(fixture).state;
    saveGame(state, storage);
    expect(loadGame(storage)).toEqual(state);
  });
});
