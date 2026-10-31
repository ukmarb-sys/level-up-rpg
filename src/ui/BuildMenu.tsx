import { useState } from 'react';
import { buildCatalog, BUILDINGS } from '../core/buildings';
import { canAfford, RESOURCE_TYPES } from '../core/resources';
import type { Building, BuildingType, Resources } from '../core/types';
import { artUrl } from '../assets/artUrls';
import { buildingKey } from '../assets/manifest';
import { BuildingIcon, Glyph, ResourceIcon } from './icons';

interface Props {
  resources: Resources;
  buildings: Building[];
  onPick: (type: BuildingType) => void;
}

/** A building is offered when its painted r0 sprite is bundled (r1-r3 fall back to it). */
const hasPaintedArt = (type: BuildingType) => artUrl(buildingKey(type, 0)) !== undefined;

const COLLAPSE_KEY = 'levelup-rpg:ui:build-menu-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Compact, collapsible build tray. Collapsing it reveals the whole map on short screens. */
export function BuildMenu({ resources, buildings, onPick }: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* preference only */
    }
  };

  return (
    <nav className={`build-menu ${collapsed ? 'build-menu--collapsed' : ''}`} aria-label="Build menu">
      <button className="build-menu__toggle" onClick={toggle} aria-expanded={!collapsed}>
        <span>Build</span>
        <Glyph name={collapsed ? 'chevronUp' : 'chevronDown'} />
      </button>
      {!collapsed && (
        <div className="build-menu__cards">
          {buildCatalog(buildings, hasPaintedArt).map(({ type, availability }) => {
            const def = BUILDINGS[type];
            const affordable = canAfford(resources, def.cost);
            const blocked = !availability.ok;
            const needed = availability.ok || availability.reason !== 'locked' ? [] : availability.missing;
            const missing = needed.map((t) => BUILDINGS[t].name);
            // the card shows the first requirement (+N more); the label and tooltip list them all
            const note = availability.ok
              ? null
              : needed.length
                ? `Needs ${BUILDINGS[needed[0]].shortName ?? missing[0]}${needed.length > 1 ? ` +${needed.length - 1}` : ''}`
                : 'Built';
            const fullNote = missing.length ? `Needs ${missing.join(', ')}` : note;
            const state = blocked ? `, ${fullNote}` : affordable ? '' : ', not enough resources';
            return (
              <button
                key={type}
                className={`build-card ${affordable && !blocked ? '' : 'build-card--locked'} ${blocked ? 'build-card--gated' : ''}`}
                onClick={() => onPick(type)}
                aria-disabled={!affordable || blocked}
                aria-label={`${def.name}, ${def.width} by ${def.depth} tiles${state}`}
                title={fullNote ? `${def.description} (${fullNote})` : def.description}
              >
                <span className="build-card__art">
                  <BuildingIcon type={type} size={38} />
                </span>
                <span className="build-card__name">{def.name}</span>
                {note ? (
                  <span className="build-card__note">
                    {availability.ok || availability.reason !== 'locked' ? null : <Glyph name="lock" size={10} />}
                    {note}
                  </span>
                ) : (
                  <span className="build-card__cost">
                    {RESOURCE_TYPES.filter((r) => def.cost[r] > 0).map((r) => (
                      <span key={r} className={resources[r] < def.cost[r] ? 'short' : ''}>
                        <ResourceIcon type={r} size={11} />
                        {def.cost[r]}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}
