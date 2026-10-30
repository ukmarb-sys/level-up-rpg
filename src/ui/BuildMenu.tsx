import { useState } from 'react';
import { BUILDING_ORDER, BUILDINGS } from '../core/buildings';
import { canAfford, RESOURCE_TYPES } from '../core/resources';
import type { BuildingType, Resources } from '../core/types';
import { BuildingIcon, Glyph, ResourceIcon } from './icons';

interface Props {
  resources: Resources;
  onPick: (type: BuildingType) => void;
}

const COLLAPSE_KEY = 'levelup-rpg:ui:build-menu-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Compact, collapsible build tray. Collapsing it reveals the whole map on short screens. */
export function BuildMenu({ resources, onPick }: Props) {
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
          {BUILDING_ORDER.map((type) => {
            const def = BUILDINGS[type];
            const affordable = canAfford(resources, def.cost);
            return (
              <button
                key={type}
                className={`build-card ${affordable ? '' : 'build-card--locked'}`}
                onClick={() => onPick(type)}
                aria-disabled={!affordable}
                aria-label={`${def.name}, ${def.width} by ${def.depth} tiles${affordable ? '' : ', not enough resources'}`}
                title={def.description}
              >
                <span className="build-card__art">
                  <BuildingIcon type={type} size={38} />
                </span>
                <span className="build-card__name">{def.name}</span>
                <span className="build-card__cost">
                  {RESOURCE_TYPES.filter((r) => def.cost[r] > 0).map((r) => (
                    <span key={r} className={resources[r] < def.cost[r] ? 'short' : ''}>
                      <ResourceIcon type={r} size={11} />
                      {def.cost[r]}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}
