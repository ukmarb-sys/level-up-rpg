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
    opts: {},
  },
  {
    type: 'sawmill' as BuildingType,
    raw: 'sawmill.png',
    file: 'buildings/sawmill/sawmill_r0',
    opts: { effectsSource: { wheel: { x: 438, y: 505 } } },
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
    expect(meta['buildings/farm/farm_r0'].effects ?? {}).toEqual({});
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
