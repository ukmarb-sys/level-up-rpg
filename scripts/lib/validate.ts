/**
 * Asset validation rules. Checks artwork against src/assets/manifest.ts and the geometry in
 * src/assets/spec.ts. AI-generated images are rarely aligned exactly, so this verifies
 * dimensions, transparency and where the opaque pixels actually sit relative to the footprint.
 */
import { ASSET_MANIFEST, manifestByFile, type AssetEntry } from '../../src/assets/manifest';
import { activeEffects, applyMeta, type ArtMeta } from '../../src/assets/meta';
import { explainUnknownFile, matchArtFiles } from '../../src/assets/resolve';
import { diamondCorners, GROUND_TOLERANCE, PAD } from '../../src/assets/spec';
import { decodePng, readImageInfo, type RgbaImage } from './image';

export type Severity = 'error' | 'warning';

export interface Issue {
  severity: Severity;
  file: string;
  message: string;
}

export interface ArtFile {
  /** Path containing ".../art/<manifest file>.<ext>". */
  path: string;
  data: Buffer;
}

export interface ValidationReport {
  issues: Issue[];
  matched: string[];
  missingRequired: string[];
  missingOptional: string[];
}

const OPAQUE = 16; // alpha above this counts as visible paint

export function validateArt(files: ArtFile[], opts: { strict?: boolean; meta?: ArtMeta } = {}): ValidationReport {
  const meta = opts.meta ?? {};
  const issues: Issue[] = [];
  const add = (severity: Severity, file: string, message: string) => issues.push({ severity, file, message });
  const { found, unknown } = matchArtFiles(files.map((f) => f.path));
  for (const u of unknown) add('error', u, explainUnknownFile(u));

  const byKey = new Map<string, ArtFile[]>();
  for (const f of files) {
    const { found: one } = matchArtFiles([f.path]);
    for (const key of one.keys()) byKey.set(key, [...(byKey.get(key) ?? []), f]);
  }

  for (const entry of ASSET_MANIFEST) {
    const candidates = byKey.get(entry.key) ?? [];
    if (candidates.length > 1) {
      add('warning', candidates.map((c) => c.path).join(' + '), `Both WebP and PNG exist for ${entry.key}; the game uses ${found.get(entry.key)}`);
    }
    for (const f of candidates) checkFile(applyMeta(entry, meta), f, add, entry.file in meta);
  }
  checkMeta(meta, found, add);

  const missing = ASSET_MANIFEST.filter((e) => !found.has(e.key));
  const missingRequired = missing.filter((e) => e.required).map((e) => `${e.file}.webp|png`);
  const missingOptional = missing.filter((e) => !e.required).map((e) => `${e.file}.webp|png`);
  for (const m of missingRequired) add(opts.strict ? 'error' : 'warning', m, 'Missing — the procedural fallback will be drawn');
  return { issues, matched: [...found.values()], missingRequired, missingOptional };
}

function checkMeta(meta: ArtMeta, found: Map<string, string>, add: (s: Severity, file: string, m: string) => void) {
  for (const [file, m] of Object.entries(meta)) {
    const entry = manifestByFile.get(file);
    const where = `art-meta.json › ${file}`;
    if (!entry) {
      add('error', where, 'Not a manifest file (use paths like "buildings/cottage/cottage_r0", no extension)');
      continue;
    }
    if (!found.has(entry.key)) add('warning', where, 'Metadata for an image that does not exist');
    const { width, height } = entry.geometry.canvas;
    const pts = [...(m.top ? [{ name: 'top', point: m.top }] : []), ...activeEffects(m.effects)];
    for (const { name, point } of pts) {
      const ok = Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
      if (!ok) add('error', where, `${name} point (${point.x}, ${point.y}) is outside the ${width}x${height} canvas`);
    }
  }
}

function checkFile(entry: AssetEntry, f: ArtFile, add: (s: Severity, file: string, m: string) => void, hasMeta = false) {
  const info = readImageInfo(f.data);
  if (!info) return add('error', f.path, 'Unreadable or unsupported image (use PNG or WebP)');
  const { canvas, footprint } = entry.geometry;
  if (info.width !== canvas.width || info.height !== canvas.height) {
    add(
      'error',
      f.path,
      `Wrong size ${info.width}x${info.height}; expected ${canvas.width}x${canvas.height} for a ${footprint.w}x${footprint.d} footprint`,
    );
    return;
  }
  if (!info.hasAlpha) return add('error', f.path, 'No alpha channel — background must be transparent');
  if (info.encodingIssue) return add('error', f.path, info.encodingIssue);
  if (info.format === 'webp') {
    add('warning', f.path, 'WebP: size/alpha checked; pixel alignment is only verified on PNG masters');
    return;
  }
  const img = decodePng(f.data);
  if (!img) return add('error', f.path, 'Could not decode PNG');
  if (entry.kind === 'terrain') checkTerrain(entry, img, f.path, add);
  else {
    checkObject(entry, img, f.path, add);
    checkPoints(entry, img, f.path, add, hasMeta);
  }
}

/** Top/effect points must sit on (or right next to) painted pixels of this image. */
function checkPoints(entry: AssetEntry, img: RgbaImage, file: string, add: (s: Severity, file: string, m: string) => void, hasMeta: boolean) {
  if (entry.kind !== 'building') return;
  if (!hasMeta) {
    add('warning', file, `No art-meta.json entry: reference top/effect points are used. Run: npm run art:import -- --measure ${entry.file.split('/').pop()}`);
  }
  const { width: W, height: H } = img;
  const near = (p: { x: number; y: number }, r = 6) => {
    for (let y = Math.max(0, Math.round(p.y) - r); y <= Math.min(H - 1, Math.round(p.y) + r); y++)
      for (let x = Math.max(0, Math.round(p.x) - r); x <= Math.min(W - 1, Math.round(p.x) + r); x++) if (img.alpha(x, y) > OPAQUE) return true;
    return false;
  };
  for (const { name, point } of activeEffects(entry.effects)) {
    if (!near(point)) add('warning', file, `${name} effect point (${point.x}, ${point.y}) is over transparent pixels; effects would float in the air`);
  }
  if (entry.top) {
    let minY = -1;
    for (let y = 0; y < H && minY < 0; y++) for (let x = 0; x < W; x++) if (img.alpha(x, y) > OPAQUE) { minY = y; break; }
    if (minY >= 0 && Math.abs(entry.top.y - minY) > 16) {
      add('warning', file, `Top point y=${entry.top.y} but the art's highest pixel is y=${minY}; re-run art:import -- --measure`);
    }
  }
}

function checkTerrain(entry: AssetEntry, img: RgbaImage, file: string, add: (s: Severity, file: string, m: string) => void) {
  const { width: W, height: H } = entry.geometry.canvas;
  const outside = [
    [2, 2],
    [W - 3, 2],
    [2, H - 3],
    [W - 3, H - 3],
    [W / 4 - 8, H / 4 - 8],
    [(3 * W) / 4 + 8, (3 * H) / 4 + 8],
  ];
  if (outside.some(([x, y]) => img.alpha(Math.round(x), Math.round(y)) > OPAQUE)) {
    add('error', file, 'Pixels outside the tile diamond must be fully transparent');
  }
  const inside = [
    [W / 2, H / 2],
    [W / 2, 6],
    [W / 2, H - 7],
    [10, H / 2],
    [W - 11, H / 2],
  ];
  if (inside.some(([x, y]) => img.alpha(Math.round(x), Math.round(y)) < 250)) {
    add('error', file, 'Tile diamond must be fully opaque edge to edge (gaps show seams between tiles)');
  }
}

function checkObject(entry: AssetEntry, img: RgbaImage, file: string, add: (s: Severity, file: string, m: string) => void) {
  const g = entry.geometry;
  const { width: W, height: H } = g.canvas;
  let minX = W;
  let maxX = -1;
  let minY = H;
  let maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (img.alpha(x, y) <= OPAQUE) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return add('error', file, 'Image is fully transparent');
  const corners = [
    [0, 0],
    [W - 1, 0],
    [0, H - 1],
    [W - 1, H - 1],
  ];
  if (corners.some(([x, y]) => img.alpha(x, y) > OPAQUE)) add('error', file, 'Corners are not transparent — remove the background');
  if (minX < 2 || maxX > W - 3 || minY < 2) add('error', file, `Artwork touches the canvas edge (bbox ${minX},${minY}–${maxX},${maxY}); it is probably cropped`);

  const c = diamondCorners(g);
  const groundY = H - PAD; // front corner of the footprint
  if (maxY > groundY + GROUND_TOLERANCE) {
    add('error', file, `Artwork extends ${maxY - groundY}px below the footprint's front corner (y=${groundY}); move it up or check the anchor`);
  }
  if (maxY < groundY - g.diamond.height / 2) {
    add('error', file, `Artwork floats: lowest pixel y=${maxY} but the footprint's front corner is y=${groundY}`);
  }
  const slack = 48;
  if (minX > c.left.x + slack || maxX < c.right.x - slack) {
    add(
      'error',
      file,
      `Artwork spans x=${minX}–${maxX} but a ${g.footprint.w}x${g.footprint.d} footprint spans x=${c.left.x}–${c.right.x}; wrong footprint size or scale?`,
    );
  }
  if (g.footprint.w !== g.footprint.d) {
    // The lowest opaque pixels should sit near the front corner, whose x depends on orientation.
    let sum = 0;
    let n = 0;
    for (let y = maxY - 3; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (img.alpha(x, y) > OPAQUE) {
          sum += x;
          n++;
        }
      }
    }
    const lowX = sum / Math.max(1, n);
    const expected = c.bottom.x;
    const mirrored = W - expected;
    if (Math.abs(lowX - expected) > 64 && Math.abs(lowX - mirrored) <= 64) {
      add('error', file, `Front corner is at x≈${Math.round(lowX)}, expected x≈${expected}: the image looks mirrored or drawn for the other rotation`);
    } else if (Math.abs(lowX - expected) > 96) {
      add('warning', file, `Lowest point is at x≈${Math.round(lowX)}, expected near the front corner x≈${expected}; check orientation`);
    }
  }
}
