/**
 * Decorative scenery placed on a ring of tiles *outside* the buildable grid, so it never affects
 * placement or collisions. Deterministic so the island looks the same on every visit.
 *
 * Readability rule: a prop may only cover buildable tiles if its silhouette, projected onto the
 * ground, falls inside the grid. Props at x < 0 or y < 0 (the back edges and side corners) rise
 * *away* from the grid on screen, so tall trees live there; the front edges (towards the camera,
 * the HUD and the build menu) only get low undergrowth. tests/environment.test.ts verifies this
 * geometrically for every placement.
 */
import { PROPS, type PropType } from '../assets/manifest';
import { hash2 } from './noise';

export interface PropPlacement {
  type: PropType;
  /** Grid coordinates of the 1x1 cell (may be negative or >= mapSize). */
  x: number;
  y: number;
  /** Offset from the cell centre in grid units (-0.5..0.5). */
  ox: number;
  oy: number;
  variant: number;
  scale: number;
  flip: boolean;
}

/** Width of the decorative ring around the playable grid, in tiles. */
export const SCENERY_RING = 3;

/** Silhouette of the procedural props in world px (half width at the widest point, height). */
export const PROP_SIZE: Record<PropType, { hw: number; h: number }> = {
  treePine: { hw: 22, h: 72 },
  treeSpruce: { hw: 17, h: 88 },
  treeFir: { hw: 26, h: 66 },
  treeOak: { hw: 28, h: 62 },
  treeEnchanted: { hw: 26, h: 62 },
  treeMystic: { hw: 30, h: 66 },
  bushFern: { hw: 16, h: 14 },
  glowShroom: { hw: 10, h: 12 },
  glowBloom: { hw: 11, h: 16 },
  rockMossy: { hw: 16, h: 16 },
  rockSmall: { hw: 11, h: 9 },
  ruinPillar: { hw: 11, h: 56 },
  standingStone: { hw: 10, h: 46 },
  crystalCluster: { hw: 12, h: 26 },
};

export function isInsideGrid(x: number, y: number, mapSize: number) {
  return x >= 0 && y >= 0 && x < mapSize && y < mapSize;
}

/** How many tiles a ring cell lies outside the grid (1 = touching it). */
export function ringDepth(x: number, y: number, mapSize: number) {
  return Math.max(-x, -y, x - (mapSize - 1), y - (mapSize - 1), 0);
}

type Weighted = [PropType, number][];

function pick(table: Weighted, h: number): PropType | null {
  let acc = 0;
  for (const [type, p] of table) {
    acc += p;
    if (h < acc) return type;
  }
  return null;
}

// Back edges: undergrowth next to the grid, layered forest behind it.
const BACK_EDGE: Weighted = [
  ['bushFern', 0.3],
  ['glowShroom', 0.1],
  ['glowBloom', 0.1],
  ['rockSmall', 0.08],
  ['treeFir', 0.1],
  ['treePine', 0.08],
];
const FOREST: Weighted = [
  ['treePine', 0.2],
  ['treeSpruce', 0.2],
  ['treeFir', 0.16],
  ['treeOak', 0.1],
  ['treeMystic', 0.1],
  ['treeEnchanted', 0.06],
  ['rockMossy', 0.04],
  ['bushFern', 0.08],
];
// Left/right corners: the 30% "ancient mystery".
const ANCIENT: Weighted = [
  ['ruinPillar', 0.18],
  ['standingStone', 0.14],
  ['treeMystic', 0.2],
  ['crystalCluster', 0.12],
  ['glowBloom', 0.1],
  ['bushFern', 0.1],
];
// Front edges: low and sparse so nothing hides buildings, touch targets or the build menu.
const FRONT_NEAR: Weighted = [
  ['bushFern', 0.16],
  ['glowBloom', 0.08],
  ['rockSmall', 0.1],
  ['glowShroom', 0.05],
];
const FRONT_FAR: Weighted = [
  ['rockMossy', 0.12],
  ['bushFern', 0.2],
  ['rockSmall', 0.1],
  ['glowBloom', 0.06],
  ['crystalCluster', 0.04],
];

export function layoutProps(mapSize: number, ring = SCENERY_RING): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (let y = -ring; y < mapSize + ring; y++) {
    for (let x = -ring; x < mapSize + ring; x++) {
      if (isInsideGrid(x, y, mapSize)) continue;
      const depth = ringDepth(x, y, mapSize);
      const back = x < 0 || y < 0;
      const sideCorner = (x < 0 && y >= mapSize - 3) || (y < 0 && x >= mapSize - 3);
      const table = sideCorner ? ANCIENT : back ? (depth === 1 ? BACK_EDGE : FOREST) : depth === 1 ? FRONT_NEAR : FRONT_FAR;
      // Deep forest gets a second tree per cell for a layered, dense canopy.
      const layers = back && !sideCorner && depth >= 2 ? 2 : 1;
      for (let layer = 0; layer < layers; layer++) {
        const s = layer * 17;
        let type = pick(table, hash2(x, y, 11 + s));
        if (!type) continue;
        if (!back && PROPS[type].tall) type = null; // never tall at the front
        if (!type) continue;
        // Offsets push props *away* from the grid on the axes where the cell lies outside it.
        const jx = (hash2(x, y, 51 + s) - 0.5) * 0.6;
        const jy = (hash2(x, y, 52 + s) - 0.5) * 0.6;
        const away = (v: number, j: number) => (v < 0 ? -Math.abs(j) : v >= mapSize ? Math.abs(j) : j);
        out.push({
          type,
          x,
          y,
          ox: away(x, jx),
          oy: away(y, jy),
          variant: Math.floor(hash2(x, y, 5 + s) * 3),
          scale: 0.85 + hash2(x, y, 54 + s) * 0.3,
          flip: hash2(x, y, 53 + s) > 0.5,
        });
      }
    }
  }
  return out;
}
