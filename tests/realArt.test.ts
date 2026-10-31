/**
 * Integration tests for the artwork actually committed to the repository: the painted cottage
 * and the mystic garden used as its ground layer.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/core/buildings';
import { manifestByKey } from '../src/assets/manifest';
import { applyMeta, type ArtMeta } from '../src/assets/meta';
import { logicalCorners, overhangs } from '../src/assets/spec';
import { decodeImage, readImageInfo } from '../scripts/lib/image';
import { importObject, measureObject } from '../scripts/lib/import';
import { alphaStats, cleanAlpha, createRaster, opaqueBounds } from '../scripts/lib/raster';
import { validateArt, type ArtFile } from '../scripts/lib/validate';

const root = new URL('..', import.meta.url).pathname;
const art = join(root, 'src/assets/art');
const meta = JSON.parse(readFileSync(join(art, 'art-meta.json'), 'utf8')) as ArtMeta;
const cottage = manifestByKey.get('bld-cottage-r0')!;
const read = (rel: string) => readFileSync(join(art, rel));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('committed artwork', () => {
  it('stores raw sources outside the bundle and nothing heavy in public/', () => {
    expect(existsSync(join(root, 'art-source/raw/levelup_cottage.png'))).toBe(true);
    expect(existsSync(join(root, 'art-source/raw/levelup_mystic_garden.png'))).toBe(true);
    const publicFiles = readdirSync(join(root, 'public'));
    expect(publicFiles.filter((f) => /\.(png|webp|jpe?g)$/i.test(f))).toEqual([]);
  });

  it('passes asset validation with no errors and reports r1-r3 as temporary fallbacks', () => {
    const files: ArtFile[] = walk(art)
      .filter((p) => /\.(png|webp)$/.test(p))
      .map((p) => ({ path: p.slice(root.length), data: readFileSync(p) }));
    const report = validateArt(files, { meta });
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(report.fallbacks.filter((f) => f.type === 'cottage').map((f) => f.rotation)).toEqual([1, 2, 3]);
    expect(report.issues.some((i) => /no ground layer/.test(i.message))).toBe(false);
  });

  it('keeps the cottage logical footprint 1x1 while the art overhangs it', () => {
    expect([BUILDINGS.cottage.width, BUILDINGS.cottage.depth]).toEqual([1, 1]);
    const e = applyMeta(cottage, meta);
    expect(e.geometry.footprint).toEqual({ w: 1, d: 1 });
    expect(overhangs(e.geometry)).toBe(true);
    const v = meta['buildings/cottage/cottage_r0'].visual!;
    expect(v.u0 <= 0 && v.v0 <= 0 && v.u1 >= 1 && v.v1 >= 1).toBe(true);
  });

  it('has clean alpha: transparent corners, a fully opaque body and no haze', () => {
    for (const f of ['buildings/cottage/cottage_r0.png', 'buildings/cottage/cottage_r0_ground.png']) {
      const img = decodeImage(read(f));
      const st = alphaStats(img);
      expect(st.max, f).toBe(255);
      const a = (x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];
      // Faint pixels may only exist as the anti-aliased edge of the art, never as background haze:
      // everything more than 3 px outside the painted bounds must be fully transparent.
      const b = opaqueBounds(img)!;
      let stray = 0;
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++)
          if (a(x, y) > 0 && (x < b.minX - 3 || x > b.maxX + 3 || y < b.minY - 3 || y > b.maxY + 3)) stray++;
      expect(stray, f).toBe(0);
      // and the raw inputs really had the haze/near-opaque problem that was fixed
      expect(st.haze).toBeLessThan(alphaStats(decodeImage(readFileSync(join(root, 'art-source/raw/levelup_cottage.png')))).haze);
      expect([a(0, 0), a(img.width - 1, 0), a(0, img.height - 1), a(img.width - 1, img.height - 1)]).toEqual([0, 0, 0, 0]);
    }
  });

  it('stands the house on its logical tile', () => {
    const e = applyMeta(cottage, meta);
    const img = decodeImage(read('buildings/cottage/cottage_r0.png'));
    const a = (x: number, y: number) => img.data[(Math.round(y) * img.width + Math.round(x)) * 4 + 3];
    const l = logicalCorners(e.geometry);
    // just inside the tile's front, left and right corners there is painted building/plot
    expect(a(l.bottom.x, l.bottom.y - 6)).toBe(255);
    expect(a(l.left.x + 12, l.left.y)).toBe(255);
    expect(a(l.right.x - 12, l.right.y)).toBe(255);
    // and the anchor (tile centre) is covered by the house
    expect(a(e.geometry.anchor.x, e.geometry.anchor.y)).toBe(255);
  });

  it('has a chimney, lit windows and a top point that sit on painted pixels', () => {
    const e = applyMeta(cottage, meta);
    const img = decodeImage(read('buildings/cottage/cottage_r0.png'));
    const a = (p: { x: number; y: number }) => img.data[(p.y * img.width + p.x) * 4 + 3];
    expect(e.effects?.chimney).toBeTruthy();
    expect(e.effects!.windows!.length).toBeGreaterThanOrEqual(4);
    for (const p of [e.effects!.chimney!, ...e.effects!.windows!]) expect(a(p)).toBeGreaterThan(0);
    expect(e.top!.y).toBe(measureObject(img, e).top.y);
  });

  it('ships WebP files with the same size as their PNG masters and much smaller', () => {
    for (const f of ['buildings/cottage/cottage_r0', 'buildings/cottage/cottage_r0_ground']) {
      const png = read(`${f}.png`);
      const webp = read(`${f}.webp`);
      const pi = readImageInfo(png)!;
      const wi = readImageInfo(webp)!;
      expect([wi.format, wi.width, wi.height, wi.hasAlpha]).toEqual(['webp', pi.width, pi.height, true]);
      expect(webp.length).toBeLessThan(png.length / 2);
    }
  });

  it('is reproducible: re-importing the raw sources with the recorded settings gives identical pixels', () => {
    const m = meta['buildings/cottage/cottage_r0'];
    const imp = m.import as { base: { left: number; right: number; front: number }; baseFill: number; groundRect: never };
    const res = importObject(decodeImage(readFileSync(join(root, 'art-source/raw/levelup_cottage.png'))), cottage, {
      base: imp.base,
      baseFill: imp.baseFill,
      visual: m.visual,
      ground: decodeImage(readFileSync(join(root, 'art-source/raw/levelup_mystic_garden.png'))),
      groundRect: imp.groundRect,
      effectsSource: { chimney: { x: 437, y: 100 } },
    });
    expect(Buffer.from(res.raster.data).equals(Buffer.from(decodeImage(read('buildings/cottage/cottage_r0.png')).data))).toBe(true);
    expect(Buffer.from(res.ground!.data).equals(Buffer.from(decodeImage(read('buildings/cottage/cottage_r0_ground.png')).data))).toBe(true);
    expect(res.meta?.height).toBe(m.height);
    expect(res.meta?.effects?.chimney).toEqual(m.effects?.chimney);
  });
});

describe('import helpers used for the generated art', () => {
  it('cleans generator alpha: removes haze, makes near-opaque bodies opaque, keeps soft edges', () => {
    const r = createRaster(4, 1);
    [2, 120, 252, 0].forEach((a, i) => (r.data[i * 4 + 3] = a));
    cleanAlpha(r);
    expect([r.data[3], r.data[7], r.data[11], r.data[15]]).toEqual([0, 121, 255, 0]);
  });

  it('detects lit windows but not sunlit terracotta roof tiles', () => {
    const e = manifestByKey.get('bld-cottage-r0')!;
    const r = createRaster(e.geometry.canvas.width, e.geometry.canvas.height);
    const paint = (x0: number, y0: number, c: number[]) => {
      for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x0 + 12; x++) r.data.set(c, (y * r.width + x) * 4);
    };
    paint(100, 300, [253, 245, 78, 255]); // lit window (sampled from the cottage)
    paint(200, 200, [251, 172, 118, 255]); // roof highlight (sampled from the cottage)
    paint(150, 150, [251, 207, 150, 255]); // roof edge highlight
    const m = measureObject(r, e);
    expect(m.windows).toHaveLength(1);
    expect(m.windows[0].x).toBeGreaterThanOrEqual(100);
    expect(m.windows[0].x).toBeLessThan(112);
  });

  it('rejects base registration without a visual footprint, or with a ground rect outside it', () => {
    const src = createRaster(100, 100);
    for (let y = 20; y < 90; y++) for (let x = 10; x < 90; x++) src.data.set([180, 120, 90, 255], (y * 100 + x) * 4);
    expect(() => importObject(src, cottage, { base: { left: 10, right: 90, front: 90 } })).toThrow(/needs --visual/);
    expect(() =>
      importObject(src, cottage, {
        base: { left: 10, right: 90, front: 90 },
        visual: { u0: 0, v0: 0, u1: 1, v1: 1 },
        ground: src,
        groundRect: { u0: 0, v0: -1, u1: 1, v1: 0 },
      }),
    ).toThrow(/inside --visual/);
  });
});
