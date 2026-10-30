import type { ResourceType, Resources } from './types';

export const RESOURCE_TYPES: ResourceType[] = ['wood', 'stone', 'magic'];

export const emptyResources = (): Resources => ({ wood: 0, stone: 0, magic: 0 });

export function canAfford(have: Resources, cost: Resources): boolean {
  return RESOURCE_TYPES.every((r) => have[r] >= cost[r]);
}

export function subtract(have: Resources, cost: Resources): Resources {
  return { wood: have.wood - cost.wood, stone: have.stone - cost.stone, magic: have.magic - cost.magic };
}

export function add(a: Resources, b: Partial<Resources>): Resources {
  return { wood: a.wood + (b.wood ?? 0), stone: a.stone + (b.stone ?? 0), magic: a.magic + (b.magic ?? 0) };
}

export function scale(r: Resources, factor: number): Resources {
  return {
    wood: Math.floor(r.wood * factor),
    stone: Math.floor(r.stone * factor),
    magic: Math.floor(r.magic * factor),
  };
}

/** Which resources are short, and by how much. Useful for UI hints. */
export function shortfall(have: Resources, cost: Resources): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const r of RESOURCE_TYPES) if (have[r] < cost[r]) out[r] = cost[r] - have[r];
  return out;
}
