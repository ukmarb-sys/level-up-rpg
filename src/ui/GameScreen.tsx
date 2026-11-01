import { useEffect, useRef, useState } from 'react';
import type { GameStore } from '../core/store';
import type { GameHandle } from '../game/createGame';
import type { TestSettings } from '../core/testMode';
import { ActionBar } from './ActionBar';
import { BuildCatalog } from './BuildCatalog';
import { Glyph } from './icons';
import { SettingsPanel } from './SettingsPanel';
import { ResourceBar } from './ResourceBar';
import { Toast } from './Toast';
import { useSnapshot } from './useStore';

/** Settings and Developer Test Mode wiring, owned by App. */
export interface SettingsProps {
  devAccess: boolean;
  settings: TestSettings;
  villageBuildings: () => number | null;
  onChangeSettings: (next: TestSettings) => void;
  onGrant: () => void;
  onResetTestIsland: () => void;
  onRemoveDevAccess: () => void;
}

interface Props {
  store: GameStore;
  onExit: () => void;
  settingsProps: SettingsProps;
}

export function GameScreen({ store, onExit, settingsProps }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameHandle | null>(null);
  const [loading, setLoading] = useState(true);
  const snap = useSnapshot(store);

  useEffect(() => {
    let cancelled = false;
    // Phaser is code-split so the title screen loads instantly.
    import('../game/createGame').then(({ createGame }) => {
      if (cancelled || !hostRef.current) return;
      gameRef.current = createGame(hostRef.current, store);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, [store]);

  const { mode } = snap;
  const selected = mode.kind === 'selected' ? snap.state.buildings.find((b) => b.id === mode.id) : undefined;

  return (
    <div className={`game ${store.testMode ? 'game--test' : ''}`}>
      <div className="game__canvas" ref={hostRef} />
      <div className="game__vignette" aria-hidden />
      {loading && <div className="game__loading">Summoning the realm…</div>}

      <header className="hud-top">
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <Glyph name="gear" />
        </button>
        <ResourceBar state={snap.state} />
      </header>

      {store.testMode && (
        <div className="test-badge" role="status" aria-label="Test mode active">
          <Glyph name="flask" size={14} />
          TEST MODE{settingsProps.settings.unlockAll ? ' · all unlocked' : ''}
        </div>
      )}

      <div className="zoom-controls">
        <button className="icon-btn" aria-label="Zoom in" onClick={() => gameRef.current?.zoomBy(1.25)}>
          <Glyph name="plus" />
        </button>
        <button className="icon-btn" aria-label="Zoom out" onClick={() => gameRef.current?.zoomBy(0.8)}>
          <Glyph name="minus" />
        </button>
      </div>

      <Toast toast={snap.toast} />

      <footer className="hud-bottom">
        {mode.kind === 'idle' ? (
          <BuildCatalog
            resources={snap.state.resources}
            buildings={snap.state.buildings}
            rules={store.ruleOptions}
            onPick={(t) => store.startPlacing(t)}
          />
        ) : (
          <ActionBar
            mode={mode}
            type={mode.kind === 'selected' ? (selected?.type ?? 'cottage') : mode.type}
            ghostValid={snap.ghostValid}
            ghostIssue={snap.ghostIssue}
            onRotate={() => store.rotate()}
            onConfirm={() => store.confirm()}
            onCancel={() => store.cancel()}
            onMove={() => store.startMove()}
            onDemolish={() => store.demolishSelected()}
          />
        )}
      </footer>

      {settingsOpen && (
        <SettingsPanel
          devAccess={settingsProps.devAccess}
          settings={settingsProps.settings}
          villageBuildings={settingsProps.villageBuildings()}
          onClose={() => setSettingsOpen(false)}
          onExitToTitle={onExit}
          onChangeSettings={(next) => {
            // switching between the village and the test island reloads the map: close the sheet
            if (next.enabled !== settingsProps.settings.enabled) setSettingsOpen(false);
            settingsProps.onChangeSettings(next);
          }}
          onGrant={settingsProps.onGrant}
          onResetTestIsland={settingsProps.onResetTestIsland}
          onRemoveDevAccess={() => {
            setSettingsOpen(false);
            settingsProps.onRemoveDevAccess();
          }}
        />
      )}
    </div>
  );
}
