import { BUILDING_ORDER, BUILDINGS } from '../core/buildings';
import { canAfford, RESOURCE_TYPES } from '../core/resources';
import type { BuildingType, Resources } from '../core/types';
import { BuildingIcon, ResourceIcon } from './icons';

interface Props {
  resources: Resources;
  onPick: (type: BuildingType) => void;
}

export function BuildMenu({ resources, onPick }: Props) {
  return (
    <nav className="build-menu" aria-label="Build menu">
      {BUILDING_ORDER.map((type) => {
        const def = BUILDINGS[type];
        const affordable = canAfford(resources, def.cost);
        return (
          <button
            key={type}
            className={`build-card ${affordable ? '' : 'build-card--locked'}`}
            onClick={() => onPick(type)}
            aria-disabled={!affordable}
            title={def.description}
          >
            <span className="build-card__art">
              <BuildingIcon type={type} />
            </span>
            <span className="build-card__name">{def.name}</span>
            <span className="build-card__size">
              {def.width}×{def.depth}
            </span>
            <span className="build-card__cost">
              {RESOURCE_TYPES.filter((r) => def.cost[r] > 0).map((r) => (
                <span key={r} className={resources[r] < def.cost[r] ? 'short' : ''}>
                  <ResourceIcon type={r} size={13} />
                  {def.cost[r]}
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
