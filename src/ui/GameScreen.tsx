import { useEffect, useRef, useState } from 'react';
import type { GameStore } from '../core/store';
import type { GameHandle } from '../game/createGame';
import { ActionBar } from './ActionBar';
import { BuildMenu } from './BuildMenu';
import { Glyph } from './icons';
import { ResourceBar } from './ResourceBar';
import { Toast } from './Toast';
import { useSnapshot } from './useStore';

interface Props {
  store: GameStore;
  onExit: () => void;
}

export function GameScreen({ store, onExit }: Props) {
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
    <div className="game">
      <div className="game__canvas" ref={hostRef} />
      <div className="game__vignette" aria-hidden />
      {loading && <div className="game__loading">Summoning the realm…</div>}

      <header className="hud-top">
        <button className="icon-btn" onClick={onExit} aria-label="Back to title">
          <Glyph name="menu" />
        </button>
        <ResourceBar state={snap.state} />
      </header>

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
          <BuildMenu resources={snap.state.resources} buildings={snap.state.buildings} onPick={(t) => store.startPlacing(t)} />
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
    </div>
  );
}
