/** Isometric projection helpers (2:1 diamonds). Pure math so it can be unit-tested. */
import type { GridPos } from '../core/types';

export const TILE_W = 64;
export const TILE_H = 32;
const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** World position of grid point (gx, gy) raised by z pixels. (0,0) is the map's top corner. */
export function isoPoint(gx: number, gy: number, z = 0): { x: number; y: number } {
  return { x: (gx - gy) * HW, y: (gx + gy) * HH - z };
}

/** Continuous grid coordinates for a world position. */
export function worldToGridF(wx: number, wy: number): { x: number; y: number } {
  return { x: (wy / HH + wx / HW) / 2, y: (wy / HH - wx / HW) / 2 };
}

/** The tile containing a world position. */
export function worldToTile(wx: number, wy: number): GridPos {
  const g = worldToGridF(wx, wy);
  return { x: Math.floor(g.x), y: Math.floor(g.y) };
}

/** Painter's-algorithm depth for an axis-aligned footprint; larger is drawn later. */
export function footprintDepth(x: number, y: number, w: number, d: number): number {
  return x + w / 2 + (y + d / 2);
}
