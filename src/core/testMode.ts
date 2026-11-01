/**
 * Developer Test Mode: a separate, throwaway test island for trying buildings quickly.
 *
 * Safety model (everything here is client-side, so it is about preventing accidents, not about
 * secrecy):
 * - Gate: the Developer section only exists on a device that has developer access. Access is
 *   granted on purpose by opening the game with `?devtools=enable` and confirming a dialog (or
 *   automatically on the local dev server); `?devtools=disable` or the Settings button removes it.
 *   Without access, stored test-mode settings are ignored and the game is the normal game.
 * - Isolation: the test island is saved under TEST_SAVE_KEY. A test store refuses SAVE_KEY, and
 *   resource grants / prerequisite bypasses only work on a test store, so the player's village
 *   (SAVE_KEY) is never read for writing, overwritten or modified by test mode.
 */
import { clearSave, defaultStorage, loadGame, SAVE_KEY, type KeyValueStorage } from './save';
import { GameStore, type StoreOptions } from './store';
import type { Resources } from './types';

/** Per-device developer access flag. */
export const DEV_ACCESS_KEY = 'levelup-rpg:dev-access';
/** Test-mode switches: { enabled, unlockAll }. */
export const TEST_SETTINGS_KEY = 'levelup-rpg:test-mode';
/** The test island's save; never the village's SAVE_KEY. */
export const TEST_SAVE_KEY = 'levelup-rpg:test-save';
/** URL parameter that requests (or removes) developer access. */
export const DEV_URL_PARAM = 'devtools';

/** What the developer grant button adds. */
export const TEST_GRANT: Resources = { wood: 10_000, stone: 10_000, magic: 10_000 };

export interface TestSettings {
  enabled: boolean;
  unlockAll: boolean;
}

const OFF: TestSettings = { enabled: false, unlockAll: false };

/** What the URL asks for: 'enable' / 'disable' developer access, or nothing. */
export function devRequestFromUrl(search: string): 'enable' | 'disable' | null {
  const v = new URLSearchParams(search).get(DEV_URL_PARAM);
  return v === 'enable' ? 'enable' : v === 'disable' ? 'disable' : null;
}

export function hasDevAccess(storage: KeyValueStorage | undefined = defaultStorage(), devServer = false): boolean {
  if (devServer) return true;
  try {
    return storage?.getItem(DEV_ACCESS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDevAccess(on: boolean, storage: KeyValueStorage | undefined = defaultStorage()): void {
  try {
    if (on) storage?.setItem(DEV_ACCESS_KEY, '1');
    else {
      storage?.removeItem(DEV_ACCESS_KEY);
      storage?.removeItem(TEST_SETTINGS_KEY); // losing access always returns to the normal game
    }
  } catch {
    /* storage unavailable: access simply stays off */
  }
}

/** Test-mode settings, or all OFF when this device has no developer access (default OFF). */
export function readTestSettings(storage: KeyValueStorage | undefined = defaultStorage(), access = hasDevAccess(storage)): TestSettings {
  if (!access) return { ...OFF };
  try {
    const raw = storage?.getItem(TEST_SETTINGS_KEY);
    if (!raw) return { ...OFF };
    const v = JSON.parse(raw) as Partial<TestSettings>;
    const enabled = v.enabled === true;
    return { enabled, unlockAll: enabled && v.unlockAll === true };
  } catch {
    return { ...OFF };
  }
}

export function writeTestSettings(settings: TestSettings, storage: KeyValueStorage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(TEST_SETTINGS_KEY, JSON.stringify({ enabled: settings.enabled, unlockAll: settings.enabled && settings.unlockAll }));
  } catch {
    /* ignore */
  }
}

/**
 * Opens the realm for the current settings: the player's village normally, or the isolated test
 * island (with the unlock-all rule applied) while test mode is on.
 */
export function openRealm(settings: TestSettings, opts: Omit<StoreOptions, 'saveKey' | 'testMode'> = {}): GameStore {
  if (!settings.enabled) return GameStore.restore({ ...opts, saveKey: SAVE_KEY });
  const store = GameStore.restore({ ...opts, saveKey: TEST_SAVE_KEY, testMode: true });
  store.setRules({ ignoreRequirements: settings.unlockAll });
  return store;
}

/** Wipes the test island back to a fresh start. Never touches the village. */
export function resetTestIsland(store: GameStore): boolean {
  if (!store.testMode || store.saveKey !== TEST_SAVE_KEY) return false;
  store.reset();
  return store.saveNow();
}

/** Removes the test island's save entirely (used when developer access is removed). */
export function clearTestIsland(storage: KeyValueStorage | undefined = defaultStorage()): void {
  clearSave(storage, TEST_SAVE_KEY);
}

/** Quick facts for the Settings panel. */
export function villageSummary(storage: KeyValueStorage | undefined = defaultStorage()) {
  const v = loadGame(storage, SAVE_KEY);
  return v ? { buildings: v.buildings.length } : null;
}
