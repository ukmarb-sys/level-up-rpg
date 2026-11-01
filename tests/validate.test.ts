import { describe, expect, it } from 'vitest';
import { decodePng, readImageInfo } from '../scripts/lib/image';
import { validateArt } from '../scripts/lib/validate';
import { alignedObjectPng, alignedTilePng } from './helpers/fixtures';
import { encodePng } from '../scripts/lib/png';

const art = (file: string, data: Buffer) => ({ path: `src/assets/art/${file}`, data });
const errorsFor = (file: string, data: Buffer) =>
  validateArt([art(file, data)]).issues.filter((i) => i.severity === 'error' && i.file.includes(file));

describe('image header parsing', () => {
  it('reads PNG size and alpha, and round-trips pixels', () => {
    const png = encodePng(5, 3, (x, y) => (x === 4 && y === 2 ? [1, 2, 3, 200] : null));
    expect(readImageInfo(png)).toMatchObject({ format: 'png', width: 5, height: 3, hasAlpha: true });
    const img = decodePng(png)!;
    expect(img.alpha(4, 2)).toBe(200);
    expect(img.alpha(0, 0)).toBe(0);
  });

  it('reads WebP VP8X / VP8L headers', () => {
    const vp8x = Buffer.alloc(30);
    vp8x.write('RIFF', 0);
    vp8x.write('WEBP', 8);
    vp8x.write('VP8X', 12);
    vp8x[20] = 0x10;
    vp8x.writeUIntLE(319, 24, 3);
    vp8x.writeUIntLE(447, 27, 3);
    expect(readImageInfo(vp8x)).toEqual({ format: 'webp', width: 320, height: 448, hasAlpha: true });
    const vp8l = Buffer.alloc(30);
    vp8l.write('RIFF', 0);
    vp8l.write('WEBP', 8);
    vp8l.write('VP8L', 12);
    vp8l.writeUInt32LE(255 | (127 << 14) | (1 << 28), 21);
    expect(readImageInfo(vp8l)).toEqual({ format: 'webp', width: 256, height: 128, hasAlpha: true });
  });
});

describe('asset validation', () => {
  it('reports missing required art as warnings (or errors in strict mode)', () => {
    const lax = validateArt([]);
    expect(lax.missingRequired).toHaveLength(5);
    expect(lax.issues.every((i) => i.severity === 'warning')).toBe(true);
    const strict = validateArt([], { strict: true });
    expect(strict.issues.filter((i) => i.severity === 'error')).toHaveLength(5);
  });

  it('accepts correctly aligned building, terrain and prop images', () => {
    const files = [
      art('buildings/farm/farm_r0.png', alignedObjectPng('bld-farm-r0')),
      art('buildings/farm/farm_r1.png', alignedObjectPng('bld-farm-r1')),
      art('buildings/cottage/cottage_r0.png', alignedObjectPng('bld-cottage-r0')),
      art('terrain/grass_0.png', alignedTilePng()),
      art('props/rock_mossy.png', alignedObjectPng('prop-rockMossy')),
    ];
    const report = validateArt(files);
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(report.matched).toHaveLength(5);
  });

  it('rejects unknown files and misspelled names', () => {
    const report = validateArt([art('buildings/dragonLair/dragonLair_r0.png', alignedObjectPng('bld-cottage-r0')), art('buildings/cottage/Cottage-R0.png', alignedObjectPng('bld-cottage-r0'))]);
    expect(report.issues.filter((i) => i.message.includes('Not in the asset manifest'))).toHaveLength(2);
  });

  it('rejects an image sized for a different footprint', () => {
    // a cottage-sized (1x1) image saved as the 2x2 mage tower
    const errs = errorsFor('buildings/mageTower/mageTower_r0.png', alignedObjectPng('bld-cottage-r0'));
    expect(errs[0].message).toMatch(/Wrong size 320x448; expected 576x1024 for a 2x2 footprint/);
  });

  it('rejects art painted for a smaller footprint on the right canvas', () => {
    // the sawmill (2x1) canvas is 448 wide; paint only a 1x1 diamond in the middle
    const cottage = alignedObjectPng('bld-cottage-r0');
    const decoded = decodePng(cottage)!;
    const narrow = encodePng(448, 448, (x, y) => {
      const sx = x - 64;
      return sx >= 0 && sx < 320 && decoded.alpha(sx, y) > 0 ? [100, 100, 100, 255] : null;
    });
    const errs = errorsFor('buildings/sawmill/sawmill_r0.png', narrow);
    expect(errs.some((e) => /wrong footprint size or scale/.test(e.message))).toBe(true);
  });

  it('detects art drawn for the other orientation of a non-square footprint', () => {
    const errs = errorsFor('buildings/farm/farm_r0.png', alignedObjectPng('bld-farm-r0', { mirror: true }));
    expect(errs.some((e) => /mirrored or drawn for the other rotation/.test(e.message))).toBe(true);
  });

  it('detects artwork that sits below the anchor or floats above it', () => {
    const low = errorsFor('buildings/cottage/cottage_r0.png', alignedObjectPng('bld-cottage-r0', { shiftY: 28 }));
    expect(low.some((e) => /below the footprint's front corner|touches the canvas edge/.test(e.message))).toBe(true);
    const high = errorsFor('buildings/cottage/cottage_r0.png', alignedObjectPng('bld-cottage-r0', { shiftY: -90 }));
    expect(high.some((e) => /floats/.test(e.message))).toBe(true);
  });

  it('rejects images without transparency or with a background', () => {
    const rgb = encodePng(320, 448, () => [10, 20, 30, 255], 2);
    expect(errorsFor('buildings/cottage/cottage_r0.png', rgb)[0].message).toMatch(/alpha channel/);
    const filled = encodePng(320, 448, () => [10, 20, 30, 255]);
    expect(errorsFor('buildings/cottage/cottage_r0.png', filled).some((e) => /Corners are not transparent/.test(e.message))).toBe(true);
  });

  it('rejects terrain tiles that are not a clean, opaque diamond', () => {
    const square = encodePng(256, 128, () => [80, 150, 70, 255]);
    expect(errorsFor('terrain/grass_1.png', square).some((e) => /outside the tile diamond/.test(e.message))).toBe(true);
    const holey = encodePng(256, 128, (x, y) => (Math.abs(x - 128) / 128 + Math.abs(y - 64) / 64 < 0.7 ? [80, 150, 70, 255] : null));
    expect(errorsFor('terrain/grass_1.png', holey).some((e) => /fully opaque edge to edge/.test(e.message))).toBe(true);
  });

  it('warns when both WebP and PNG exist for one asset', () => {
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0);
    webp.write('WEBP', 8);
    webp.write('VP8X', 12);
    webp[20] = 0x10;
    webp.writeUIntLE(319, 24, 3);
    webp.writeUIntLE(447, 27, 3);
    const report = validateArt([art('buildings/cottage/cottage_r0.png', alignedObjectPng('bld-cottage-r0')), art('buildings/cottage/cottage_r0.webp', webp)]);
    expect(report.issues.some((i) => /Both WebP and PNG/.test(i.message))).toBe(true);
  });
});
