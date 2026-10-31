/**
 * The six painted trees (art-source/raw/trees → src/assets/art/props): they must be imported
 * pixel-for-pixel at their spec canvas, stand on the anchor like the procedural trees they
 * replace, be solid, and never cover a buildable tile on screen.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifestByFile, PROPS, type PropType } from '../src/assets/manifest';
import { SOURCE_SCALE } from '../src/assets/spec';
import { isoPoint, worldToGridF } from '../src/game/iso';
import { layoutProps } from '../src/game/props';
import { packShelves } from '../src/game/environment/paintedAtlas';
import { decodeImage, readImageInfo } from '../scripts/lib/image';
import { importObject, isSpecExactProp } from '../scripts/lib/import';
import { encodeRgba } from '../scripts/lib/png';
import { createRaster, labelComponents, removeSliceFragments, solidifyBody, translucentBodyShare, verticalCuts, type Raster } from '../scripts/lib/raster';
import { validateArt } from '../scripts/lib/validate';

const root = new URL('..', import.meta.url).pathname;
const TREES: PropType[] = ['treePine', 'treeSpruce', 'treeFir', 'treeOak', 'treeEnchanted', 'treeMystic'];
const SIZE = 20;
const entryOf = (t: PropType) => manifestByFile.get(PROPS[t].file)!;
const master = (t: PropType) => decodeImage(readFileSync(join(root, 'src/assets/art', `${PROPS[t].file}.png`)));
const raw = (t: PropType) => decodeImage(readFileSync(join(root, 'art-source/raw/trees', `${PROPS[t].file.split('/').pop()}.png`)));
const A = (r: Raster) => (x: number, y: number) => r.data[(y * r.width + x) * 4 + 3];

describe('painted trees', () => {
  it('ships all six as 8-bit RGBA PNG masters plus WebP, at the exact spec canvas', () => {
    for (const t of TREES) {
      const base = join(root, 'src/assets/art', PROPS[t].file);
      expect(existsSync(`${base}.png`), t).toBe(true);
      expect(existsSync(`${base}.webp`), t).toBe(true);
      const info = readImageInfo(readFileSync(`${base}.png`))!;
      expect([info.width, info.height, info.hasAlpha, info.format]).toEqual([320, PROPS[t].height, true, 'png']);
      const webp = readImageInfo(readFileSync(`${base}.webp`))!;
      expect([webp.width, webp.height, webp.hasAlpha]).toEqual([320, PROPS[t].height, true]);
      const g = entryOf(t).geometry;
      expect(g.canvas).toEqual({ width: 320, height: PROPS[t].height });
      expect(g.anchor).toEqual({ x: 160, y: PROPS[t].height - 96 });
    }
  });

  it('keeps the painting in place: same canvas, same pixels, only alpha cleaned', () => {
    for (const t of TREES) {
      const src = raw(t);
      const out = master(t);
      expect([out.width, out.height]).toEqual([src.width, src.height]);
      let compared = 0;
      for (let i = 0; i < out.data.length; i += 4) {
        if (out.data[i + 3] === 0 || src.data[i + 3] < 128) continue;
        compared++;
        expect([out.data[i], out.data[i + 1], out.data[i + 2]]).toEqual([src.data[i], src.data[i + 1], src.data[i + 2]]);
      }
      expect(compared, t).toBeGreaterThan(20000);
    }
  });

  it('stands each trunk on the anchor (the tile centre), where the procedural trees stand', () => {
    for (const t of TREES) {
      const r = master(t);
      const { anchor } = entryOf(t).geometry;
      let maxY = -1;
      for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) if (A(r)(x, y) > 16) maxY = y;
      expect(Math.abs(maxY - anchor.y), t).toBeLessThanOrEqual(4);
      let sum = 0;
      let n = 0;
      for (let y = maxY - 3; y <= maxY; y++) for (let x = 0; x < r.width; x++) if (A(r)(x, y) > 16) (sum += x), n++;
      expect(Math.abs(sum / n - anchor.x), t).toBeLessThan(32);
    }
  });

  it('is solid (no see-through foliage), haze-free and free of sprite-sheet slivers', () => {
    for (const t of TREES) {
      const r = master(t);
      expect(translucentBodyShare(r.width, r.height, A(r)), t).toBeLessThan(0.01);
      let haze = 0;
      let visible = 0;
      for (let i = 3; i < r.data.length; i += 4) {
        if (r.data[i] > 16) visible++;
        else if (r.data[i] > 0) haze++;
      }
      expect(haze / visible, t).toBeLessThan(0.05); // only the faint outer anti-aliasing ring
      const copy = { ...r, data: new Uint8Array(r.data) };
      expect(removeSliceFragments(copy), t).toBe(0);
      expect(labelComponents(r.width, r.height, A(r)).sizes.length, t).toBeLessThanOrEqual(3);
    }
  });

  it('never covers a buildable tile on screen, using the real painted pixels, flips and scales', () => {
    const props = layoutProps(SIZE);
    for (const t of TREES) {
      const r = master(t);
      const { anchor } = entryOf(t).geometry;
      // painted pixels relative to the anchor in world px (sampled every 2 source px)
      const pts: [number, number][] = [];
      for (let y = 0; y < r.height; y += 2) {
        for (let x = 0; x < r.width; x += 2) if (A(r)(x, y) > 16) pts.push([(x - anchor.x) / SOURCE_SCALE, (y - anchor.y) / SOURCE_SCALE]);
      }
      const placed = props.filter((p) => p.type === t);
      expect(placed.length, t).toBeGreaterThan(0);
      for (const p of placed) {
        const base = isoPoint(p.x + 0.5 + p.ox, p.y + 0.5 + p.oy);
        let worst = -Infinity;
        for (const [dx, dy] of pts) {
          const g = worldToGridF(base.x + (p.flip ? -dx : dx) * p.scale, base.y + dy * p.scale);
          worst = Math.max(worst, Math.min(g.x, g.y, SIZE - g.x, SIZE - g.y));
        }
        expect(worst, `${t} at ${p.x},${p.y}`).toBeLessThanOrEqual(0.02);
      }
    }
  });
});

// --- pipeline behaviour behind the import ------------------------------------------------

function blob(r: Raster, cx: number, cy: number, rx: number, ry: number, alpha = 255) {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      const i = (y * r.width + x) * 4;
      r.data.set([60, 120, 50, alpha], i);
    }
  }
}

function rect(r: Raster, x0: number, y0: number, x1: number, y1: number, alpha = 255) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) r.data.set([60, 120, 50, alpha], (y * r.width + x) * 4);
}

const pine = manifestByFile.get('props/tree_pine')!;

/** A simple synthetic tree on the pine canvas, trunk base at `baseY`. */
function syntheticTree(baseY: number, alpha = 255): Raster {
  const r = createRaster(320, 512);
  blob(r, 160, baseY - 150, 70, 120, alpha);
  rect(r, 152, baseY - 40, 168, baseY, alpha);
  return r;
}

const validate = (r: Raster) =>
  validateArt([{ path: 'src/assets/art/props/tree_pine.png', data: Buffer.from(encodeRgba(r.width, r.height, r.data)) }]).issues.filter(
    (i) => i.file.endsWith('tree_pine.png'),
  );

describe('prop import and validation rules', () => {
  it('accepts a prop standing on the anchor even though it is narrower than the tile', () => {
    expect(validate(syntheticTree(pine.geometry.anchor.y)).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('rejects props aligned to the front corner like a building, and floating props', () => {
    const low = validate(syntheticTree(512 - 32));
    expect(low.some((i) => i.severity === 'error' && /below its anchor.*front corner/.test(i.message))).toBe(true);
    const high = validate(syntheticTree(pine.geometry.anchor.y - 60));
    expect(high.some((i) => i.severity === 'error' && /Prop floats/.test(i.message))).toBe(true);
  });

  it('rejects see-through bodies and the importer makes them solid while keeping soft edges', () => {
    const r = syntheticTree(pine.geometry.anchor.y, 232);
    expect(validate(r).some((i) => i.severity === 'error' && /semi-transparent/.test(i.message))).toBe(true);
    const copy = { ...r, data: new Uint8Array(r.data) };
    expect(solidifyBody(copy)).toBeGreaterThan(1000);
    expect(translucentBodyShare(copy.width, copy.height, A(copy))).toBe(0);
    // the outline (outside the eroded body) keeps its original alpha
    expect(A(copy)(160 - 70, pine.geometry.anchor.y - 150)).toBe(232);
  });

  it('keeps spec-exact props in place and removes sprite-sheet slivers but not sparkles', () => {
    const r = syntheticTree(pine.geometry.anchor.y, 240);
    rect(r, 20, 200, 40, 240); // sliver of a neighbour: straight left edge at x=20
    blob(r, 260, 150, 3, 3); // a round sparkle
    expect(isSpecExactProp(r, pine, {})).toBe(true);
    expect(isSpecExactProp(r, pine, { fill: 0.8 })).toBe(false);
    expect(verticalCuts(r.width, r.height, A(r)).some((k) => k.x === 20 && k.side === 'left')).toBe(true);
    const res = importObject(r, pine, {});
    expect(res.notes.join(' ')).toMatch(/Spec-exact/);
    expect(res.notes.join(' ')).toMatch(/sprite-sheet slivers/);
    expect(A(res.raster)(30, 220)).toBe(0); // sliver gone
    expect(A(res.raster)(260, 150)).toBeGreaterThan(200); // sparkle kept
    expect(A(res.raster)(160, pine.geometry.anchor.y - 10)).toBe(255); // trunk in place, now solid
  });

  it('warns about a long straight cut on the main artwork (truncated by slicing)', () => {
    const r = syntheticTree(pine.geometry.anchor.y);
    rect(r, 160, 120, 250, 200);
    // chop everything right of x=230 to make a straight 81-px cut
    for (let y = 0; y < r.height; y++) for (let x = 231; x < r.width; x++) r.data[(y * r.width + x) * 4 + 3] = 0;
    expect(validate(r).some((i) => i.severity === 'warning' && /straight vertical cut on its right side/.test(i.message))).toBe(true);
  });
});

describe('painted prop atlas packing', () => {
  const trees = TREES.map((t) => ({ key: `prop-${t}`, w: 320, h: PROPS[t].height }));

  it('packs the six trees into one texture within mobile limits, without overlaps', () => {
    const pack = packShelves(trees, 2048)!;
    expect(pack.width).toBeLessThanOrEqual(2048);
    expect(pack.height).toBeLessThanOrEqual(2048);
    const rects = [...pack.rects.values()];
    expect(rects).toHaveLength(6);
    for (const a of rects) {
      expect(a.x % 4 + a.y % 4).toBe(0); // exact frames in the ½ and ¼ LOD copies
      expect(a.x + a.w).toBeLessThanOrEqual(pack.width);
      expect(a.y + a.h).toBeLessThanOrEqual(pack.height);
      for (const b of rects) {
        if (a === b) continue;
        const apart = a.x + a.w + 16 <= b.x || b.x + b.w + 16 <= a.x || a.y + a.h + 16 <= b.y || b.y + b.h + 16 <= a.y;
        expect(apart).toBe(true); // ≥16 px gap: no bleeding, even at ¼ size
      }
    }
  });

  it('has room for all 14 prop types and refuses items wider than the limit', () => {
    const all = Object.values(PROPS).map((p) => ({ key: p.file, w: 320, h: p.height }));
    const pack = packShelves(all, 2048)!;
    expect(pack.rects.size).toBe(14);
    expect(pack.height).toBeLessThanOrEqual(2048);
    expect(packShelves([{ key: 'x', w: 4000, h: 10 }], 2048)).toBeNull();
  });
});
