/**
 * Decides which image (if any) to draw for something, given which textures actually loaded.
 * Pure so fallback behaviour is unit-tested.
 */
import type { BuildingType, Rotation } from '../core/types';
import { ART_EXTENSIONS, buildingKey, manifestByFile, type AssetEntry } from './manifest';
import { SOURCE_SCALE } from './spec';

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

/**
 * Converts a sprite-space point (source px, same space as the anchor) to world px relative to
 * the sprite's anchor, mirroring it when the image is drawn flipped.
 */
export function effectPoint(e: AssetEntry, p: { x: number; y: number }, flipX: boolean) {
  const dx = (p.x - e.geometry.anchor.x) / SOURCE_SCALE;
  return { x: flipX ? -dx : dx, y: (p.y - e.geometry.anchor.y) / SOURCE_SCALE };
}

/** Picks a terrain variant key that loaded, cycling through those available. */
export function resolveTerrainKey(variant: number, available: string[]): string | null {
  if (available.length === 0) return null;
  return available[variant % available.length];
}

/**
 * Maps files found on disk/in the bundle (paths ending in "<file>.<ext>") to manifest keys.
 * Matching is case-sensitive, exactly like the game's import.meta.glob('**\/*.{webp,png}'):
 * "cottage_r0.PNG" or "magetower_r0.png" are NOT loaded and are reported as unknown.
 * Prefers WebP over PNG when both exist.
 */
export function matchArtFiles(paths: string[]): { found: Map<string, string>; unknown: string[] } {
  const found = new Map<string, string>();
  const rank = new Map<string, number>();
  const unknown: string[] = [];
  for (const p of paths) {
    const m = /(?:^|\/)art\/(.+)\.([^./]+)$/.exec(p.replace(/\\/g, '/'));
    const entry = m && manifestByFile.get(m[1]);
    const r = m ? ART_EXTENSIONS.indexOf(m[2] as (typeof ART_EXTENSIONS)[number]) : -1;
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

/** Explains why a file in the art folder is not picked up, with the fix. */
export function explainUnknownFile(path: string): string {
  const m = /(?:^|\/)art\/(.+)\.([^./]+)$/.exec(path.replace(/\\/g, '/'));
  if (!m) return 'File has no extension; use .webp or .png';
  const [, file, ext] = m;
  const lower = ext.toLowerCase();
  if (lower === 'jpg' || lower === 'jpeg') return 'JPEG has no transparency; export a PNG with alpha (then optionally WebP)';
  const known = ART_EXTENSIONS.includes(lower as (typeof ART_EXTENSIONS)[number]);
  if (known && ext !== lower) {
    const fixed = manifestByFile.has(file) ? `${file}.${lower}` : `<correct name>.${lower}`;
    return `Extension must be lowercase ".${lower}" — the game only loads lowercase .webp/.png. Rename to ${fixed}`;
  }
  if (!known) return `Unsupported extension ".${ext}"; use .webp or .png`;
  const caseMatch = [...manifestByFile.keys()].find((f) => f.toLowerCase() === file.toLowerCase());
  if (caseMatch) return `Wrong letter case — paths are case-sensitive. Rename to ${caseMatch}.${ext}`;
  const base = file.split('/').pop()!.toLowerCase();
  const sameName = [...manifestByFile.keys()].find((f) => f.split('/').pop()!.toLowerCase() === base);
  if (sameName) return `Wrong folder. Move to ${sameName}.${ext}`;
  return 'Not in the asset manifest (check folder, filename and rotation suffix _r0–_r3)';
}
