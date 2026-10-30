import { BUILDINGS } from './buildings';
import type { Building, BuildingType, GridPos, Rotation } from './types';

export interface Footprint {
  x: number;
  y: number;
  w: number;
  d: number;
}

export function footprintSize(type: BuildingType, rotation: Rotation): { w: number; d: number } {
  const def = BUILDINGS[type];
  return rotation % 2 === 0 ? { w: def.width, d: def.depth } : { w: def.depth, d: def.width };
}

export function footprintOf(type: BuildingType, pos: GridPos, rotation: Rotation): Footprint {
  return { x: pos.x, y: pos.y, ...footprintSize(type, rotation) };
}

export function buildingFootprint(b: Building): Footprint {
  return footprintOf(b.type, b, b.rotation);
}

export function inBounds(f: Footprint, mapSize: number): boolean {
  return f.x >= 0 && f.y >= 0 && f.x + f.w <= mapSize && f.y + f.d <= mapSize;
}

export function overlaps(a: Footprint, b: Footprint): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
}

/** Returns the first building colliding with the footprint, ignoring `ignoreId` (used when relocating). */
export function findCollision(f: Footprint, buildings: Building[], ignoreId?: string): Building | undefined {
  return buildings.find((b) => b.id !== ignoreId && overlaps(f, buildingFootprint(b)));
}

export type PlacementCheck = { valid: true } | { valid: false; reason: 'out-of-bounds' | 'collision' };

export function checkPlacement(
  type: BuildingType,
  pos: GridPos,
  rotation: Rotation,
  buildings: Building[],
  mapSize: number,
  ignoreId?: string,
): PlacementCheck {
  const f = footprintOf(type, pos, rotation);
  if (!inBounds(f, mapSize)) return { valid: false, reason: 'out-of-bounds' };
  if (findCollision(f, buildings, ignoreId)) return { valid: false, reason: 'collision' };
  return { valid: true };
}

/** Clamp a position so the footprint stays on the map (keeps ghost previews on-screen). */
export function clampToMap(type: BuildingType, pos: GridPos, rotation: Rotation, mapSize: number): GridPos {
  const { w, d } = footprintSize(type, rotation);
  return {
    x: Math.max(0, Math.min(mapSize - w, Math.round(pos.x))),
    y: Math.max(0, Math.min(mapSize - d, Math.round(pos.y))),
  };
}

export function buildingAt(pos: GridPos, buildings: Building[]): Building | undefined {
  return findCollision({ x: pos.x, y: pos.y, w: 1, d: 1 }, buildings);
}

export const nextRotation = (r: Rotation): Rotation => ((r + 1) % 4) as Rotation;

/** Nearest valid spot to `from` (by ring distance), or null if the map is full for this footprint. */
export function findNearestFree(
  type: BuildingType,
  rotation: Rotation,
  from: GridPos,
  buildings: Building[],
  mapSize: number,
  ignoreId?: string,
  maxRadius = mapSize,
): GridPos | null {
  const start = clampToMap(type, from, rotation, mapSize);
  for (let r = 0; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const p = { x: start.x + dx, y: start.y + dy };
        if (checkPlacement(type, p, rotation, buildings, mapSize, ignoreId).valid) return p;
      }
    }
  }
  return null;
}
