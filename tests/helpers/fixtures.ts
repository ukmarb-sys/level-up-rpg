import { manifestByKey } from '../../src/assets/manifest';
import { diamondCorners } from '../../src/assets/spec';
import { encodePng, inPoly } from './png';

/**
 * A correctly aligned synthetic object sprite: a solid footprint diamond plus a block rising
 * from it. Geometry-only stand-in used to exercise the validator and loader.
 */
export function alignedObjectPng(key: string, opts: { mirror?: boolean; shiftY?: number } = {}) {
  const e = manifestByKey.get(key)!;
  const { width: W, height: H } = e.geometry.canvas;
  const c = diamondCorners(e.geometry);
  const poly = [c.top, c.right, c.bottom, c.left];
  const shift = opts.shiftY ?? 0;
  return encodePng(W, H, (x0, y0) => {
    const x = opts.mirror ? W - 1 - x0 : x0;
    const y = y0 - shift;
    if (inPoly(x, y, poly)) return [90, 140, 80, 255];
    if (x > c.left.x + 40 && x < c.right.x - 40 && y > 60 && y < c.top.y + 40) return [200, 180, 140, 255];
    return null;
  });
}

export function alignedTilePng() {
  const W = 256;
  const H = 128;
  const poly = [
    { x: 128, y: -0.5 },
    { x: 256.5, y: 64 },
    { x: 128, y: 128.5 },
    { x: -0.5, y: 64 },
  ];
  return encodePng(W, H, (x, y) => (inPoly(x + 0.5, y + 0.5, poly) ? [80, 150, 70, 255] : null));
}
