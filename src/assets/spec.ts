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

/** Axis-aligned rectangle in grid tiles, relative to the logical footprint's top corner. */
export interface GridRect {
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface SpriteGeometry {
  /** Logical footprint in tiles for the orientation the image depicts (collision/gameplay). */
  footprint: { w: number; d: number };
  /**
   * Ground area the artwork paints (garden, path, shadow), in tiles relative to the logical
   * footprint's top corner. Equals the logical footprint unless the art overhangs it.
   */
  visual: GridRect;
  /** Exact canvas size in source pixels. */
  canvas: { width: number; height: number };
  /** Source-pixel position of the centre of the LOGICAL footprint diamond at ground level. */
  anchor: { x: number; y: number };
  /** Source-pixel size of the VISUAL footprint diamond (what the art spans). */
  diamond: { width: number; height: number };
}

/** Footprint diamond size in source px. Width/height depend only on w + d, so all rotations share it. */
export function diamondSize(w: number, d: number) {
  return { width: (w + d) * (SRC_TILE_W / 2), height: (w + d) * (SRC_TILE_H / 2) };
}

/**
 * Canvas for an object (building/prop) sprite. The VISUAL footprint diamond touches the PAD
 * margins left, right and bottom; the anchor is the ground centre of the LOGICAL footprint, so
 * the sprite stays registered to the tiles the building occupies however far the art overhangs.
 */
export function objectGeometry(w: number, d: number, height: number, visual: GridRect = { x: 0, y: 0, w, d }): SpriteGeometry {
  const diamond = diamondSize(visual.w, visual.d);
  const width = diamond.width + PAD * 2;
  const tw = SRC_TILE_W / 2;
  const th = SRC_TILE_H / 2;
  // Source position of the logical footprint's top corner (grid 0,0): the visual diamond's left
  // corner, grid (vx, vy + vd), sits at x = PAD; its front corner, grid (vx + vw, vy + vd), at H - PAD.
  const ox = PAD - (visual.x - visual.y - visual.d) * tw;
  const oy = height - PAD - (visual.x + visual.w + visual.y + visual.d) * th;
  return {
    footprint: { w, d },
    visual: { ...visual },
    canvas: { width, height },
    anchor: { x: ox + ((w - d) * tw) / 2, y: oy + ((w + d) * th) / 2 },
    diamond,
  };
}

/** Terrain tiles are exactly one diamond with no padding so neighbours meet edge to edge. */
export function tileGeometry(): SpriteGeometry {
  return {
    footprint: { w: 1, d: 1 },
    visual: { x: 0, y: 0, w: 1, d: 1 },
    canvas: { width: SRC_TILE_W, height: SRC_TILE_H },
    anchor: { x: SRC_TILE_W / 2, y: SRC_TILE_H / 2 },
    diamond: { width: SRC_TILE_W, height: SRC_TILE_H },
  };
}

/** Source-px position of grid point (gx, gy), relative to the logical footprint's top corner. */
export function gridToSource(g: SpriteGeometry, gx: number, gy: number) {
  const tw = SRC_TILE_W / 2;
  const th = SRC_TILE_H / 2;
  const { w, d } = g.footprint;
  const ox = g.anchor.x - ((w - d) * tw) / 2;
  const oy = g.anchor.y - ((w + d) * th) / 2;
  return { x: ox + (gx - gy) * tw, y: oy + (gx + gy) * th };
}

function rectCorners(g: SpriteGeometry, r: GridRect) {
  return {
    top: gridToSource(g, r.x, r.y),
    right: gridToSource(g, r.x + r.w, r.y),
    bottom: gridToSource(g, r.x + r.w, r.y + r.d),
    left: gridToSource(g, r.x, r.y + r.d),
  };
}

/** Corners of the VISUAL footprint diamond (what the artwork spans): top, right, bottom (front), left. */
export function diamondCorners(g: SpriteGeometry) {
  return { ...rectCorners(g, g.visual), halfWidth: g.diamond.width / 2 };
}

/** Corners of the LOGICAL footprint diamond (the tiles the building occupies). */
export function logicalCorners(g: SpriteGeometry) {
  return rectCorners(g, { x: 0, y: 0, w: g.footprint.w, d: g.footprint.d });
}

/** True when the art paints outside its logical footprint. */
export function overhangs(g: SpriteGeometry): boolean {
  const v = g.visual;
  return v.x !== 0 || v.y !== 0 || v.w !== g.footprint.w || v.d !== g.footprint.d;
}
