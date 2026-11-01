import { useState } from 'react';
import { TEST_GRANT, type TestSettings } from '../core/testMode';
import { BUILD_ID } from '../core/version';
import { ConfirmDialog } from './ConfirmDialog';
import { Glyph } from './icons';

interface Props {
  /** This device has developer access (granted on purpose; see core/testMode.ts). */
  devAccess: boolean;
  settings: TestSettings;
  /** Buildings in the player's village (shown so it's clear the village is safe). */
  villageBuildings: number | null;
  onClose: () => void;
  onExitToTitle: () => void;
  onChangeSettings: (next: TestSettings) => void;
  onGrant: () => void;
  onResetTestIsland: () => void;
  onRemoveDevAccess: () => void;
}

const fmt = (n: number) => n.toLocaleString('en-US');

/** Settings sheet. The Developer section only exists on devices with developer access. */
export function SettingsPanel(p: Props) {
  const [confirm, setConfirm] = useState<'reset' | 'enable' | 'remove' | null>(null);
  const { settings } = p;

  return (
    <div className="sheet-backdrop" onClick={p.onClose}>
      <section className="settings" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className="settings__head">
          <h2>Settings</h2>
          <button className="catalog__close" onClick={p.onClose} aria-label="Close settings">
            <Glyph name="close" size={18} />
          </button>
        </header>

        <div className="settings__group">
          <button className="settings__row" onClick={p.onExitToTitle}>
            <Glyph name="menu" size={18} />
            <span>Back to title</span>
          </button>
          <p className="settings__fine">Build {BUILD_ID}</p>
        </div>

        {p.devAccess && (
          <div className="settings__group settings__group--dev" aria-label="Developer">
            <h3>
              <Glyph name="flask" size={16} /> Developer
            </h3>
            <label className="settings__toggle">
              <span>
                <strong>Test mode</strong>
                <small>A separate test island. Your village is never touched.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={settings.enabled}
                onChange={(e) => (e.target.checked ? setConfirm('enable') : p.onChangeSettings({ enabled: false, unlockAll: false }))}
                aria-label="Test mode"
              />
            </label>

            {settings.enabled && (
              <>
                <button className="btn btn--ghost settings__btn" onClick={p.onGrant}>
                  Grant {fmt(TEST_GRANT.wood)} wood, {fmt(TEST_GRANT.stone)} stone and {fmt(TEST_GRANT.magic)} magic
                </button>
                <label className="settings__toggle">
                  <span>
                    <strong>Unlock all buildings for testing</strong>
                    <small>Skips prerequisites on the test island only. Costs, limits and collision still apply.</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={settings.unlockAll}
                    onChange={(e) => p.onChangeSettings({ ...settings, unlockAll: e.target.checked })}
                    aria-label="Unlock all buildings for testing"
                  />
                </label>
                <button className="btn btn--danger settings__btn" onClick={() => setConfirm('reset')}>
                  Reset test island
                </button>
                <button className="btn btn--primary settings__btn" onClick={() => p.onChangeSettings({ enabled: false, unlockAll: false })}>
                  Return to my village
                  <small>{p.villageBuildings === null ? 'No village saved yet' : `${p.villageBuildings} buildings, unchanged`}</small>
                </button>
              </>
            )}
            <button className="settings__row settings__row--quiet" onClick={() => setConfirm('remove')}>
              Remove developer access from this device
            </button>
          </div>
        )}
      </section>

      {confirm === 'enable' && (
        <ConfirmDialog
          title="Enter test mode?"
          body="You'll play on a separate test island. Your village is saved first and stays exactly as it is; turn test mode off to return to it."
          confirmLabel="Enter test mode"
          onConfirm={() => {
            setConfirm(null);
            p.onChangeSettings({ enabled: true, unlockAll: false });
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'reset' && (
        <ConfirmDialog
          title="Reset the test island?"
          body="Every building and resource on the test island is wiped and it starts fresh. Your village is not affected."
          confirmLabel="Reset test island"
          danger
          onConfirm={() => {
            setConfirm(null);
            p.onResetTestIsland();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'remove' && (
        <ConfirmDialog
          title="Remove developer access?"
          body="The Developer section disappears, the test island is deleted and you return to your village. Your village is not affected."
          confirmLabel="Remove access"
          danger
          onConfirm={() => {
            setConfirm(null);
            p.onRemoveDevAccess();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
