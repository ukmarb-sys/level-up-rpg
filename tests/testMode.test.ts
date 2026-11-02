/**
 * Developer Test Mode: off by default, only reachable on a device with developer access, and
 * fully isolated from the player's village save.
 */
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/core/buildings';
import { createInitialState } from '../src/core/game';
import { SAVE_KEY, saveGame, type KeyValueStorage } from '../src/core/save';
import { GameStore } from '../src/core/store';
import {
  DEV_ACCESS_KEY,
  devRequestFromUrl,
  hasDevAccess,
  openRealm,
  readTestSettings,
  resetTestIsland,
  setDevAccess,
  TEST_GRANT,
  TEST_SAVE_KEY,
  TEST_SETTINGS_KEY,
  writeTestSettings,
} from '../src/core/testMode';
import type { GameState } from '../src/core/types';

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}

/** A small existing village: cottage, farm and sawmill. */
function seedVillage(storage: KeyValueStorage): string {
  let s: GameState = { ...createInitialState(1), resources: { wood: 140, stone: 70, magic: 45 } };
  s = {
    ...s,
    buildings: [
      { id: 'b1', type: 'cottage', x: 8, y: 8, rotation: 0, builtAt: 1 },
      { id: 'b2', type: 'farm', x: 10, y: 8, rotation: 0, builtAt: 1 },
      { id: 'b3', type: 'sawmill', x: 8, y: 11, rotation: 0, builtAt: 1 },
    ],
    nextId: 4,
  };
  saveGame(s, storage, 123);
  return storage.getItem(SAVE_KEY)!;
}

const opts = (storage: KeyValueStorage) => ({ storage, autosaveMs: 1, now: () => 1000 });

describe('developer access gate', () => {
  it('is off by default: no access, and test settings read as OFF', () => {
    const st = memory();
    expect(hasDevAccess(st)).toBe(false);
    expect(readTestSettings(st)).toEqual({ enabled: false, unlockAll: false });
  });

  it('ignores stored test-mode settings on a device without developer access', () => {
    const st = memory();
    st.setItem(TEST_SETTINGS_KEY, JSON.stringify({ enabled: true, unlockAll: true }));
    expect(readTestSettings(st)).toEqual({ enabled: false, unlockAll: false });
    expect(openRealm(readTestSettings(st), opts(st)).testMode).toBe(false);
  });

  it('only enables access on an explicit request; removing access also turns test mode off', () => {
    expect(devRequestFromUrl('')).toBeNull();
    expect(devRequestFromUrl('?devtools=1')).toBeNull();
    expect(devRequestFromUrl('?devtools=true')).toBeNull();
    expect(devRequestFromUrl('?devtools=enable')).toBe('enable');
    expect(devRequestFromUrl('?perf&devtools=disable')).toBe('disable');
    const st = memory();
    setDevAccess(true, st);
    expect(st.getItem(DEV_ACCESS_KEY)).toBe('1');
    writeTestSettings({ enabled: true, unlockAll: true }, st);
    expect(readTestSettings(st)).toEqual({ enabled: true, unlockAll: true });
    setDevAccess(false, st);
    expect(hasDevAccess(st)).toBe(false);
    expect(st.getItem(TEST_SETTINGS_KEY)).toBeNull();
    expect(readTestSettings(st)).toEqual({ enabled: false, unlockAll: false });
  });

  it('never stores unlock-all without test mode', () => {
    const st = memory();
    setDevAccess(true, st);
    writeTestSettings({ enabled: false, unlockAll: true }, st);
    expect(readTestSettings(st)).toEqual({ enabled: false, unlockAll: false });
  });
});

describe('test-only powers are refused outside test mode', () => {
  it('does not grant resources or bypass prerequisites on the normal village store', () => {
    const st = memory();
    seedVillage(st);
    const village = openRealm({ enabled: false, unlockAll: false }, opts(st));
    expect(village.testMode).toBe(false);
    expect(village.saveKey).toBe(SAVE_KEY);
    const before = village.state.resources;
    expect(village.grantResources(TEST_GRANT)).toBe(false);
    expect(village.setRules({ ignoreRequirements: true })).toBe(false);
    expect(village.state.resources).toEqual(before);
    expect(village.ruleOptions).toEqual({});
    village.startPlacing('temple');
    expect(village.mode.kind).toBe('idle'); // still locked
  });

  it('refuses to create a test store on the village save key', () => {
    expect(() => new GameStore(undefined, { storage: memory(), saveKey: SAVE_KEY, testMode: true })).toThrow();
  });
});

describe('the test island', () => {
  it('starts fresh and isolated: the village save is byte-for-byte untouched through every action', () => {
    const st = memory();
    const village = seedVillage(st);
    const test = openRealm({ enabled: true, unlockAll: true }, opts(st));
    expect(test.testMode).toBe(true);
    expect(test.saveKey).toBe(TEST_SAVE_KEY);
    expect(test.state.buildings).toHaveLength(0); // not a copy of the village

    // grant, place a locked building (unlock-all), rotate it, collide, demolish, reset
    expect(test.grantResources(TEST_GRANT)).toBe(true);
    expect(test.state.resources).toEqual({ wood: 10_200, stone: 10_150, magic: 10_050 });
    test.startPlacing('temple');
    expect(test.mode.kind).toBe('placing');
    test.tapTile({ x: 5, y: 5 });
    test.rotate();
    test.confirm();
    const temple = test.state.buildings.find((b) => b.type === 'temple')!;
    expect(temple).toMatchObject({ rotation: 1 });
    expect(test.state.resources).toEqual({ wood: 10_200, stone: 10_150 - 180, magic: 10_050 - 120 });
    // collision still applies on the test island
    test.cancel();
    test.startPlacing('castle');
    test.tapTile({ x: temple.x, y: temple.y });
    expect(test.getSnapshot().ghostIssue).toBe('collision');
    test.cancel();
    // the one-per-realm limit still applies
    test.startPlacing('temple');
    expect(test.mode.kind).toBe('idle');
    test.saveNow();

    expect(st.getItem(SAVE_KEY)).toBe(village);
    expect(JSON.parse(st.getItem(TEST_SAVE_KEY)!).state.buildings.map((b: { type: string }) => b.type)).toEqual(['temple']);

    expect(resetTestIsland(test)).toBe(true);
    const reset = JSON.parse(st.getItem(TEST_SAVE_KEY)!).state;
    expect(reset.buildings).toEqual([]);
    expect(reset.resources).toEqual({ wood: 200, stone: 150, magic: 50 });
    expect(st.getItem(SAVE_KEY)).toBe(village);
  });

  it('enforces prerequisites on the test island unless unlock-all is on', () => {
    const st = memory();
    const test = openRealm({ enabled: true, unlockAll: false }, opts(st));
    test.grantResources(TEST_GRANT);
    test.startPlacing('temple');
    expect(test.mode.kind).toBe('idle');
    expect(test.setRules({ ignoreRequirements: true })).toBe(true);
    test.startPlacing('temple');
    expect(test.mode.kind).toBe('placing');
  });

  it('returns to the original village unchanged and keeps the test island for next time', () => {
    const st = memory();
    const village = seedVillage(st);
    const test = openRealm({ enabled: true, unlockAll: true }, opts(st));
    test.grantResources(TEST_GRANT);
    test.startPlacing('marketplace');
    test.confirm();
    test.saveNow();
    const back = openRealm({ enabled: false, unlockAll: false }, opts(st));
    expect(back.saveKey).toBe(SAVE_KEY);
    expect(back.state.buildings.map((b) => b.type)).toEqual(['cottage', 'farm', 'sawmill']);
    expect(back.state.resources).toEqual({ wood: 140, stone: 70, magic: 45 });
    expect(st.getItem(SAVE_KEY)).toBe(village);
    const again = openRealm({ enabled: true, unlockAll: true }, opts(st));
    expect(again.state.buildings.map((b) => b.type)).toEqual(['marketplace']);
  });

  it('cannot reset a realm that is not the test island', () => {
    const st = memory();
    const village = seedVillage(st);
    const store = openRealm({ enabled: false, unlockAll: false }, opts(st));
    expect(resetTestIsland(store)).toBe(false);
    expect(store.state.buildings).toHaveLength(3);
    expect(st.getItem(SAVE_KEY)).toBe(village);
  });

  it('grants exactly 10,000 of each resource and leaves building rules untouched', () => {
    expect(TEST_GRANT).toEqual({ wood: 10_000, stone: 10_000, magic: 10_000 });
    expect(BUILDINGS.temple.requires).toEqual(['alchemist']);
  });
});

describe('placing one-per-realm buildings', () => {
  it('selects the new building instead of offering a second when the realm limit is reached', () => {
    const st = memory();
    const test = openRealm({ enabled: true, unlockAll: true }, opts(st));
    test.grantResources(TEST_GRANT);
    test.startPlacing('castle');
    test.confirm();
    expect(test.state.buildings.map((b) => b.type)).toEqual(['castle']);
    expect(test.mode.kind).toBe('selected');
    // repeatable buildings still offer quick repeat placement
    test.cancel();
    test.startPlacing('cottage');
    test.confirm();
    expect(test.mode.kind).toBe('placing');
  });
});
