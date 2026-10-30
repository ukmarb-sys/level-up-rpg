/**
 * Turns raw (e.g. AI-generated) artwork into spec-exact sprites:
 *   objects  -> background removal, despeckle, crop, orientation check, scale so the art spans
 *               the footprint diamond, align the lowest point to the front corner, measure
 *               top/effect points.
 *   terrain  -> either project a top-down square texture onto the iso diamond, or fit a
 *               painted diamond and mask it.
 * Pure functions over RGBA rasters; the CLI (scripts/import-art.ts) handles files.
 */
import type { Pt } from '../../src/assets/geometry';
import type { LocalBounds } from '../../src/assets/geometry';
import type { AssetEntry, EffectPoints } from '../../src/assets/manifest';
import { applyMeta, type ArtMetaEntry } from '../../src/assets/meta';
import { diamondCorners, logicalCorners, overhangs, PAD } from '../../src/assets/spec';
import {
  applyDiamondMask,
  blit,
  countTransparent,
  createRaster,
  crop,
  cross,
  despeckle,
  fillDiamondHoles,
  flipX,
  isoTileFromSquare,
  keyOutBackground,
  line,
  opaqueBounds,
  OPAQUE,
  overCheckerboard,
  resize,
  type Raster,
} from './raster';

export interface ObjectImportOptions {
  /** Fraction of the footprint diamond's width the artwork should span (default 0.96). */
  fill?: number;
  /** Extra vertical shift in output px (+ moves the art down), e.g. to sink a shadow. */
  offsetY?: number;
  /** 'auto' flips art drawn for the other orientation of a non-square footprint. */
  mirror?: 'auto' | boolean;
  /** Background removal: 'auto' keys out a flat/checkerboard background when the image has no real transparency. */
  key?: 'auto' | 'on' | 'off';
  /** Visual footprint the art paints, in the building's local tile frame (buildings only). */
  visual?: LocalBounds;
  /** Canvas height override (multiple of 32). */
  height?: number;
  /** Grow the canvas height for tall building art instead of shrinking it (default true). */
  autoHeight?: boolean;
  /** Optional ground layer (garden, path, shadow), same pixel size as the building image. */
  ground?: Raster;
  /** Skip removal of small detached specks (default false). */
  keepIslands?: boolean;
  /** Manual effect points in output px; null disables the effect. */
  effects?: Partial<Record<'chimney' | 'orb' | 'wheel', Pt | null>> & { windows?: Pt[] };
}

export interface ImportResult {
  raster: Raster;
  /** Aligned ground layer, when one was supplied. */
  ground?: Raster;
  meta?: ArtMetaEntry;
  notes: string[];
  warnings: string[];
  /** Effects that still need a human to place them. */
  manual: string[];
}

const TOP_MARGIN = 3;

function corners(r: Raster) {
  return [
    [0, 0],
    [r.width - 1, 0],
    [0, r.height - 1],
    [r.width - 1, r.height - 1],
  ].filter(([x, y]) => r.data[(y * r.width + x) * 4 + 3] > OPAQUE).length;
}

/** Removes a fake/flat background when needed. Mutates `r`. */
function prepareAlpha(r: Raster, mode: 'auto' | 'on' | 'off', notes: string[]) {
  const total = r.width * r.height;
  const needs = countTransparent(r) < total * 0.01 || corners(r) >= 3;
  if (mode === 'on' || (mode === 'auto' && needs)) {
    const cleared = keyOutBackground(r);
    notes.push(`Removed background: ${cleared} px cleared from the border inwards`);
  }
  if (countTransparent(r) < total * 0.01) {
    throw new Error(
      'The image has no transparent background (and the background could not be keyed out). ' +
        'Export a PNG with transparency, or generate on a flat single-colour background.',
    );
  }
}

/** Mean x of opaque pixels in the lowest `rows` rows of the image. */
function lowestPointX(r: Raster, b: { minX: number; maxX: number; maxY: number }, rows = 4): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, b.maxY - rows + 1); y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      if (r.data[(y * r.width + x) * 4 + 3] > OPAQUE) {
        sum += x;
        n++;
      }
    }
  }
  return sum / Math.max(1, n);
}

/** Union of two same-sized rasters' alpha (max), for alignment decisions. */
function unionAlpha(a: Raster, b?: Raster): Raster {
  if (!b) return a;
  const out: Raster = { width: a.width, height: a.height, data: new Uint8Array(a.data) };
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = Math.max(a.data[i], b.data[i]);
  return out;
}

/** Largest canvas height the importer will grow to (source px). */
export const MAX_CANVAS_HEIGHT = 4096;

export function importObject(source: Raster, baseEntry: AssetEntry, opts: ObjectImportOptions = {}): ImportResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  const fill = opts.fill ?? 0.96;
  const offsetY = opts.offsetY ?? 0;
  if ((opts.visual || opts.height) && !baseEntry.building) throw new Error('--visual and --height only apply to building sprites');
  const metaFor = (height?: number): ArtMetaEntry => ({
    ...(opts.visual ? { visual: opts.visual } : {}),
    ...(height !== undefined ? { height } : {}),
  });
  let height = opts.height;
  let entry = applyMeta(baseEntry, { [baseEntry.file]: metaFor(height) });
  if (opts.visual) {
    const v = entry.geometry.visual;
    notes.push(
      `Visual footprint ${v.w}x${v.d} tiles around the logical ${entry.geometry.footprint.w}x${entry.geometry.footprint.d} — canvas ${entry.geometry.canvas.width}x${entry.geometry.canvas.height}, anchor (${entry.geometry.anchor.x}, ${entry.geometry.anchor.y})`,
    );
  }

  const prep = (r: Raster, label: string) => {
    const work: Raster = { width: r.width, height: r.height, data: new Uint8Array(r.data) };
    prepareAlpha(work, opts.key ?? 'auto', notes);
    const specks = opts.keepIslands ? 0 : despeckle(work);
    if (specks) notes.push(`Removed ${specks} px of stray specks${label}`);
    return work;
  };
  const main = prep(source, '');
  let ground: Raster | undefined;
  if (opts.ground) {
    if (opts.ground.width !== source.width || opts.ground.height !== source.height) {
      throw new Error(`The ground layer must have the same size as the building image (${source.width}x${source.height})`);
    }
    ground = prep(opts.ground, ' (ground layer)');
  }
  // Align on everything painted (building + ground) so both layers stay registered.
  const b0 = opaqueBounds(unionAlpha(main, ground));
  if (!b0) throw new Error('The image is empty after background removal');
  let art = crop(main, b0);
  let gArt = ground && crop(ground, b0);
  const bw = art.width;
  const bh = art.height;

  // Orientation: for non-square (visual) footprints the front (lowest) corner is off-centre.
  let mirrored = false;
  const { w, d } = entry.geometry.visual;
  if (opts.mirror === true) mirrored = true;
  else if (opts.mirror !== false && w !== d) {
    const both = unionAlpha(art, gArt);
    const lf = lowestPointX(both, { minX: 0, maxX: bw - 1, maxY: bh - 1 }) / Math.max(1, bw - 1);
    const expected = w / (w + d);
    if (Math.abs(lf - (1 - expected)) + 0.08 < Math.abs(lf - expected)) {
      mirrored = true;
      warnings.push(
        `Lowest point is at ${Math.round(lf * 100)}% of the width; a ${w}x${d} footprint expects ~${Math.round(expected * 100)}%. ` +
          'Mirrored the art to match — pass --no-mirror if this is wrong.',
      );
    }
  }
  if (mirrored) {
    art = flipX(art);
    gArt = gArt && flipX(gArt);
  }

  // Scale so the artwork spans the (visual) footprint diamond.
  let s = (entry.geometry.diamond.width * fill) / bw;
  const needH = Math.ceil(bh * s) + PAD + TOP_MARGIN + Math.max(0, -offsetY);
  if (needH > entry.geometry.canvas.height) {
    const grown = Math.ceil(needH / 32) * 32;
    if (entry.building && opts.autoHeight !== false && grown <= MAX_CANVAS_HEIGHT) {
      notes.push(`Canvas height grown ${entry.geometry.canvas.height} → ${grown} px to fit the art (recorded in art-meta.json)`);
      height = grown;
      entry = applyMeta(baseEntry, { [baseEntry.file]: metaFor(height) });
    } else {
      const availH = entry.geometry.canvas.height - PAD + offsetY + 1 - TOP_MARGIN;
      const fitted = availH / bh;
      warnings.push(
        `Art is too tall for the ${entry.geometry.canvas.width}x${entry.geometry.canvas.height} canvas at full width: scaled to ${Math.round((fitted / s) * 100)}% ` +
          `(covers ${Math.round(fill * (fitted / s) * 100)}% of the footprint width). Consider a slimmer composition.`,
      );
      s = fitted;
    }
  }
  if (s > 1.05) warnings.push(`Source art is small: upscaled ${s.toFixed(2)}x. Regenerate at higher resolution for sharper results.`);
  const g = entry.geometry;
  const { width: W, height: H } = g.canvas;
  const groundY = H - PAD + offsetY;
  const rw = Math.max(1, Math.round(bw * s));
  const rh = Math.max(1, Math.round(bh * s));
  notes.push(`Cropped ${bw}x${bh} → scaled ${s.toFixed(3)}x to ${rw}x${rh}${mirrored ? ' (mirrored)' : ''}`);

  // Horizontally: centre the art on the visual diamond (which may be offset from the anchor).
  const c = diamondCorners(g);
  const cx = (c.left.x + c.right.x) / 2;
  const ox = Math.round(cx - rw / 2);
  const oy = groundY - rh + 1;
  const out = createRaster(W, H);
  blit(out, resize(art, rw, rh), ox, oy);
  let groundOut: Raster | undefined;
  if (gArt) {
    groundOut = createRaster(W, H);
    blit(groundOut, resize(gArt, rw, rh), ox, oy);
    notes.push('Ground layer aligned with the same crop, scale and offset');
  }

  const measured = measureObject(out, entry);
  const effects: EffectPoints = {};
  const manual: string[] = [];
  const ref = entry.effects ?? {};
  if (ref.windows) {
    effects.windows = measured.windows;
    notes.push(measured.windows.length ? `Detected ${measured.windows.length} lit window(s)` : 'No lit windows detected (window glow off)');
  }
  if ('orb' in ref) {
    effects.orb = measured.orb;
    notes.push(measured.orb ? `Detected the orb at (${measured.orb.x}, ${measured.orb.y})` : 'No orb detected (orb glow off)');
    if (!measured.orb) manual.push('orb');
  }
  for (const name of ['chimney', 'wheel'] as const) {
    if (name in ref) {
      effects[name] = null;
      manual.push(name);
    }
  }
  for (const [name, value] of Object.entries(opts.effects ?? {})) {
    (effects as Record<string, unknown>)[name] = value;
    const i = manual.indexOf(name);
    if (i >= 0) manual.splice(i, 1);
  }
  const meta: ArtMetaEntry = {
    ...metaFor(height),
    top: measured.top,
    effects,
    import: { fill, offsetY, mirrored, scale: Number(s.toFixed(4)) },
  };
  return { raster: out, ground: groundOut, meta, notes, warnings, manual };
}

/** Measures the highest painted point and detects lit windows / a magic orb. */
export function measureObject(r: Raster, entry: AssetEntry): { top: Pt; windows: Pt[]; orb: Pt | null } {
  const b = opaqueBounds(r);
  if (!b) return { top: entry.geometry.anchor, windows: [], orb: null };
  let sum = 0;
  let n = 0;
  for (let y = b.minY; y <= Math.min(b.maxY, b.minY + 3); y++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      if (r.data[(y * r.width + x) * 4 + 3] > OPAQUE) {
        sum += x;
        n++;
      }
    }
  }
  const top = { x: Math.round(sum / Math.max(1, n)), y: b.minY };

  const warm = (i: number) => {
    const [R, G, B, A] = [r.data[i], r.data[i + 1], r.data[i + 2], r.data[i + 3]];
    return A > 200 && R > 190 && G > 120 && B < 150 && R - B > 70 && (R + G) / 2 > 160;
  };
  const orbLike = (i: number) => {
    const [R, G, B, A] = [r.data[i], r.data[i + 1], r.data[i + 2], r.data[i + 3]];
    return A > 180 && (R + G + B) / 3 > 200 && B >= R - 10;
  };
  const windows = clusters(r, warm, { minY: b.minY, maxY: b.maxY }, 12)
    .slice(0, 4)
    .map((c) => c.centre);
  const orbZone = { minY: b.minY, maxY: b.minY + Math.round((b.maxY - b.minY) * 0.35) };
  const orb = entry.effects && 'orb' in entry.effects ? (clusters(r, orbLike, orbZone, 10)[0]?.centre ?? null) : null;
  return { top, windows, orb };
}

/** Groups matching pixels into blobs on an 8 px grid; largest first. */
function clusters(r: Raster, match: (i: number) => boolean, zone: { minY: number; maxY: number }, minPixels: number) {
  const CELL = 8;
  const cw = Math.ceil(r.width / CELL);
  const ch = Math.ceil(r.height / CELL);
  const count = new Int32Array(cw * ch);
  const sx = new Float64Array(cw * ch);
  const sy = new Float64Array(cw * ch);
  for (let y = zone.minY; y <= zone.maxY; y++) {
    for (let x = 0; x < r.width; x++) {
      if (!match((y * r.width + x) * 4)) continue;
      const c = Math.floor(y / CELL) * cw + Math.floor(x / CELL);
      count[c]++;
      sx[c] += x;
      sy[c] += y;
    }
  }
  const seen = new Uint8Array(cw * ch);
  const out: { size: number; centre: Pt }[] = [];
  for (let c = 0; c < cw * ch; c++) {
    if (seen[c] || count[c] < 3) continue;
    let size = 0;
    let ax = 0;
    let ay = 0;
    const stack = [c];
    seen[c] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      size += count[k];
      ax += sx[k];
      ay += sy[k];
      const kx = k % cw;
      const ky = (k - kx) / cw;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = kx + dx;
          const ny = ky + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const n = ny * cw + nx;
          if (!seen[n] && count[n] >= 3) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    if (size >= minPixels) out.push({ size, centre: { x: Math.round(ax / size), y: Math.round(ay / size) } });
  }
  return out.sort((a, b) => b.size - a.size);
}

export interface TerrainImportOptions {
  /** 'auto' treats an opaque, roughly square image as a top-down texture to project. */
  mode?: 'auto' | 'square' | 'diamond';
  key?: 'auto' | 'on' | 'off';
}

export function importTerrain(source: Raster, entry: AssetEntry, opts: TerrainImportOptions = {}): ImportResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  const { width: W, height: H } = entry.geometry.canvas;
  const aspect = source.width / source.height;
  const opaque = countTransparent(source) < source.width * source.height * 0.01;
  const mode = opts.mode && opts.mode !== 'auto' ? opts.mode : opaque && aspect > 0.8 && aspect < 1.25 ? 'square' : 'diamond';
  if (mode === 'square') {
    notes.push('Projected a top-down square texture onto the 2:1 isometric diamond (rotate 45°, squash 2:1)');
    notes.push('Seams only disappear if the square texture itself tiles seamlessly');
    return { raster: isoTileFromSquare(source, W, H), notes, warnings, manual: [] };
  }
  const work: Raster = { width: source.width, height: source.height, data: new Uint8Array(source.data) };
  prepareAlpha(work, opts.key ?? 'auto', notes);
  despeckle(work);
  const b = opaqueBounds(work);
  if (!b) throw new Error('The image is empty after background removal');
  const tile = crop(work, b);
  const a = tile.width / tile.height;
  if (Math.abs(a - 2) > 0.3) warnings.push(`Painted tile is ${a.toFixed(2)}:1, not 2:1 — it was stretched to fit; check the angle`);
  const out = resize(tile, W, H);
  const filled = fillDiamondHoles(out);
  if (filled > W * H * 0.02) warnings.push(`Filled ${filled} transparent px inside the diamond; the source tile had gaps`);
  applyDiamondMask(out);
  notes.push(`Fitted painted diamond ${tile.width}x${tile.height} → ${W}x${H} and masked the edges`);
  return { raster: out, notes, warnings, manual: [] };
}

/**
 * Checkerboard preview: green = visual footprint (what the art spans), orange = logical
 * footprint (the tiles it occupies / collides on), cyan = anchor, yellow = top, magenta = effects.
 * A ground layer, if any, is composited underneath.
 */
export function renderPreview(r: Raster, baseEntry: AssetEntry, meta?: ArtMetaEntry, ground?: Raster): Raster {
  const entry = meta ? applyMeta(baseEntry, { [baseEntry.layerOf ? '' : baseEntry.file]: meta }) : baseEntry;
  const layered = createRaster(r.width, r.height);
  if (ground) blit(layered, ground, 0, 0);
  blit(layered, r, 0, 0);
  const out = overCheckerboard(layered);
  const g = entry.geometry;
  const outline = (pts: { x: number; y: number }[], rgba: [number, number, number, number]) => {
    for (let i = 0; i < 4; i++) line(out, pts[i], pts[(i + 1) % 4], rgba);
  };
  const c = diamondCorners(g);
  outline([c.top, c.right, c.bottom, c.left], [80, 255, 140, 255]);
  if (overhangs(g)) {
    const l = logicalCorners(g);
    outline([l.top, l.right, l.bottom, l.left], [255, 150, 40, 255]);
  }
  cross(out, g.anchor, 6, [0, 220, 255, 255]);
  const top = meta?.top ?? entry.top;
  if (top) cross(out, top, 8, [255, 220, 60, 255]);
  const fx = entry.effects ?? {};
  for (const p of [fx.chimney, fx.orb, fx.wheel, ...(fx.windows ?? [])]) if (p) cross(out, p, 5, [255, 60, 220, 255]);
  return out;
}
