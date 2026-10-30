/**
 * Decorative scenery placed on a ring of tiles *outside* the buildable 20x20 grid, so it never
 * affects placement or collisions. Deterministic so the island looks the same every visit.
 */
import { PROPS, type PropType } from '../assets/manifest';
import { hash2 } from './noise';

export interface PropPlacement {
  type: PropType;
  /** Grid coordinates of the 1x1 cell (may be negative or >= mapSize). */
  x: number;
  y: number;
  variant: number;
}

/** Width of the decorative ring around the playable grid, in tiles. */
export const SCENERY_RING = 2;

export function isInsideGrid(x: number, y: number, mapSize: number) {
  return x >= 0 && y >= 0 && x < mapSize && y < mapSize;
}

/**
 * Back edges (x < 0 or y < 0, far from the camera) get dense forest; the front edges only get
 * low props so nothing tall hides buildings. The left/right corners host ancient ruins.
 */
export function layoutProps(mapSize: number, ring = SCENERY_RING): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (let y = -ring; y < mapSize + ring; y++) {
    for (let x = -ring; x < mapSize + ring; x++) {
      if (isInsideGrid(x, y, mapSize)) continue;
      const h = hash2(x, y, 11);
      const variant = Math.floor(hash2(x, y, 5) * 3);
      const front = x >= mapSize || y >= mapSize;
      const sideCorner = (x < 0 && y >= mapSize - 3) || (y < 0 && x >= mapSize - 3);
      let type: PropType | null = null;
      if (sideCorner) {
        type = h < 0.35 ? 'ruinPillar' : h < 0.55 ? 'treeEnchanted' : h < 0.75 ? 'crystalCluster' : null;
      } else if (front) {
        type = h < 0.12 ? 'rockMossy' : h < 0.2 ? 'crystalCluster' : null;
      } else {
        type = h < 0.38 ? 'treePine' : h < 0.66 ? 'treeOak' : h < 0.74 ? 'treeEnchanted' : h < 0.82 ? 'rockMossy' : null;
      }
      if (type && front && PROPS[type].tall && !sideCorner) type = null;
      if (type) out.push({ type, x, y, variant });
    }
  }
  return out;
}
