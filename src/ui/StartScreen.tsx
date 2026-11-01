import { useMemo, useState } from 'react';
import { BUILD_ID } from '../core/version';

interface Props {
  hasSave: boolean;
  buildingCount: number;
  /** The open realm is the Developer Test Mode island, not the village. */
  testMode?: boolean;
  onContinue: () => void;
  onNew: () => void;
}

/** Moonlit title screen: layered SVG landscape, floating citadel and drifting embers. */
export function StartScreen({ hasSave, buildingCount, testMode = false, onContinue, onNew }: Props) {
  const [confirming, setConfirming] = useState(false);
  const embers = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i * 0.73) % 9}s`,
        duration: `${7 + ((i * 1.3) % 6)}s`,
        size: `${2 + (i % 3)}px`,
      })),
    [],
  );

  return (
    <main className="start">
      <svg className="start__landscape" viewBox="0 0 400 700" preserveAspectRatio="xMidYMax slice" aria-hidden>
        <defs>
          <radialGradient id="moon" cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#fff7e0" />
            <stop offset=".6" stopColor="#f3e3b5" />
            <stop offset="1" stopColor="#f3e3b5" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a2350" />
            <stop offset="1" stopColor="#151129" />
          </linearGradient>
          <linearGradient id="near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#15122a" />
            <stop offset="1" stopColor="#07060f" />
          </linearGradient>
          <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b79cff" stopOpacity=".55" />
            <stop offset="1" stopColor="#b79cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle className="start__moon" cx="320" cy="110" r="58" fill="url(#moon)" />
        <path d="M0 470 60 390l50 50 70-110 60 80 50-60 60 70 50-40v340H0z" fill="url(#far)" />
        {/* floating island with citadel */}
        <g className="start__island">
          <g transform="translate(0 70)">
          <path d="M120 360h160l-30 40-30 10-20 40-20-40-30-10z" fill="#2b1f2e" />
          <path d="M120 360h160l-12 10H132z" fill="#3f6b3a" />
          <path d="M150 360v-40h20v40zM230 360v-40h20v40z" fill="#3b3550" />
          <path d="M146 322l14-22 14 22zM226 322l14-22 14 22z" fill="#4b3a99" />
          <path d="M185 360V280h30v80z" fill="#4a4566" />
          <path d="M180 282l20-52 20 52z" fill="#5b45c0" />
          <rect x="196" y="300" width="8" height="16" rx="4" fill="#ffc96b" />
          <rect x="157" y="335" width="6" height="9" rx="3" fill="#ffc96b" />
          <rect x="237" y="335" width="6" height="9" rx="3" fill="#ffc96b" />
          <circle className="start__orb" cx="200" cy="222" r="7" fill="#e4dcff" />
          <path d="M193 222h14L230 0h-60z" fill="url(#beam)" opacity=".3" />
          </g>
        </g>
        <path d="M0 560 50 520l40 25 60-45 70 50 60-35 50 30 70-40v435H0z" fill="url(#near)" />
        <path d="M0 620 30 600l40 18 50-30 60 28 70-22 60 24 90-30v112H0z" fill="#05040b" />
      </svg>

      <div className="start__embers" aria-hidden>
        {embers.map((e, i) => (
          <span key={i} style={{ left: e.left, animationDelay: e.delay, animationDuration: e.duration, width: e.size, height: e.size }} />
        ))}
      </div>

      <div className="start__content">
        <p className="start__kicker">An odyssey of self-mastery</p>
        <h1 className="start__title">
          <span>LEVEL UP</span>
          <span className="start__rpg">RPG</span>
        </h1>
        <p className="start__subtitle">Realms of Becoming</p>
        <div className="start__divider" aria-hidden>
          <span />◆<span />
        </div>

        {testMode && (
          <p className="test-badge test-badge--start" role="status">
            TEST MODE · test island (your village is kept separately)
          </p>
        )}
        <div className="start__actions">
          {hasSave && !confirming && (
            <button className="btn btn--primary" onClick={onContinue}>
              {testMode ? 'Continue test island' : 'Continue your realm'}
              <small>{buildingCount} {buildingCount === 1 ? 'building' : 'buildings'} standing</small>
            </button>
          )}
          {!confirming && (
            <button
              className={hasSave ? 'btn btn--ghost' : 'btn btn--primary'}
              onClick={() => (hasSave && buildingCount > 0 ? setConfirming(true) : onNew())}
            >
              {testMode ? 'New test island' : 'Begin a new realm'}
            </button>
          )}
          {confirming && (
            <div className="start__confirm" role="alertdialog" aria-label="Confirm new realm">
              <p>{testMode ? 'Wipe the test island? Your village is not affected.' : 'Abandon your current realm? This cannot be undone.'}</p>
              <div className="start__confirm-row">
                <button className="btn btn--ghost" onClick={() => setConfirming(false)}>
                  Keep it
                </button>
                <button className="btn btn--danger" onClick={onNew}>
                  Start anew
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="start__hint">Tap to build · Drag to pan · Pinch to zoom</p>
        <p className="start__build" aria-label={`Build ${BUILD_ID}`}>
          build {BUILD_ID}
        </p>
      </div>
    </main>
  );
}
