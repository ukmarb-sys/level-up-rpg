import { describe, expect, it } from 'vitest';
import { manifestByKey, terrainKey } from '../src/assets/manifest';
import { diamondCorners } from '../src/assets/spec';
import { decodeImage } from '../scripts/lib/image';
import { importObject, importTerrain, measureObject } from '../scripts/lib/import';
import { encodeRawPng, encodeRgba } from '../scripts/lib/png';
import { createRaster, despeckle, keyOutBackground, opaqueBounds, resize, type Raster } from '../scripts/lib/raster';
import { validateArt } from '../scripts/lib/validate';
import { findEntry } from '../scripts/import-art';
import { fakeAiRender } from './helpers/fixtures';

const entry = (key: string) => manifestByKey.get(key)!;
const errorsAfterImport = (file: string, r: Raster, meta?: object) =>
  validateArt([{ path: `src/assets/art/${file}.png`, data: encodeRgba(r.width, r.height, r.data) }], {
    meta: meta ? { [file]: meta } : {},
  }).issues.filter((i) => i.severity === 'error');

describe('PNG decoding of common tool exports', () => {
  it('decodes 8-bit RGBA, RGB, palette+tRNS, grey+alpha and 16-bit RGBA', () => {
    const rgb = decodeImage(encodeRawPng(2, 1, 2, 8, [Buffer.from([255, 0, 0, 0, 0, 255])]));
    expect([...rgb.data]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    expect(rgb.hasAlpha).toBe(false);

    const pal = decodeImage(
      encodeRawPng(2, 1, 3, 8, [Buffer.from([0, 1])], [
        { type: 'PLTE', data: Buffer.from([10, 20, 30, 40, 50, 60]) },
        { type: 'tRNS', data: Buffer.from([0]) },
      ]),
    );
    expect([...pal.data]).toEqual([10, 20, 30, 0, 40, 50, 60, 255]);
    expect(pal.hasAlpha).toBe(true);

    const ga = decodeImage(encodeRawPng(1, 1, 4, 8, [Buffer.from([200, 128])]));
    expect([...ga.data]).toEqual([200, 200, 200, 128]);

    const rgba16 = decodeImage(encodeRawPng(1, 1, 6, 16, [Buffer.from([0xff, 0x00, 0x80, 0x00, 0x00, 0x00, 0x40, 0x00])]));
    expect([...rgba16.data]).toEqual([255, 128, 0, 64]);
  });

  it('rejects files it cannot handle with a clear message', () => {
    expect(() => decodeImage(Buffer.from('RIFF....WEBPVP8 '))).toThrow(/Not a PNG/);
    const interlaced = encodeRawPng(1, 1, 6, 8, [Buffer.alloc(4)]);
    interlaced[8 + 8 + 12] = 1; // IHDR interlace byte
    expect(() => decodeImage(interlaced)).toThrow(/Interlaced/);
  });
});

describe('raster helpers', () => {
  it('resizes with premultiplied alpha so edges keep their colour (no dark fringe)', () => {
    const src = createRaster(8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) src.data.set([255, 255, 255, 255], (y * 8 + x) * 4);
    const out = resize(src, 3, 3);
    const edge = out.data.subarray((1 * 3 + 1) * 4, (1 * 3 + 1) * 4 + 4); // half-covered pixel
    expect(edge[3]).toBeGreaterThan(60);
    expect(edge[3]).toBeLessThan(200);
    expect([edge[0], edge[1], edge[2]]).toEqual([255, 255, 255]);
  });

  it('keys out a fake checkerboard background but keeps the subject', () => {
    const r = fakeAiRender({ footprint: { w: 1, d: 1 }, tile: 200, canvas: { width: 400, height: 400 }, background: 'checker' });
    expect(opaqueBounds(r)).toEqual({ minX: 0, minY: 0, maxX: 399, maxY: 399 });
    keyOutBackground(r);
    const b = opaqueBounds(r)!;
    expect(b.minX).toBeGreaterThan(50);
    expect(b.maxX).toBeLessThan(350);
    expect(r.data[3]).toBe(0);
  });

  it('removes tiny specks but keeps detached parts such as a floating orb', () => {
    const r = createRaster(200, 200);
    const fill = (x0: number, y0: number, s: number) => {
      for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) r.data.set([200, 200, 200, 255], (y * 200 + x) * 4);
    };
    fill(20, 60, 120); // building
    fill(70, 10, 30); // orb (900 px)
    fill(190, 190, 2); // speck
    expect(despeckle(r)).toBe(4);
    expect(r.data[(20 * 200 + 80) * 4 + 3]).toBe(255);
  });
});

describe('importing generator output as building sprites', () => {
  it('imports a mirrored farm on a fake checkerboard with specks, aligned to the footprint', () => {
    const raw = fakeAiRender({ footprint: { w: 2, d: 3 }, tile: 260, background: 'checker', mirror: true, specks: true, offset: { x: -60, y: 40 } });
    const res = importObject(raw, entry('bld-farm-r0'));
    expect(res.raster.width).toBe(704);
    expect(res.raster.height).toBe(512);
    expect(res.meta?.import).toMatchObject({ mirrored: true });
    expect(res.warnings.some((w) => /Mirrored/.test(w))).toBe(true);
    expect(errorsAfterImport('buildings/farm/farm_r0', res.raster, res.meta)).toEqual([]);
    // lowest painted pixel sits on the footprint's front corner
    const c = diamondCorners(entry('bld-farm-r0').geometry);
    expect(opaqueBounds(res.raster)!.maxY).toBe(c.bottom.y);
  });

  it('does not mirror when told not to, and the validator then flags the orientation', () => {
    const raw = fakeAiRender({ footprint: { w: 2, d: 3 }, tile: 260, mirror: true });
    const res = importObject(raw, entry('bld-farm-r0'), { mirror: false });
    expect(errorsAfterImport('buildings/farm/farm_r0', res.raster, res.meta).some((e) => /mirrored/.test(e.message))).toBe(true);
  });

  it('imports a cottage on white, detects the lit window and asks for the chimney by hand', () => {
    const raw = fakeAiRender({ footprint: { w: 1, d: 1 }, tile: 520, background: 'white', offset: { x: 80, y: -50 } });
    const res = importObject(raw, entry('bld-cottage-r0'));
    expect(res.meta?.effects?.windows).toHaveLength(1);
    expect(res.meta?.effects?.chimney).toBeNull();
    expect(res.manual).toEqual(['chimney']);
    const top = res.meta!.top!;
    expect(top.y).toBe(opaqueBounds(res.raster)!.minY);
    expect(errorsAfterImport('buildings/cottage/cottage_r0', res.raster, res.meta)).toEqual([]);
  });

  it('keeps and detects the floating orb of a mage tower and measures the top above it', () => {
    const raw = fakeAiRender({ footprint: { w: 2, d: 2 }, tile: 300, wallHeight: 700, orb: true, canvas: { width: 1024, height: 1536 } });
    const res = importObject(raw, entry('bld-mageTower-r0'));
    const orb = res.meta!.effects!.orb!;
    expect(orb).toBeTruthy();
    expect(Math.abs(orb.x - 288)).toBeLessThan(6);
    expect(res.meta!.top!.y).toBeLessThan(orb.y);
    expect(res.manual).toEqual([]);
    expect(errorsAfterImport('buildings/mageTower/mageTower_r0', res.raster, res.meta)).toEqual([]);
  });

  it('grows the canvas for tall building art and records the height', () => {
    const raw = fakeAiRender({ footprint: { w: 1, d: 1 }, tile: 300, wallHeight: 1200, canvas: { width: 800, height: 1700 } });
    const res = importObject(raw, entry('bld-cottage-r0'));
    expect(res.meta?.height).toBeGreaterThan(448);
    expect(res.meta!.height! % 32).toBe(0);
    expect(res.raster.height).toBe(res.meta!.height);
    expect(res.notes.some((n) => /Canvas height grown 448/.test(n))).toBe(true);
    expect(errorsAfterImport('buildings/cottage/cottage_r0', res.raster, res.meta)).toEqual([]);
  });

  it('shrinks tall art instead when auto height is off, and says so', () => {
    const raw = fakeAiRender({ footprint: { w: 1, d: 1 }, tile: 300, wallHeight: 1200, canvas: { width: 800, height: 1700 } });
    const res = importObject(raw, entry('bld-cottage-r0'), { autoHeight: false });
    expect(res.warnings.some((w) => /too tall/.test(w))).toBe(true);
    expect(res.meta?.height).toBeUndefined();
    expect(opaqueBounds(res.raster)!.minY).toBeGreaterThanOrEqual(2);
    // It no longer spans the footprint, which the validator must point out.
    const errs = errorsAfterImport('buildings/cottage/cottage_r0', res.raster, res.meta);
    expect(errs.map((e) => e.message)).toEqual([expect.stringMatching(/wrong footprint size or scale/)]);
  });

  it('warns when the source is too small and must be upscaled', () => {
    const raw = fakeAiRender({ footprint: { w: 1, d: 1 }, tile: 80, canvas: { width: 200, height: 200 } });
    expect(importObject(raw, entry('bld-cottage-r0')).warnings.some((w) => /upscaled/.test(w))).toBe(true);
  });

  it('honours manual effect points and offsets', () => {
    const raw = fakeAiRender({ footprint: { w: 2, d: 1 }, tile: 260 });
    const res = importObject(raw, entry('bld-sawmill-r0'), { effects: { wheel: { x: 250, y: 300 } }, offsetY: 8 });
    expect(res.meta?.effects?.wheel).toEqual({ x: 250, y: 300 });
    expect(res.manual).toEqual([]);
    expect(opaqueBounds(res.raster)!.maxY).toBe(448 - 32 + 8);
  });

  it('refuses an image with no recoverable transparency', () => {
    const noise = createRaster(300, 300);
    for (let i = 0; i < noise.data.length; i += 4) noise.data.set([(i * 7) % 255, (i * 13) % 255, (i * 3) % 255, 255], i);
    expect(() => importObject(noise, entry('bld-cottage-r0'), { key: 'off' })).toThrow(/no transparent background/);
  });

  it('measures already-aligned art', () => {
    const raw = fakeAiRender({ footprint: { w: 1, d: 1 }, tile: 520, background: 'white' });
    const res = importObject(raw, entry('bld-cottage-r0'));
    expect(measureObject(res.raster, entry('bld-cottage-r0')).top).toEqual(res.meta!.top);
  });
});

describe('importing terrain', () => {
  const periodic = (n: number) => {
    const r = createRaster(n, n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = 128 + 60 * Math.sin((2 * Math.PI * x) / n) + 40 * Math.cos((4 * Math.PI * y) / n);
        r.data.set([40, Math.round(v), 50, 255], (y * n + x) * 4);
      }
    return r;
  };

  it('projects a seamless square texture into a valid, seamless iso tile', () => {
    const res = importTerrain(periodic(256), entry(terrainKey(0)));
    expect(errorsAfterImport('terrain/grass_0', res.raster)).toEqual([]);
    // pixels just inside opposite edges of the diamond match (neighbour tiles meet without seams)
    const at = (a: number, b: number) => {
      const x = Math.round(128 + 128 * a - 128 * b);
      const y = Math.round(64 * a + 64 * b);
      return res.raster.data[(y * 256 + x) * 4 + 1];
    };
    for (const t of [0.3, 0.5, 0.7]) {
      expect(Math.abs(at(0.985, t) - at(0.015, t))).toBeLessThan(14);
      expect(Math.abs(at(t, 0.985) - at(t, 0.015))).toBeLessThan(14);
    }
  });

  it('fits a painted diamond on a white background', () => {
    const r = createRaster(600, 320);
    for (let y = 0; y < 320; y++)
      for (let x = 0; x < 600; x++) {
        const inside = Math.abs(x - 300) / 280 + Math.abs(y - 160) / 140 <= 1;
        r.data.set(inside ? [70, 140, 60, 255] : [255, 255, 255, 255], (y * 600 + x) * 4);
      }
    const res = importTerrain(r, entry(terrainKey(1)));
    expect(errorsAfterImport('terrain/grass_1', res.raster)).toEqual([]);
  });
});

it('the CLI resolves short and full asset names', () => {
  expect(findEntry('cottage_r0')?.key).toBe('bld-cottage-r0');
  expect(findEntry('buildings/farm/farm_r1.png')?.key).toBe('bld-farm-r1');
  expect(findEntry('grass_2')?.key).toBe('terrain-grass-2');
  expect(findEntry('tree_pine')?.key).toBe('prop-treePine');
  expect(findEntry('dragonLair_r0')).toBeUndefined();
});
