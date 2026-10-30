import { useEffect, useRef, useState } from 'react';
import { productionRate } from '../core/game';
import { RESOURCE_TYPES } from '../core/resources';
import type { GameState, ResourceType } from '../core/types';
import { ResourceIcon } from './icons';

const LABEL: Record<ResourceType, string> = { wood: 'Wood', stone: 'Stone', magic: 'Magic' };

function ResourcePill({ type, value, rate }: { type: ResourceType; value: number; rate: number }) {
  const prev = useRef(value);
  const [pulse, setPulse] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (value === prev.current) return;
    setPulse(value > prev.current ? 'up' : 'down');
    prev.current = value;
    const t = setTimeout(() => setPulse(null), 450);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div className={`pill pill--${type} ${pulse ? `pill--${pulse}` : ''}`} aria-label={`${LABEL[type]}: ${value}`}>
      <ResourceIcon type={type} />
      <span className="pill__value">{value}</span>
      {rate > 0 && <span className="pill__rate">+{rate}/m</span>}
    </div>
  );
}

export function ResourceBar({ state }: { state: GameState }) {
  const rate = productionRate(state);
  return (
    <div className="resource-bar" role="status">
      {RESOURCE_TYPES.map((r) => (
        <ResourcePill key={r} type={r} value={state.resources[r]} rate={rate[r]} />
      ))}
    </div>
  );
}
