import { useEffect, useState } from 'react';
import { GameStore } from './core/store';
import { hasSave } from './core/save';
import { installModules } from './modules';
import { GameScreen } from './ui/GameScreen';
import { StartScreen } from './ui/StartScreen';

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

  if (screen === 'start') {
    return (
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
    );
  }
  return (
    <GameScreen
      store={store}
      onExit={() => {
        store.saveNow();
        setSaveExists(hasSave());
        setScreen('start');
      }}
    />
  );
}
