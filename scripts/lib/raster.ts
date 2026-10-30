/**
 * Small RGBA raster toolkit for the art importer. Straight alpha in/out; resampling is done in
 * premultiplied space so transparent edges never pick up dark or coloured fringes.
 */

export interface Raster {
  width: number;
  height: number;
  /** Straight RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

export const OPAQUE = 16;

export function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export const alphaAt = (r: Raster, x: number, y: number) => r.data[(y * r.width + x) * 4 + 3];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bounding box of pixels with alpha > threshold, or null if the image is empty. */
export function opaqueBounds(r: Raster, threshold = OPAQUE): Bounds | null {
  let minX = r.width;
  let minY = r.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      if (r.data[(y * r.width + x) * 4 + 3] <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

export function countTransparent(r: Raster, threshold = OPAQUE): number {
  let n = 0;
  for (let i = 3; i < r.data.length; i += 4) if (r.data[i] <= threshold) n++;
  return n;
}

/**
 * Removes a flat or checkerboard ("fake transparency") background by flood-filling from the
 * image border through pixels close to the colours found on the border.
 * Returns the number of pixels cleared.
 */
export function keyOutBackground(r: Raster, tolerance = 28): number {
  const { width: W, height: H, data } = r;
  // Collect up to 2 dominant border colours (handles checkerboards).
  const counts = new Map<number, number>();
  const quant = (i: number) => ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
  const border: number[] = [];
  for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) border.push(y * W, y * W + W - 1);
  for (const p of border) {
    if (data[p * 4 + 3] <= OPAQUE) continue;
    const q = quant(p * 4);
    counts.set(q, (counts.get(q) ?? 0) + 1);
  }
  const keys = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (keys.length === 0) return 0;
  const total = border.length;
  const colours = keys
    .filter(([, n]) => n > total * 0.1)
    .map(([q]) => [((q >> 10) & 31) * 8 + 4, ((q >> 5) & 31) * 8 + 4, (q & 31) * 8 + 4]);
  if (colours.length === 0) return 0;
  const near = (i: number) =>
    colours.some(([cr, cg, cb]) => Math.abs(data[i] - cr) + Math.abs(data[i + 1] - cg) + Math.abs(data[i + 2] - cb) <= tolerance * 1.5);

  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  for (const p of border) {
    if (!seen[p] && (data[p * 4 + 3] <= OPAQUE || near(p * 4))) {
      seen[p] = 1;
      stack.push(p);
    }
  }
  let cleared = 0;
  while (stack.length) {
    const p = stack.pop()!;
    const i = p * 4;
    if (data[i + 3] > 0) {
      data[i + 3] = 0;
      cleared++;
    }
    const x = p % W;
    const y = (p - x) / W;
    const next = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
    for (const n of next) {
      if (n < 0 || seen[n]) continue;
      seen[n] = 1;
      if (data[n * 4 + 3] <= OPAQUE || near(n * 4)) stack.push(n);
    }
  }
  // Soften the cut edge: pixels bordering the cleared area that are still close-ish to the key get partial alpha.
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    if (data[i + 3] === 0) continue;
    const x = p % W;
    const y = (p - x) / W;
    const touches =
      (x > 0 && data[i - 1] === 0) || (x < W - 1 && data[i + 7] === 0) || (y > 0 && data[i - W * 4 + 3] === 0) || (y < H - 1 && data[i + W * 4 + 3] === 0);
    if (touches && near(i)) data[i + 3] = Math.min(data[i + 3], 128);
  }
  return cleared;
}

/**
 * Deletes tiny disconnected specks (stray pixels, generator noise) smaller than
 * max(minPixels, minFraction × largest component). Deliberately conservative so detached
 * parts of the artwork (floating orbs, sparks, smoke) survive. Returns pixels removed.
 */
export function despeckle(r: Raster, minFraction = 0.0005, minPixels = 16): number {
  const { width: W, height: H, data } = r;
  const label = new Int32Array(W * H).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let p = 0; p < W * H; p++) {
    if (label[p] >= 0 || data[p * 4 + 3] <= OPAQUE) continue;
    const id = sizes.length;
    let size = 0;
    label[p] = id;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop()!;
      size++;
      const x = q % W;
      const y = (q - x) / W;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (label[n] >= 0 || data[n * 4 + 3] <= OPAQUE) continue;
          label[n] = id;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }
  if (sizes.length <= 1) return 0;
  const keep = Math.max(minPixels, Math.max(...sizes) * minFraction);
  let removed = 0;
  for (let p = 0; p < W * H; p++) {
    if (label[p] >= 0 && sizes[label[p]] < keep) {
      data[p * 4 + 3] = 0;
      removed++;
    }
  }
  return removed;
}

export function crop(r: Raster, b: Bounds): Raster {
  const w = b.maxX - b.minX + 1;
  const h = b.maxY - b.minY + 1;
  const out = createRaster(w, h);
  for (let y = 0; y < h; y++) {
    const src = ((b.minY + y) * r.width + b.minX) * 4;
    out.data.set(r.data.subarray(src, src + w * 4), y * w * 4);
  }
  return out;
}

export function flipX(r: Raster): Raster {
  const out = createRaster(r.width, r.height);
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const s = (y * r.width + x) * 4;
      const d = (y * r.width + (r.width - 1 - x)) * 4;
      out.data.set(r.data.subarray(s, s + 4), d);
    }
  }
  return out;
}

/**
 * Resizes to (w, h). Downscaling uses exact area averaging (box filter); upscaling uses
 * bilinear interpolation. Both run on premultiplied colour.
 */
export function resize(r: Raster, w: number, h: number): Raster {
  const out = createRaster(w, h);
  const sx = r.width / w;
  const sy = r.height / h;
  const pm = new Float32Array(r.width * r.height * 4);
  for (let i = 0; i < r.data.length; i += 4) {
    const a = r.data[i + 3] / 255;
    pm[i] = r.data[i] * a;
    pm[i + 1] = r.data[i + 1] * a;
    pm[i + 2] = r.data[i + 2] * a;
    pm[i + 3] = r.data[i + 3];
  }
  const write = (o: number, c: number[]) => {
    const a = c[3];
    out.data[o + 3] = Math.round(Math.min(255, a));
    if (a > 0.5) for (let k = 0; k < 3; k++) out.data[o + k] = Math.round(Math.min(255, (c[k] * 255) / a));
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0, 0];
      if (sx >= 1 && sy >= 1) {
        const x0 = x * sx;
        const x1 = x0 + sx;
        const y0 = y * sy;
        const y1 = y0 + sy;
        let area = 0;
        for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
          const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
          for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
            const wx = Math.min(x1, xx + 1) - Math.max(x0, xx);
            const wgt = wx * wy;
            const i = (Math.min(yy, r.height - 1) * r.width + Math.min(xx, r.width - 1)) * 4;
            for (let k = 0; k < 4; k++) acc[k] += pm[i + k] * wgt;
            area += wgt;
          }
        }
        for (let k = 0; k < 4; k++) acc[k] /= area;
      } else {
        const fx = Math.max(0, Math.min(r.width - 1, (x + 0.5) * sx - 0.5));
        const fy = Math.max(0, Math.min(r.height - 1, (y + 0.5) * sy - 0.5));
        bilinear(pm, r.width, r.height, fx, fy, acc, false);
      }
      write((y * w + x) * 4, acc);
    }
  }
  return out;
}

function bilinear(pm: Float32Array, W: number, H: number, fx: number, fy: number, acc: number[], wrap: boolean) {
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const at = (x: number, y: number) => {
    const xx = wrap ? ((x % W) + W) % W : Math.max(0, Math.min(W - 1, x));
    const yy = wrap ? ((y % H) + H) % H : Math.max(0, Math.min(H - 1, y));
    return (yy * W + xx) * 4;
  };
  const a = at(ix, iy);
  const b = at(ix + 1, iy);
  const c = at(ix, iy + 1);
  const d = at(ix + 1, iy + 1);
  for (let k = 0; k < 4; k++) {
    acc[k] = (pm[a + k] * (1 - tx) + pm[b + k] * tx) * (1 - ty) + (pm[c + k] * (1 - tx) + pm[d + k] * tx) * ty;
  }
}

/** Copies `src` into `dst` at (ox, oy), replacing pixels (dst is assumed transparent there). */
export function blit(dst: Raster, src: Raster, ox: number, oy: number) {
  for (let y = 0; y < src.height; y++) {
    const dy = oy + y;
    if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = ox + x;
      if (dx < 0 || dx >= dst.width) continue;
      const s = (y * src.width + x) * 4;
      if (src.data[s + 3] === 0) continue;
      dst.data.set(src.data.subarray(s, s + 4), (dy * dst.width + dx) * 4);
    }
  }
}

/**
 * Projects a (preferably seamless) top-down square texture onto a 2:1 isometric diamond of
 * size w x h: rotate 45° and squash vertically, with wrap-around sampling so tiles meet cleanly.
 */
export function isoTileFromSquare(tex: Raster, w: number, h: number): Raster {
  const out = createRaster(w, h);
  const pm = new Float32Array(tex.width * tex.height * 4);
  for (let i = 0; i < tex.data.length; i += 4) {
    pm[i] = tex.data[i];
    pm[i + 1] = tex.data[i + 1];
    pm[i + 2] = tex.data[i + 2];
    pm[i + 3] = 255;
  }
  const acc = [0, 0, 0, 0];
  const SS = 3; // supersampling per axis
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          // diamond top (w/2, 0), right (w, h/2), left (0, h/2): grid coords a, b in [0, 1]
          const a = ((px - w / 2) / (w / 2) + py / (h / 2)) / 2;
          const b = (py / (h / 2) - (px - w / 2) / (w / 2)) / 2;
          bilinear(pm, tex.width, tex.height, a * tex.width - 0.5, b * tex.height - 0.5, acc, true);
          for (let k = 0; k < 3; k++) sum[k] += acc[k];
        }
      }
      const o = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) out.data[o + k] = Math.round(sum[k] / (SS * SS));
      out.data[o + 3] = 255;
    }
  }
  return applyDiamondMask(out);
}

/** Clears everything outside the tile diamond (with a 1 px anti-aliased edge kept opaque inside). */
export function applyDiamondMask(r: Raster): Raster {
  const { width: w, height: h } = r;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // normalised diamond distance: <= 1 inside
      const d = Math.abs(x + 0.5 - w / 2) / (w / 2) + Math.abs(y + 0.5 - h / 2) / (h / 2);
      const o = (y * w + x) * 4 + 3;
      if (d > 1 + 1 / h) r.data[o] = 0;
      else r.data[o] = 255;
    }
  }
  return r;
}

/** Fills interior transparent holes of a tile diamond with the nearest opaque colour on its row. */
export function fillDiamondHoles(r: Raster): number {
  const { width: w, height: h, data } = r;
  let filled = 0;
  for (let y = 0; y < h; y++) {
    let last = -1;
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x + 0.5 - w / 2) / (w / 2) + Math.abs(y + 0.5 - h / 2) / (h / 2);
      const o = (y * w + x) * 4;
      if (d > 1) continue;
      if (data[o + 3] >= 250) last = o;
      else if (last >= 0) {
        data.set(data.subarray(last, last + 3), o);
        data[o + 3] = 255;
        filled++;
      }
    }
  }
  return filled;
}

// --- preview drawing ------------------------------------------------------------------

export function plot(r: Raster, x: number, y: number, rgba: [number, number, number, number]) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= r.width || yi >= r.height) return;
  r.data.set(rgba, (yi * r.width + xi) * 4);
}

export function line(r: Raster, a: { x: number; y: number }, b: { x: number; y: number }, rgba: [number, number, number, number]) {
  const n = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))) + 1;
  for (let i = 0; i <= n; i++) plot(r, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, rgba);
}

export function cross(r: Raster, p: { x: number; y: number }, size: number, rgba: [number, number, number, number]) {
  for (let t = -1; t <= 1; t++) {
    line(r, { x: p.x - size, y: p.y + t }, { x: p.x + size, y: p.y + t }, rgba);
    line(r, { x: p.x + t, y: p.y - size }, { x: p.x + t, y: p.y + size }, rgba);
  }
}

/** Composites `fg` over a checkerboard so transparency is visible in previews. */
export function overCheckerboard(fg: Raster, cell = 16): Raster {
  const out = createRaster(fg.width, fg.height);
  for (let y = 0; y < fg.height; y++) {
    for (let x = 0; x < fg.width; x++) {
      const i = (y * fg.width + x) * 4;
      const bg = ((x / cell) ^ (y / cell)) & 1 ? 70 : 100;
      const a = fg.data[i + 3] / 255;
      for (let k = 0; k < 3; k++) out.data[i + k] = Math.round(fg.data[i + k] * a + bg * (1 - a));
      out.data[i + 3] = 255;
    }
  }
  return out;
}
