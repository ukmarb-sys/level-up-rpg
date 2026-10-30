import { manifestByKey } from '../../src/assets/manifest';
import { diamondCorners } from '../../src/assets/spec';
import { encodePng, inPoly } from '../../scripts/lib/png';

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

export interface FakeRenderOptions {
  footprint: { w: number; d: number };
  /** Pixels per tile-width unit (the "AI" picks an arbitrary scale). */
  tile?: number;
  canvas?: { width: number; height: number };
  offset?: { x: number; y: number };
  background?: 'transparent' | 'white' | 'checker';
  mirror?: boolean;
  wallHeight?: number;
  orb?: boolean;
  specks?: boolean;
}

/**
 * Mimics raw generator output: an isometric building of the given footprint drawn at an
 * arbitrary size/position on a large canvas, optionally on a fake background, with warm
 * windows and noise specks. Synthetic geometry for tests only — not artwork.
 */
export function fakeAiRender(o: FakeRenderOptions): { width: number; height: number; data: Uint8Array } {
  const { w, d } = o.footprint;
  const T = o.tile ?? 300; // tile diamond width in px
  const W = o.canvas?.width ?? 1024;
  const H = o.canvas?.height ?? 1024;
  const wall = o.wallHeight ?? T * 0.45;
  const ox = W / 2 + (o.offset?.x ?? 0);
  const groundFront = H * 0.8 + (o.offset?.y ?? 0);
  // ground-plane point of grid (gx, gy) with the front corner (w, d) at (ox + (w-d)*T/4 ... ) centred
  const cx = ox;
  const cy = groundFront - ((w + d) * T) / 4;
  const P = (gx: number, gy: number, z = 0) => ({ x: cx + (gx - w / 2 - (gy - d / 2)) * (T / 2), y: cy + (gx - w / 2 + (gy - d / 2)) * (T / 4) - z });
  const ground = [P(0, 0), P(w, 0), P(w, d), P(0, d)];
  const inset = 0.15;
  const base = [P(inset, inset), P(w - inset, inset), P(w - inset, d - inset), P(inset, d - inset)];
  const leftWall = [P(inset, d - inset), P(w - inset, d - inset), P(w - inset, d - inset, wall), P(inset, d - inset, wall)];
  const rightWall = [P(w - inset, inset), P(w - inset, d - inset), P(w - inset, d - inset, wall), P(w - inset, inset, wall)];
  const roof = base.map((p) => ({ x: p.x, y: p.y - wall }));
  const apex = P(w / 2, d / 2, wall + T * 0.35);
  const win = P(w * 0.5, d - inset, wall * 0.45);
  const winR = T * 0.05;
  const orbC = P(w / 2, d / 2, wall + T * 0.6);
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x0 = 0; x0 < W; x0++) {
      const x = o.mirror ? W - 1 - x0 : x0;
      let c: [number, number, number, number] | null = null;
      if (inPoly(x, y, ground)) c = [96, 128, 70, 255];
      if (inPoly(x, y, base)) c = [120, 110, 100, 255];
      if (inPoly(x, y, leftWall)) c = [205, 180, 140, 255];
      if (inPoly(x, y, rightWall)) c = [160, 135, 100, 255];
      if (inPoly(x, y, [roof[0], roof[1], apex]) || inPoly(x, y, [roof[1], roof[2], apex]) || inPoly(x, y, [roof[2], roof[3], apex]) || inPoly(x, y, [roof[3], roof[0], apex]))
        c = [150, 60, 45, 255];
      if (Math.abs(x - win.x) < winR && Math.abs(y - win.y) < winR * 1.4 && c) c = [255, 200, 100, 255];
      if (o.orb && Math.hypot(x - orbC.x, y - orbC.y) < T * 0.06) c = [235, 225, 255, 255];
      if (o.specks && (x * 7 + y * 13) % 9973 === 0) c = [30, 30, 30, 255];
      if (!c) {
        if (o.background === 'white') c = [250, 250, 250, 255];
        else if (o.background === 'checker') c = ((x >> 4) ^ (y >> 4)) & 1 ? [204, 204, 204, 255] : [255, 255, 255, 255];
      }
      if (c) data.set(c, (y * W + x0) * 4);
    }
  }
  return { width: W, height: H, data };
}

/**
 * Stand-in for an illustration whose decoration overhangs its logical tile: a 1x1 house in the
 * middle of a garden diamond that is `garden` tiles across (e.g. 2 => half a tile on every side).
 * With `split`, the garden comes back as a separate ground layer of the same size.
 * Synthetic geometry for tests only — not artwork.
 */
export function fakeCottageWithGarden(opts: { garden?: number; tile?: number; split?: boolean; background?: 'white' | 'transparent' } = {}) {
  const garden = opts.garden ?? 2;
  const T = opts.tile ?? 260;
  const W = 1200;
  const H = 1400;
  const house = fakeAiRender({ footprint: { w: 1, d: 1 }, tile: T, canvas: { width: W, height: H }, wallHeight: T * 0.5 });
  // house ground front corner is at y = H*0.8; garden front corner extends further by (garden-1)/2 tiles
  const cx = W / 2;
  const houseCy = H * 0.8 - T / 2; // centre of the 1x1 diamond (T wide, T/2 tall)
  const gw = (garden * T) / 2;
  const gh = (garden * T) / 4;
  const inGarden = (x: number, y: number) => Math.abs(x - cx) / gw + Math.abs(y - houseCy) / gh <= 1;
  const main = { width: W, height: H, data: new Uint8Array(W * H * 4) };
  const ground = { width: W, height: H, data: new Uint8Array(W * H * 4) };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const houseA = house.data[i + 3];
      // flower beds + path speckle so the garden is clearly painted
      const gardenPx: [number, number, number, number] | null = inGarden(x, y)
        ? (x * 3 + y * 5) % 37 === 0
          ? [240, 200, 90, 255]
          : [70, 130, 60, 255]
        : null;
      if (houseA) main.data.set(house.data.subarray(i, i + 4), i);
      else if (gardenPx && !opts.split) main.data.set(gardenPx, i);
      if (gardenPx && opts.split) ground.data.set(gardenPx, i);
      if (!main.data[i + 3] && opts.background === 'white') main.data.set([250, 250, 250, 255], i);
    }
  }
  return opts.split ? { main, ground } : { main };
}
