import { useEffect, useRef, useState } from 'react';
import { productionRate } from '../core/game';
import { RESOURCE_TYPES } from '../core/resources';
import type { GameState, ResourceType } from '../core/types';
import { ResourceIcon } from './icons';

const LABEL: Record<ResourceType, string> = { wood: 'Wood', stone: 'Stone', magic: 'Magic' };

interface Delta {
  id: number;
  amount: number;
}

function ResourceCell({ type, value, rate }: { type: ResourceType; value: number; rate: number }) {
  const prev = useRef(value);
  const seq = useRef(0);
  const [delta, setDelta] = useState<Delta | null>(null);
  useEffect(() => {
    const amount = value - prev.current;
    prev.current = value;
    if (amount === 0) return;
    setDelta({ id: ++seq.current, amount });
    const t = setTimeout(() => setDelta(null), 1100);
    return () => clearTimeout(t);
  }, [value]);

  const title = `${LABEL[type]}: ${value}${rate ? ` (+${rate} per minute)` : ''}`;
  return (
    <div className={`res res--${type}`} title={title} aria-label={title}>
      <ResourceIcon type={type} size={18} />
      <span className="res__value">{value}</span>
      {rate > 0 && <span className="res__rate">+{rate}/m</span>}
      {delta && (
        <span key={delta.id} className={`res__delta ${delta.amount > 0 ? 'up' : 'down'}`} aria-hidden>
          {delta.amount > 0 ? `+${delta.amount}` : delta.amount}
        </span>
      )}
    </div>
  );
}

/** One compact glass strip so the map stays visible on small phones. */
export function ResourceBar({ state }: { state: GameState }) {
  const rate = productionRate(state);
  return (
    <div className="resource-bar" role="status">
      {RESOURCE_TYPES.map((r) => (
        <ResourceCell key={r} type={r} value={state.resources[r]} rate={rate[r]} />
      ))}
    </div>
  );
}
