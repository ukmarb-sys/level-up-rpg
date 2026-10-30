/**
 * Geometry contract between artwork and the renderer. See docs/ASSET_SPEC.md.
 *
 * All sprites are drawn for the game's 2:1 isometric projection (one tile = 64x32 world px)
 * at SOURCE_SCALE source pixels per world pixel, and displayed at 1 / SOURCE_SCALE.
 * Pure data and math only, so the validation script and tests share it with the game.
 */

/** Source pixels per world pixel. Art is authored 4x for crisp results on high-DPI phones. */
export const SOURCE_SCALE = 4;
/** World tile size (must match src/game/iso.ts). */
export const WORLD_TILE_W = 64;
export const WORLD_TILE_H = 32;
/** Source-pixel size of one tile diamond. */
export const SRC_TILE_W = WORLD_TILE_W * SOURCE_SCALE; // 256
export const SRC_TILE_H = WORLD_TILE_H * SOURCE_SCALE; // 128
/** Transparent margin kept on the left, right and bottom of object sprites. */
export const PAD = 32;
/** Allowed overshoot (source px) of opaque pixels below the footprint's front corner, e.g. soft shadows. */
export const GROUND_TOLERANCE = 24;

export interface SpriteGeometry {
  /** Footprint in tiles for the orientation the image depicts. */
  footprint: { w: number; d: number };
  /** Exact canvas size in source pixels. */
  canvas: { width: number; height: number };
  /** Source-pixel position of the centre of the footprint diamond at ground level. */
  anchor: { x: number; y: number };
  /** Source-pixel size of the footprint diamond. */
  diamond: { width: number; height: number };
}

/** Footprint diamond size in source px. Width/height depend only on w + d, so all rotations share it. */
export function diamondSize(w: number, d: number) {
  return { width: (w + d) * (SRC_TILE_W / 2), height: (w + d) * (SRC_TILE_H / 2) };
}

/**
 * Canvas for an object (building/prop) sprite: the footprint diamond centred horizontally,
 * PAD px from the left/right/bottom edges, with `height` px of total canvas height.
 */
export function objectGeometry(w: number, d: number, height: number): SpriteGeometry {
  const diamond = diamondSize(w, d);
  const width = diamond.width + PAD * 2;
  return {
    footprint: { w, d },
    canvas: { width, height },
    anchor: { x: width / 2, y: height - PAD - diamond.height / 2 },
    diamond,
  };
}

/** Terrain tiles are exactly one diamond with no padding so neighbours meet edge to edge. */
export function tileGeometry(): SpriteGeometry {
  return {
    footprint: { w: 1, d: 1 },
    canvas: { width: SRC_TILE_W, height: SRC_TILE_H },
    anchor: { x: SRC_TILE_W / 2, y: SRC_TILE_H / 2 },
    diamond: { width: SRC_TILE_W, height: SRC_TILE_H },
  };
}

/** Ground-plane corners of the footprint diamond in source px: top, right, bottom (front), left. */
export function diamondCorners(g: SpriteGeometry) {
  const { x, y } = g.anchor;
  const hw = g.diamond.width / 2;
  const hh = g.diamond.height / 2;
  // The diamond of a w x d footprint is not symmetric vertically around its side corners
  // unless w == d, so compute the true corners from the footprint.
  const { w, d } = g.footprint;
  const tw = SRC_TILE_W / 2;
  const th = SRC_TILE_H / 2;
  const top = { x: x - ((w - d) * tw) / 2, y: y - hh };
  return {
    top,
    right: { x: top.x + w * tw, y: top.y + w * th },
    bottom: { x: top.x + (w - d) * tw, y: top.y + (w + d) * th },
    left: { x: top.x - d * tw, y: top.y + d * th },
    halfWidth: hw,
  };
}
