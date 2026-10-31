import { useEffect, useState } from 'react';
import { GameStore } from './core/store';
import { hasSave } from './core/save';
import { installModules } from './modules';
import { GameScreen } from './ui/GameScreen';
import { StartScreen } from './ui/StartScreen';
import { UpdateBanner, useStaleBuild } from './ui/UpdateBanner';

export function App() {
  const [store] = useState(() => GameStore.restore());
  const [screen, setScreen] = useState<'start' | 'game'>('start');
  const [saveExists, setSaveExists] = useState(() => hasSave());

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

  const stale = useStaleBuild();
  const reload = () => {
    store.saveNow(); // never lose progress when reloading for an update
    window.location.reload();
  };
  const banner = stale ? <UpdateBanner onReload={reload} /> : null;

  if (screen === 'start') {
    return (
      <>
        {banner}
        <StartScreen
          hasSave={saveExists}
          buildingCount={store.state.buildings.length}
          onContinue={() => setScreen('game')}
          onNew={() => {
            store.reset();
            store.saveNow();
            setScreen('game');
          }}
        />
      </>
    );
  }
  return (
    <>
      {banner}
      <GameScreen
        store={store}
        onExit={() => {
          store.saveNow();
          setSaveExists(hasSave());
          setScreen('start');
        }}
      />
    </>
  );
}
