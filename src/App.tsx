import { useEffect, useState } from 'react';
import { hasSave } from './core/save';
import {
  clearTestIsland,
  devRequestFromUrl,
  DEV_URL_PARAM,
  hasDevAccess,
  openRealm,
  readTestSettings,
  resetTestIsland,
  setDevAccess,
  TEST_GRANT,
  TEST_SAVE_KEY,
  villageSummary,
  writeTestSettings,
  type TestSettings,
} from './core/testMode';
import { installModules } from './modules';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { GameScreen, type SettingsProps } from './ui/GameScreen';
import { StartScreen } from './ui/StartScreen';
import { UpdateBanner, useStaleBuild } from './ui/UpdateBanner';

/** The local dev server always has developer access; the deployed game needs it granted. */
const DEV_SERVER = import.meta.env.DEV;

/** Removes ?devtools=… from the address bar so a reload or shared link doesn't repeat it. */
function dropDevParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(DEV_URL_PARAM)) return;
    url.searchParams.delete(DEV_URL_PARAM);
    window.history.replaceState(null, '', url.toString());
  } catch {
    /* ignore */
  }
}

export function App() {
  const [devAccess, setDevAccessState] = useState(() => hasDevAccess(undefined, DEV_SERVER));
  const [settings, setSettings] = useState<TestSettings>(() => readTestSettings(undefined, devAccess));
  const [store, setStore] = useState(() => openRealm(settings));
  const [screen, setScreen] = useState<'start' | 'game'>('start');
  const [saveExists, setSaveExists] = useState(() => hasSave(undefined, store.saveKey));
  const [devRequest, setDevRequest] = useState(() => (typeof window === 'undefined' ? null : devRequestFromUrl(window.location.search)));

  useEffect(() => installModules(store), [store]);

  // Persist immediately when the app is backgrounded or closed (mobile browsers may kill it).
  useEffect(() => {
    const flush = () => store.saveNow();
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [store]);

  // ?devtools=disable removes access straight away (no prompt needed to turn cheats off).
  useEffect(() => {
    if (devRequest !== 'disable') return;
    removeDevAccess();
    setDevRequest(null);
    dropDevParam();
  }, [devRequest]);

  /** Saves the realm that's open, then opens the village or the test island for `next`. */
  function applySettings(next: TestSettings) {
    const switching = next.enabled !== settings.enabled;
    store.saveNow();
    writeTestSettings(next);
    setSettings(next);
    if (!switching) {
      store.setRules({ ignoreRequirements: next.unlockAll });
      return;
    }
    const opened = openRealm(next);
    setStore(opened);
    setSaveExists(hasSave(undefined, opened.saveKey));
  }

  function removeDevAccess() {
    store.saveNow();
    setDevAccess(false);
    clearTestIsland();
    setDevAccessState(DEV_SERVER);
    const off = { enabled: false, unlockAll: false };
    setSettings(off);
    if (store.testMode) {
      const village = openRealm(off);
      setStore(village);
      setSaveExists(hasSave(undefined, village.saveKey));
    }
  }

  const settingsProps: SettingsProps = {
    devAccess,
    settings,
    villageBuildings: () => villageSummary()?.buildings ?? null,
    onChangeSettings: applySettings,
    onGrant: () => {
      if (store.grantResources(TEST_GRANT)) store.toast('Test resources granted.');
    },
    onResetTestIsland: () => {
      if (resetTestIsland(store)) store.toast('Test island reset.');
    },
    onRemoveDevAccess: removeDevAccess,
  };

  const stale = useStaleBuild();
  const reload = () => {
    store.saveNow(); // never lose progress when reloading for an update
    window.location.reload();
  };
  const banner = stale ? <UpdateBanner onReload={reload} /> : null;

  const devPrompt =
    devRequest === 'enable' && !devAccess ? (
      <ConfirmDialog
        title="Enable developer tools on this device?"
        body="This adds a Developer section to Settings with a separate test mode for trying buildings. It is meant for the game's developer. Your village is never changed by it, and you can remove access at any time."
        confirmLabel="Enable developer tools"
        onConfirm={() => {
          setDevAccess(true);
          setDevAccessState(true);
          setDevRequest(null);
          dropDevParam();
        }}
        onCancel={() => {
          setDevRequest(null);
          dropDevParam();
        }}
      />
    ) : null;

  if (screen === 'start') {
    return (
      <>
        {banner}
        <StartScreen
          hasSave={saveExists}
          buildingCount={store.state.buildings.length}
          testMode={store.testMode}
          onContinue={() => setScreen('game')}
          onNew={() => {
            store.reset();
            store.saveNow();
            setScreen('game');
          }}
        />
        {devPrompt}
      </>
    );
  }
  return (
    <>
      {banner}
      <GameScreen
        key={store.saveKey === TEST_SAVE_KEY ? 'test-island' : 'village'}
        store={store}
        settingsProps={settingsProps}
        onExit={() => {
          store.saveNow();
          setSaveExists(hasSave(undefined, store.saveKey));
          setScreen('start');
        }}
      />
      {devPrompt}
    </>
  );
}
