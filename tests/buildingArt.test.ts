/**
 * The painted farm, sawmill and mage tower (art-source/raw/buildings → src/assets/art/buildings):
 * reproducible imports, unchanged gameplay footprints and costs, artwork registered to the
 * logical footprint, clean alpha, and effect points on the painting.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/core/buildings';
import type { BuildingType } from '../src/core/types';
import { manifestByKey } from '../src/assets/manifest';
import { applyMeta, type ArtMeta } from '../src/assets/meta';
import { resolveBuildingSprite } from '../src/assets/resolve';
import { diamondCorners } from '../src/assets/spec';
import { decodeImage, readImageInfo } from '../scripts/lib/image';
import { importObject } from '../scripts/lib/import';
import { removeSliceFragments, translucentBodyShare, type Raster } from '../scripts/lib/raster';

const root = new URL('..', import.meta.url).pathname;
const art = join(root, 'src/assets/art');
const meta = JSON.parse(readFileSync(join(art, 'art-meta.json'), 'utf8')) as ArtMeta;
const A = (r: Raster) => (x: number, y: number) => r.data[(y * r.width + x) * 4 + 3];

const CASES = [
  {
    type: 'farm' as BuildingType,
    raw: 'farm.png',
    file: 'buildings/farm/farm_r0',
    opts: {
      effects: {
        chimney: { x: 510, y: 122 },
        windows: [{ x: 437, y: 219 }, { x: 562, y: 224 }, { x: 404, y: 286 }, { x: 547, y: 299 }, { x: 485, y: 296 }, { x: 356, y: 390 }],
        butterflies: [{ x: 203, y: 367 }, { x: 300, y: 330 }, { x: 585, y: 330 }, { x: 413, y: 460 }],
      },
    },
  },
  {
    type: 'sawmill' as BuildingType,
    raw: 'sawmill.png',
    file: 'buildings/sawmill/sawmill_r0',
    opts: {
      effectsSource: { wheel: { x: 438, y: 505 } },
      effects: { chimney: { x: 278, y: 155 }, windows: [{ x: 215, y: 203 }, { x: 339, y: 236 }, { x: 178, y: 281 }, { x: 365, y: 287 }] },
    },
  },
  {
    type: 'mageTower' as BuildingType,
    raw: 'mage_tower.png',
    file: 'buildings/mageTower/mageTower_r0',
    opts: {
      keepIslands: true,
      effects: {
        windows: [
          { x: 332, y: 632 },
          { x: 255, y: 642 },
          { x: 170, y: 731 },
          { x: 184, y: 854 },
          { x: 302, y: 880 },
        ],
        sparkles: [{ x: 129, y: 842 }, { x: 447, y: 876 }, { x: 414, y: 755 }, { x: 244, y: 870 }, { x: 368, y: 880 }],
      },
    },
  },
  {
    // painted for the 1x2 orientation: the importer mirrors it so the long forge front lies on
    // the long edge of the 2x1 footprint (input-pixel effect points are mirrored with it)
    type: 'blacksmith' as BuildingType,
    raw: 'blacksmith.png',
    file: 'buildings/blacksmith/blacksmith_r0',
    opts: {
      effectsSource: {
        chimney: { x: 858, y: 195 },
        windows: [
          { x: 777, y: 790 },
          { x: 745, y: 838 },
          { x: 828, y: 649 },
          { x: 487, y: 755 },
          { x: 369, y: 547 },
        ],
      },
    },
  },
];

const entryOf = (type: BuildingType) => applyMeta(manifestByKey.get(`bld-${type}-r0`)!, meta);
const master = (file: string) => decodeImage(readFileSync(join(art, `${file}.png`)));

describe('painted farm, sawmill and mage tower', () => {
  it('keeps gameplay footprints and costs exactly as before', () => {
    expect([BUILDINGS.farm.width, BUILDINGS.farm.depth]).toEqual([2, 3]);
    expect([BUILDINGS.sawmill.width, BUILDINGS.sawmill.depth]).toEqual([2, 1]);
    expect([BUILDINGS.mageTower.width, BUILDINGS.mageTower.depth]).toEqual([2, 2]);
    expect(BUILDINGS.farm.cost).toEqual({ wood: 30, stone: 0, magic: 0 });
    expect(BUILDINGS.sawmill.cost).toEqual({ wood: 40, stone: 20, magic: 0 });
    expect(BUILDINGS.mageTower.cost).toEqual({ wood: 50, stone: 80, magic: 30 });
    expect([BUILDINGS.blacksmith.width, BUILDINGS.blacksmith.depth]).toEqual([2, 1]);
    expect(BUILDINGS.blacksmith.cost).toEqual({ wood: 60, stone: 20, magic: 0 });
    expect(BUILDINGS.blacksmith.produces).toEqual({ stone: 3 });
    expect(BUILDINGS.blacksmith.requires).toEqual(['sawmill']);
    for (const c of CASES) {
      const g = entryOf(c.type).geometry;
      // no visual overhang declared: the art is fitted to the logical footprint
      expect(g.visual.w, c.type).toBe(g.footprint.w);
      expect(g.visual.d, c.type).toBe(g.footprint.d);
    }
  });

  it('ships PNG masters and WebPs at the spec canvas (farm grown in height only)', () => {
    for (const c of CASES) {
      const g = entryOf(c.type).geometry;
      for (const ext of ['png', 'webp']) {
        const info = readImageInfo(readFileSync(join(art, `${c.file}.${ext}`)))!;
        expect([info.width, info.height, info.hasAlpha], `${c.file}.${ext}`).toEqual([g.canvas.width, g.canvas.height, true]);
      }
    }
    expect(entryOf('farm').geometry.canvas).toEqual({ width: 704, height: 544 });
    expect(entryOf('sawmill').geometry.canvas).toEqual({ width: 448, height: 448 });
    expect(entryOf('mageTower').geometry.canvas).toEqual({ width: 576, height: 1024 });
    expect(entryOf('blacksmith').geometry.canvas).toEqual({ width: 448, height: 448 });
  });

  it('is reproducible from the raw sources with the documented settings', () => {
    for (const c of CASES) {
      expect(existsSync(join(root, 'art-source/raw/buildings', c.raw))).toBe(true);
      const res = importObject(decodeImage(readFileSync(join(root, 'art-source/raw/buildings', c.raw))), manifestByKey.get(`bld-${c.type}-r0`)!, c.opts);
      expect(Buffer.from(res.raster.data).equals(Buffer.from(master(c.file).data)), c.file).toBe(true);
      expect(res.meta?.effects, c.file).toEqual(meta[c.file].effects);
    }
  });

  it('keeps the artwork within the footprint horizontally (no overlap of side neighbours)', () => {
    for (const c of CASES) {
      const r = master(c.file);
      const k = diamondCorners(entryOf(c.type).geometry);
      let minX = r.width;
      let maxX = -1;
      for (let y = 0; y < r.height; y++) {
        for (let x = 0; x < r.width; x++) {
          if (A(r)(x, y) <= 16) continue;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
      expect(minX, c.type).toBeGreaterThanOrEqual(k.left.x - 8);
      expect(maxX, c.type).toBeLessThanOrEqual(k.right.x + 8);
    }
  });

  it('has clean alpha and no sprite-sheet slivers', () => {
    for (const c of CASES) {
      const r = master(c.file);
      expect(translucentBodyShare(r.width, r.height, A(r)), c.file).toBeLessThan(0.01);
      expect(removeSliceFragments({ ...r, data: new Uint8Array(r.data) }), c.file).toBe(0);
      for (const [x, y] of [[0, 0], [r.width - 1, 0], [0, r.height - 1], [r.width - 1, r.height - 1]]) expect(A(r)(x, y)).toBe(0);
    }
  });

  it('puts the effect points on the painting: sawdust at the blade, tower windows and crystal', () => {
    const saw = master('buildings/sawmill/sawmill_r0');
    const wheel = meta['buildings/sawmill/sawmill_r0'].effects!.wheel!;
    expect(A(saw)(wheel.x, wheel.y)).toBe(255);
    const tower = master('buildings/mageTower/mageTower_r0');
    const fx = meta['buildings/mageTower/mageTower_r0'].effects!;
    expect(fx.windows).toHaveLength(5);
    for (const w of fx.windows!) {
      const i = (w.y * tower.width + w.x) * 4;
      // warm lit window or lantern: red and green high, blue low
      expect(tower.data[i] > 200 && tower.data[i + 1] > 110 && tower.data[i + 2] < 160, `${w.x},${w.y}`).toBe(true);
    }
    expect(fx.orb!.y).toBeLessThan(500); // the floating crystal at the top of the spire
    expect(fx.sparkles).toHaveLength(5);
    for (const p of fx.sparkles!) expect(A(tower)(p.x, p.y), `sparkle ${p.x},${p.y}`).toBe(255);
    // farm and sawmill: chimney smoke from the painted chimney tops, lit windows, farm butterflies
    for (const f of ['buildings/farm/farm_r0', 'buildings/sawmill/sawmill_r0']) {
      const r = master(f);
      const e = meta[f].effects!;
      expect(e.chimney, f).toBeTruthy();
      expect(A(r)(e.chimney!.x, e.chimney!.y + 4), f).toBe(255); // smoke starts on the chimney
      expect(e.windows!.length, f).toBeGreaterThanOrEqual(4);
    }
    expect(meta['buildings/farm/farm_r0'].effects!.butterflies).toHaveLength(4);
  });

  it('lights the blacksmith forge, lanterns and window and smokes its chimney', () => {
    const f = 'buildings/blacksmith/blacksmith_r0';
    const r = master(f);
    const e = meta[f].effects!;
    expect(meta[f].import).toMatchObject({ mirrored: true });
    // smoke starts on the painted chimney top
    expect(A(r)(e.chimney!.x, e.chimney!.y + 4)).toBe(255);
    expect(e.chimney!.y).toBeLessThan(100);
    expect(e.windows).toHaveLength(5);
    for (const w of e.windows!) {
      const i = (w.y * r.width + w.x) * 4;
      // firelight: warm (red and green high, blue low) or a white-hot lantern core
      const [R, G, B] = [r.data[i], r.data[i + 1], r.data[i + 2]];
      expect(R > 200 && G > 100 && (B < 160 || R + G + B > 720), `${w.x},${w.y}`).toBe(true);
    }
  });

  it('uses the painted r0 for every rotation until directional art exists (mirrored where needed)', () => {
    const has = (k: string) => ['bld-farm-r0', 'bld-sawmill-r0', 'bld-mageTower-r0'].includes(k);
    for (const type of ['farm', 'sawmill', 'mageTower'] as BuildingType[]) {
      for (const rot of [0, 1, 2, 3] as const) {
        const choice = resolveBuildingSprite(type, rot, has);
        expect(choice?.key, `${type} r${rot}`).toBe(`bld-${type}-r0`);
      }
    }
  });
});
