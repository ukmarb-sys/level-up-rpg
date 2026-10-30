/**
 * Decides which image (if any) to draw for something, given which textures actually loaded.
 * Pure so fallback behaviour is unit-tested.
 */
import type { BuildingType, Rotation } from '../core/types';
import { ART_EXTENSIONS, buildingKey, manifestByFile } from './manifest';

export interface SpriteChoice {
  key: string;
  /**
   * Mirror horizontally. Mirroring an isometric image swaps its footprint's width and depth,
   * so an r0 image can stand in for odd rotations (and r1 for r2/r0, etc.).
   */
  flipX: boolean;
}

/**
 * Resolution order for a building at `rotation`:
 * 1. the exact rotation image;
 * 2. the image of the opposite rotation (same footprint; shows the back as the front);
 * 3. a mirrored image of an adjacent rotation (footprint swaps, which is what a quarter turn does);
 * 4. null -> caller draws the procedural fallback.
 */
export function resolveBuildingSprite(
  type: BuildingType,
  rotation: Rotation,
  has: (key: string) => boolean,
): SpriteChoice | null {
  const r = (n: number) => buildingKey(type, ((n % 4) + 4) % 4 as Rotation);
  const candidates: SpriteChoice[] = [
    { key: r(rotation), flipX: false },
    { key: r(rotation + 2), flipX: false },
    { key: r(rotation + 3), flipX: true },
    { key: r(rotation + 1), flipX: true },
  ];
  return candidates.find((c) => has(c.key)) ?? null;
}

/** Picks a terrain variant key that loaded, cycling through those available. */
export function resolveTerrainKey(variant: number, available: string[]): string | null {
  if (available.length === 0) return null;
  return available[variant % available.length];
}

/**
 * Maps files found on disk/in the bundle (paths ending in "<file>.<ext>") to manifest keys.
 * Prefers WebP over PNG when both exist. Unknown files are returned separately.
 */
export function matchArtFiles(paths: string[]): { found: Map<string, string>; unknown: string[] } {
  const found = new Map<string, string>();
  const rank = new Map<string, number>();
  const unknown: string[] = [];
  for (const p of paths) {
    const m = /(?:^|\/)art\/(.+)\.([a-z0-9]+)$/i.exec(p.replace(/\\/g, '/'));
    const ext = m?.[2].toLowerCase();
    const entry = m && manifestByFile.get(m[1]);
    const r = ART_EXTENSIONS.indexOf(ext as (typeof ART_EXTENSIONS)[number]);
    if (!entry || r < 0) {
      unknown.push(p);
      continue;
    }
    if (!found.has(entry.key) || r < (rank.get(entry.key) ?? 99)) {
      found.set(entry.key, p);
      rank.set(entry.key, r);
    }
  }
  return { found, unknown };
}
