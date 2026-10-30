import { BUILDINGS } from '../core/buildings';
import { footprintSize } from '../core/grid';
import { RESOURCE_TYPES } from '../core/resources';
import type { Mode, Snapshot } from '../core/store';
import type { BuildingType } from '../core/types';
import { BuildingIcon, Glyph, ResourceIcon } from './icons';

interface Props {
  mode: Exclude<Mode, { kind: 'idle' }>;
  type: BuildingType;
  ghostValid: boolean;
  ghostIssue: Snapshot['ghostIssue'];
  onRotate: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onMove: () => void;
  onDemolish: () => void;
}

const ISSUE_TEXT: Record<NonNullable<Snapshot['ghostIssue']>, string> = {
  collision: 'Blocked — overlaps a building',
  'out-of-bounds': 'Outside the realm',
  'insufficient-resources': 'Not enough resources',
};

export function ActionBar(props: Props) {
  const { mode, type, ghostValid, ghostIssue, onRotate, onConfirm, onCancel, onMove, onDemolish } = props;
  const def = BUILDINGS[type];
  const ghost = mode.kind === 'placing' || mode.kind === 'moving';
  const rotation = ghost ? mode.rotation : undefined;
  const size = rotation !== undefined ? footprintSize(type, rotation) : { w: def.width, d: def.depth };
  const verb = mode.kind === 'placing' ? 'Place' : mode.kind === 'moving' ? 'Move' : '';
  const produces = RESOURCE_TYPES.filter((r) => def.produces[r]);

  return (
    <div className="action-bar" role="toolbar" aria-label={`${verb} ${def.name}`.trim()}>
      <div className="action-bar__info">
        <span className="action-bar__icon">
          <BuildingIcon type={type} size={34} />
        </span>
        <div className="action-bar__text">
          <div className="action-bar__title">
            {verb && <span className="action-bar__verb">{verb}</span>} {def.name}
            <span className="action-bar__size">
              {size.w}×{size.d}
            </span>
          </div>
          {ghost ? (
            <div className={`action-bar__status ${ghostValid ? 'ok' : 'bad'}`} aria-live="polite">
              {ghostValid ? 'Drag or tap the map to position' : ISSUE_TEXT[ghostIssue ?? 'collision']}
            </div>
          ) : (
            <div className="action-bar__status">
              {produces.length > 0
                ? produces.map((r) => (
                    <span key={r} className="action-bar__yield">
                      <ResourceIcon type={r} size={12} />+{def.produces[r]}/min
                    </span>
                  ))
                : def.description}
            </div>
          )}
        </div>
        {mode.kind === 'placing' && (
          <div className="action-bar__cost">
            {RESOURCE_TYPES.filter((r) => def.cost[r] > 0).map((r) => (
              <span key={r}>
                <ResourceIcon type={r} size={12} />
                {def.cost[r]}
              </span>
            ))}
          </div>
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
