import type { Mode } from '../core/store';
import { Glyph } from './icons';

interface Props {
  mode: Exclude<Mode, { kind: 'idle' }>;
  title: string;
  ghostValid: boolean;
  onRotate: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onMove: () => void;
  onDemolish: () => void;
}

export function ActionBar({ mode, title, ghostValid, onRotate, onConfirm, onCancel, onMove, onDemolish }: Props) {
  const ghost = mode.kind === 'placing' || mode.kind === 'moving';
  return (
    <div className="action-bar" role="toolbar" aria-label={title}>
      <div className="action-bar__title">
        {title}
        {ghost && (
          <small className={ghostValid ? 'ok' : 'bad'}>
            {ghostValid ? 'Tap or drag to position' : 'Cannot build here'}
          </small>
        )}
      </div>
      <div className="action-bar__buttons">
        {ghost ? (
          <>
            <button className="act" onClick={onCancel}>
              <Glyph name="close" />
              <span>Cancel</span>
            </button>
            <button className="act" onClick={onRotate}>
              <Glyph name="rotate" />
              <span>Rotate</span>
            </button>
            <button className="act act--primary" onClick={onConfirm} disabled={!ghostValid}>
              <Glyph name="check" />
              <span>{mode.kind === 'placing' ? 'Build' : 'Place'}</span>
            </button>
          </>
        ) : (
          <>
            <button className="act" onClick={onCancel}>
              <Glyph name="close" />
              <span>Close</span>
            </button>
            <button className="act" onClick={onRotate}>
              <Glyph name="rotate" />
              <span>Rotate</span>
            </button>
            <button className="act" onClick={onMove}>
              <Glyph name="move" />
              <span>Move</span>
            </button>
            <button className="act act--danger" onClick={onDemolish}>
              <Glyph name="trash" />
              <span>Demolish</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
