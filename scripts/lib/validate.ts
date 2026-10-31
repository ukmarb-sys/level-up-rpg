/**
 * Asset validation rules. Checks artwork against src/assets/manifest.ts and the geometry in
 * src/assets/spec.ts. AI-generated images are rarely aligned exactly, so this verifies
 * dimensions, transparency and where the opaque pixels actually sit relative to the footprint.
 */
import { BUILDING_ORDER } from '../../src/core/buildings';
import type { BuildingType, Rotation } from '../../src/core/types';
import { ASSET_MANIFEST, buildingKey, GROUND_SUFFIX, groundKey, manifestByFile, manifestByKey, type AssetEntry } from '../../src/assets/manifest';

/** Largest allowed overhang of artwork beyond the logical footprint, in tiles per side. */
export const MAX_OVERHANG = 2;
import { activeEffects, applyMeta, type ArtMeta, type ArtMetaEntry } from '../../src/assets/meta';
import { logicalBounds } from '../../src/assets/geometry';
import { explainUnknownFile, matchArtFiles, resolveBuildingSprite } from '../../src/assets/resolve';
import { diamondCorners, GROUND_TOLERANCE, overhangs, PAD } from '../../src/assets/spec';
import { decodePng, readImageInfo, type RgbaImage } from './image';
import { TRANSLUCENT_BODY_LIMIT } from './import';
import { labelComponents, sliceFragments, translucentBodyShare, verticalCuts } from './raster';

/** 'info' = expected, temporary state worth knowing about (e.g. mirrored rotation fallbacks). */
export type Severity = 'error' | 'warning' | 'info';

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
  /** Rotations currently drawn from another rotation's image (temporary until all 4 exist). */
  fallbacks: RotationFallback[];
}

export interface RotationFallback {
  type: BuildingType;
  rotation: Rotation;
  /** File actually drawn, and whether it is mirrored. */
  from: string;
  mirrored: boolean;
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
    const master = candidates.find((c) => c.path.endsWith('.png'));
    const shipped = candidates.find((c) => c.path.endsWith('.webp'));
    if (master && shipped) {
      // The game ships the WebP; the PNG is the master that gets the full pixel checks.
      const mi = readImageInfo(master.data);
      const si = readImageInfo(shipped.data);
      if (mi && si && (mi.width !== si.width || mi.height !== si.height)) {
        add('error', shipped.path, `Both WebP and PNG exist but differ in size (${si.width}x${si.height} vs ${mi.width}x${mi.height}); the WebP is stale — run npm run art:webp`);
      } else {
        add(
          'info',
          shipped.path,
          `Both WebP and PNG exist: the game ships the WebP (${Math.round(shipped.data.length / 1024)} KB); the PNG master (${Math.round(master.data.length / 1024)} KB) is pixel-checked`,
        );
      }
    } else if (candidates.length > 1) {
      add('warning', candidates.map((c) => c.path).join(' + '), `Both WebP and PNG exist for ${entry.key}; the game uses ${found.get(entry.key)}`);
    }
    const effective = applyMeta(entry, meta);
    if (entry.kind === 'ground' && candidates.length && !found.has(entry.layerOf!)) {
      add('error', candidates[0].path, `Ground layer without its building sprite ${manifestByKey.get(entry.layerOf!)!.file}.png`);
    }
    // A building's alignment is judged on its upright art plus its ground layer (if any).
    // Use the ground layer's PNG master (WebP can't be pixel-decoded here).
    const groundFiles = entry.kind === 'building' ? (byKey.get(groundKey(entry.key)) ?? []) : [];
    const groundMaster = groundFiles.find((f) => f.path.endsWith('.png'));
    const companion = groundMaster ? (decodePng(groundMaster.data) ?? undefined) : undefined;
    for (const f of candidates) checkFile(effective, f, add, entry.file in meta, companion, !!master && f !== master);
  }
  checkMeta(meta, found, add);
  const fallbacks = rotationFallbacks(found);
  for (const f of fallbacks) {
    add(
      'info',
      `buildings/${f.type}/${f.type}_r${f.rotation}.png`,
      `Temporary fallback: drawn as ${f.mirrored ? 'mirrored ' : ''}${f.from}.png until this directional image is provided`,
    );
  }
  checkLayering(found, meta, add);

  const missing = ASSET_MANIFEST.filter((e) => !found.has(e.key));
  const missingRequired = missing.filter((e) => e.required).map((e) => `${e.file}.webp|png`);
  const missingOptional = missing.filter((e) => !e.required).map((e) => `${e.file}.webp|png`);
  for (const m of missingRequired) add(opts.strict ? 'error' : 'warning', m, 'Missing — the procedural fallback will be drawn');
  return { issues, matched: [...found.values()], missingRequired, missingOptional, fallbacks };
}

/** For every building with at least one image, which rotations borrow another rotation's image. */
export function rotationFallbacks(found: Map<string, string>): RotationFallback[] {
  const out: RotationFallback[] = [];
  for (const type of BUILDING_ORDER) {
    for (const rotation of [0, 1, 2, 3] as Rotation[]) {
      const choice = resolveBuildingSprite(type, rotation, (k) => found.has(k));
      if (!choice || (choice.key === buildingKey(type, rotation) && !choice.flipX)) continue;
      out.push({ type, rotation, from: manifestByKey.get(choice.key)!.file, mirrored: choice.flipX });
    }
  }
  return out;
}

/**
 * Decoration that overhangs the logical footprint (gardens, flowers, fences) belongs in the
 * _ground layer, which is drawn beneath every building. Also keeps the visual footprint
 * consistent between the directional images of one building.
 */
function checkLayering(found: Map<string, string>, meta: ArtMeta, add: (s: Severity, file: string, m: string) => void) {
  for (const type of BUILDING_ORDER) {
    const present = ([0, 1, 2, 3] as Rotation[]).map((r) => manifestByKey.get(buildingKey(type, r))!).filter((e) => found.has(e.key));
    const declared = present.filter((e) => meta[e.file]?.visual);
    for (const e of present) {
      const path = found.get(e.key)!;
      if (meta[e.file]?.visual && !found.has(groundKey(e.key))) {
        add(
          'warning',
          path,
          `Art overhangs its logical footprint but has no ground layer. Gardens, flowers and fences painted in the building image ` +
            `are layered with the building and can cover a neighbour behind it — export them as ${e.file}${GROUND_SUFFIX}.png (art:import --ground)`,
        );
      }
      if (declared.length && !meta[e.file]?.visual) {
        add(
          'warning',
          path,
          `Other directions of this building declare a visual footprint (${declared.map((d) => d.file.split('/').pop()).join(', ')}) but this one does not; ` +
            'if it paints the same garden, import it with the same --visual',
        );
      }
    }
  }
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
    if (entry.kind === 'ground') {
      add('error', where, `Ground layers share their building's metadata; move this to "${manifestByKey.get(entry.layerOf!)!.file}"`);
      continue;
    }
    if (m.visual || m.height !== undefined) checkVisualMeta(entry, m, where, add);
    const { width, height } = applyMeta(entry, meta).geometry.canvas;
    const pts = [...(m.top ? [{ name: 'top', point: m.top }] : []), ...activeEffects(m.effects)];
    for (const { name, point } of pts) {
      const ok = Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
      if (!ok) add('error', where, `${name} point (${point.x}, ${point.y}) is outside the ${width}x${height} canvas`);
    }
  }
}

/** Overhang must contain the logical footprint, use quarter tiles and stay within reason. */
function checkVisualMeta(entry: AssetEntry, m: ArtMetaEntry, where: string, add: (s: Severity, file: string, m: string) => void) {
  if (!entry.building) {
    add('error', where, '"visual"/"height" are only supported for building sprites');
    return;
  }
  const { type } = entry.building;
  const L = logicalBounds(type);
  if (m.visual) {
    const v = m.visual;
    const nums = [v.u0, v.v0, v.u1, v.v1];
    if (!nums.every((n) => Number.isFinite(n) && Math.abs(n * 4 - Math.round(n * 4)) < 1e-9)) {
      add('error', where, 'visual bounds must be numbers in quarter tiles (e.g. -0.5, 1.25)');
      return;
    }
    if (v.u0 > L.u0 || v.v0 > L.v0 || v.u1 < L.u1 || v.v1 < L.v1) {
      add('error', where, `visual footprint {u0:${v.u0}, v0:${v.v0}, u1:${v.u1}, v1:${v.v1}} must contain the logical footprint {u0:0, v0:0, u1:${L.u1}, v1:${L.v1}}`);
    }
    const over = Math.max(L.u0 - v.u0, L.v0 - v.v0, v.u1 - L.u1, v.v1 - L.v1);
    if (over > MAX_OVERHANG) add('error', where, `Overhang of ${over} tiles exceeds the ${MAX_OVERHANG}-tile limit`);
    else if (over > 1) add('warning', where, `Overhang of ${over} tiles: neighbouring buildings will cover a lot of this art; consider a ground layer`);
  }
  if (m.height !== undefined && !(Number.isInteger(m.height) && m.height % 32 === 0 && m.height >= 128 && m.height <= 4096)) {
    add('error', where, 'height must be a multiple of 32 between 128 and 4096');
  }
}

function checkFile(
  entry: AssetEntry,
  f: ArtFile,
  add: (s: Severity, file: string, m: string) => void,
  hasMeta = false,
  companion?: RgbaImage,
  /** A PNG master of the same asset exists and receives the pixel checks. */
  hasMaster = false,
) {
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
    if (!hasMaster) add('warning', f.path, 'WebP: size/alpha checked; pixel alignment is only verified on PNG masters');
    return;
  }
  const img = decodePng(f.data);
  if (!img) return add('error', f.path, 'Could not decode PNG');
  if (entry.kind === 'terrain') checkTerrain(entry, img, f.path, add);
  else if (entry.kind === 'ground') checkGround(img, f.path, add);
  else {
    const union: RgbaImage =
      companion && companion.width === img.width && companion.height === img.height
        ? { width: img.width, height: img.height, alpha: (x, y) => Math.max(img.alpha(x, y), companion.alpha(x, y)) }
        : img;
    checkObject(entry, union, f.path, add);
    checkPoints(entry, img, f.path, add, hasMeta);
  }
}

/** Ground layers: transparent background and nothing cropped; alignment is checked with the sprite. */
function checkGround(img: RgbaImage, file: string, add: (s: Severity, file: string, m: string) => void) {
  const { width: W, height: H } = img;
  if ([[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].some(([x, y]) => img.alpha(x, y) > OPAQUE)) {
    add('error', file, 'Corners are not transparent — remove the background');
  }
  for (let x = 0; x < W; x++) {
    if (img.alpha(x, 0) > OPAQUE || img.alpha(x, 1) > OPAQUE) return add('error', file, 'Ground layer touches the top edge; it is probably cropped or misaligned');
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

  checkOpacity(img, file, add);
  checkSlicing(img, file, add, entry.kind === 'prop');
  if (entry.kind === 'prop') return checkPropStance(entry, img, file, add, minX, maxX, maxY);

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
      `Artwork spans x=${minX}–${maxX} but a ${g.visual.w}x${g.visual.d} ${overhangs(g) ? 'visual ' : ''}footprint spans x=${c.left.x}–${c.right.x}; wrong footprint size or scale?`,
    );
  }
  if (g.visual.w !== g.visual.d) {
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

/**
 * Some generators write noisy alpha (about 215–254) across the whole body, so the art is faintly
 * see-through in game. `art:import` fixes this; the validator catches files that skipped it.
 */
function checkOpacity(img: RgbaImage, file: string, add: (s: Severity, file: string, m: string) => void) {
  const share = translucentBodyShare(img.width, img.height, img.alpha);
  if (share > TRANSLUCENT_BODY_LIMIT) {
    add(
      'error',
      file,
      `${Math.round(share * 100)}% of the body is semi-transparent (alpha < 250), so it looks see-through in game. Import it with npm run art:import to clean the alpha`,
    );
  }
}

/** How far (source px) a prop's lowest point may sit from the anchor before it reads as floating or sunk. */
export const PROP_STANCE = { above: 24, below: 40, offCentreWarn: 32, offCentreError: 64 };

/**
 * Props (trees, rocks, ruins) stand ON the ground centre of their tile — the anchor — like the
 * procedural props they replace. They are usually narrower than the tile, so the building
 * rules (front corner, footprint span) don't apply.
 */
function checkPropStance(
  entry: AssetEntry,
  img: RgbaImage,
  file: string,
  add: (s: Severity, file: string, m: string) => void,
  minX: number,
  maxX: number,
  maxY: number,
) {
  const a = entry.geometry.anchor;
  const front = entry.geometry.canvas.height - PAD;
  if (maxY < a.y - PROP_STANCE.above) {
    add('error', file, `Prop floats: lowest pixel y=${maxY} but it should stand on the anchor (y=${a.y})`);
  } else if (maxY > a.y + PROP_STANCE.below) {
    const hint = maxY >= front - 4 ? ' (it looks aligned to the front corner like a building; props stand on the anchor)' : '';
    add('error', file, `Prop extends ${maxY - a.y}px below its anchor (y=${a.y})${hint}`);
  }
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
  const off = Math.round(sum / Math.max(1, n) - a.x);
  if (Math.abs(off) > PROP_STANCE.offCentreError) {
    add('error', file, `Prop base is ${off}px from the anchor x=${a.x}; centre the trunk/base on the canvas`);
  } else if (Math.abs(off) > PROP_STANCE.offCentreWarn) {
    add('warning', file, `Prop base is ${off}px off centre (anchor x=${a.x}); it may look shifted, especially when mirrored`);
  }
}

/** A straight cut this long (source px) on the main artwork is reported. */
export const CUT_WARN_ROWS = 24;

/** Sprite-sheet slicing: slivers of neighbouring art, and (for props) truncated sides. */
function checkSlicing(img: RgbaImage, file: string, add: (s: Severity, file: string, m: string) => void, organic: boolean) {
  const cuts = verticalCuts(img.width, img.height, img.alpha);
  if (!cuts.length) return;
  const c = labelComponents(img.width, img.height, img.alpha);
  const main = c.sizes.indexOf(Math.max(...c.sizes));
  const slivers = sliceFragments(img.width, img.height, img.alpha, c);
  if (slivers.length) {
    add('warning', file, `${slivers.length} detached sliver(s) cut by a straight edge (pieces of a neighbouring sprite?); npm run art:import removes them`);
  }
  // Building walls are legitimately vertical; trees, rocks and plants never end in a ruler line.
  if (!organic) return;
  for (const k of cuts) {
    if (k.rows < CUT_WARN_ROWS) continue;
    if (!((k.side === 'left' && k.x === c.minX[main]) || (k.side === 'right' && k.x === c.maxX[main]))) continue;
    add(
      'warning',
      file,
      `The artwork ends in a straight vertical cut on its ${k.side} side (x=${k.x}, ${k.rows} px tall): it looks sliced from a sprite sheet and is truncated there. Regenerate with more side margin`,
    );
  }
}
