/**
 * Pure rules for drawing artwork that is larger than its logical footprint: depth bands,
 * texture level-of-detail, zoom limits, pixel hit-testing and tap resolution. No Phaser here,
 * so all of it is unit-tested.
 */
import { SOURCE_SCALE, type GridRect, type SpriteGeometry } from '../assets/spec';
import { footprintDepth } from './iso';

/** Depth band for buildings' ground layers: above terrain details (-900), below the build grid (-500). */
export const GROUND_DECAL_DEPTH = -800;

/**
 * Ground layers (gardens, paths, shadows) all sit in one band beneath every upright building,
 * so overhanging decoration never covers a neighbour. Within the band they keep painter order.
 */
export function groundDecalDepth(x: number, y: number, w: number, d: number): number {
  return GROUND_DECAL_DEPTH + footprintDepth(x, y, w, d) / 1000;
}

/** Downsampled texture levels kept for each sprite (1 = full resolution). */
export const LOD_FACTORS = [1, 2, 4] as const;
export type LodFactor = (typeof LOD_FACTORS)[number];

/**
 * Picks the smallest texture that is still not upscaled on screen.
 * `devicePxPerWorldPx` is the camera zoom including devicePixelRatio. Sources hold
 * SOURCE_SCALE px per world px, so a texture downsampled by f shows (zoom * f / SOURCE_SCALE)
 * device px per texel; keep that <= 1. Avoids the shimmer of minifying 4x art without mipmaps.
 */
export function chooseLod(devicePxPerWorldPx: number): LodFactor {
  let best: LodFactor = 1;
  for (const f of LOD_FACTORS) if ((devicePxPerWorldPx * f) / SOURCE_SCALE <= 1 + 1e-6) best = f;
  return best;
}

export const BASE_MIN_ZOOM = 0.45;
export const BASE_MAX_ZOOM = 2.4;

/**
 * Max user zoom. With painted art loaded, stop where one source pixel reaches one device
 * pixel (SOURCE_SCALE / dpr) so phones never show blurry upscaled sprites.
 */
export function maxZoomFor(dpr: number, hasArt: boolean): number {
  if (!hasArt) return BASE_MAX_ZOOM;
  return Math.max(1, Math.min(BASE_MAX_ZOOM, SOURCE_SCALE / Math.max(1, dpr)));
}

/**
 * Source pixel of a sprite under a world point. `spriteWorld` is where the sprite's anchor
 * (logical footprint centre) is in the world; `flipX` mirrors the lookup like the renderer does.
 * Returns null when the point is outside the canvas.
 */
export function spritePixelAt(
  world: { x: number; y: number },
  spriteWorld: { x: number; y: number },
  g: SpriteGeometry,
  flipX: boolean,
): { x: number; y: number } | null {
  const dx = (world.x - spriteWorld.x) * SOURCE_SCALE;
  const dy = (world.y - spriteWorld.y) * SOURCE_SCALE;
  const x = Math.floor(flipX ? g.anchor.x - dx : g.anchor.x + dx);
  const y = Math.floor(g.anchor.y + dy);
  if (x < 0 || y < 0 || x >= g.canvas.width || y >= g.canvas.height) return null;
  return { x, y };
}

/** Alpha above which a pixel counts as "the building" for taps. */
export const HIT_ALPHA = 64;

/**
 * What a tap selects, in priority order:
 *  1. the front-most building whose upright artwork is under the finger;
 *  2. the building that logically occupies the tapped tile;
 *  3. a building whose ground layer (garden/path) is under the finger.
 * Decorative overhang therefore never steals a tap from the building that owns the tile.
 */
export function resolveTap(hits: { upright?: string; tile?: string; ground?: string }): string | null {
  return hits.upright ?? hits.tile ?? hits.ground ?? null;
}

/**
 * Visual footprint of a drawn sprite in grid space, relative to the building's logical top
 * corner. Mirroring an isometric image swaps grid x and y.
 */
export function drawnVisualRect(g: SpriteGeometry, flipX: boolean): GridRect {
  const v = g.visual;
  return flipX ? { x: v.y, y: v.x, w: v.d, d: v.w } : { ...v };
}
