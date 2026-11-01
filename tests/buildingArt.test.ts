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

type Rect = { x0: number; y0: number; x1: number; y1: number };

/**
 * Paintings that came with a static smoke plume painted above the chimney. On import the plume
 * is erased (output px), a pale smoke stub left inside the chimney mouth is retouched from the
 * pixels beside it, and the game animates smoke from the mouth instead.
 */
const SMOKE_FIX: Record<'tavern' | 'farm' | 'alchemist', { erase: Rect[]; inpaint: Rect[]; chimney: { x: number; y: number } }> = {
  tavern: { erase: [{ x0: 170, y0: 100, x1: 300, y1: 187 }], inpaint: [], chimney: { x: 222, y: 191 } },
  farm: { erase: [{ x0: 470, y0: 20, x1: 552, y1: 118 }], inpaint: [{ x0: 503, y0: 121, x1: 511, y1: 126 }], chimney: { x: 510, y: 122 } },
  alchemist: {
    // the plume, then the smoke that covered the cap's back rim trimmed to the rim's peaked outline
    erase: [
      { x0: 305, y0: 150, x1: 420, y1: 221 },
      { x0: 305, y0: 221, x1: 330, y1: 222 },
      { x0: 340, y0: 221, x1: 420, y1: 222 },
      { x0: 305, y0: 222, x1: 326, y1: 223 },
      { x0: 344, y0: 222, x1: 420, y1: 223 },
    ],
    inpaint: [{ x0: 328, y0: 223, x1: 337, y1: 227 }],
    chimney: { x: 332, y: 225 },
  },
};
const inRects = (rects: Rect[], x: number, y: number) => rects.some((q) => x >= q.x0 && x < q.x1 && y >= q.y0 && y < q.y1);

const CASES = [
  {
    type: 'farm' as BuildingType,
    raw: 'farm.png',
    file: 'buildings/farm/farm_r0',
    opts: {
      erase: SMOKE_FIX.farm.erase,
      inpaint: SMOKE_FIX.farm.inpaint,
      effects: {
        chimney: SMOKE_FIX.farm.chimney,
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
  {
    // Square 2x2 footprint, entrance (open shop porch) already on the front-left face: no mirror.
    // The painted (static) smoke is removed and the game animates delicate smoke at the mouth.
    type: 'alchemist' as BuildingType,
    raw: 'alchemist.png',
    file: 'buildings/alchemist/alchemist_r0',
    opts: {
      erase: SMOKE_FIX.alchemist.erase,
      inpaint: SMOKE_FIX.alchemist.inpaint,
      effects: {
        chimney: SMOKE_FIX.alchemist.chimney,
        windows: [
          { x: 262, y: 296 },
          { x: 366, y: 428 },
          { x: 305, y: 500 },
          { x: 221, y: 389 },
        ],
        sparkles: [
          { x: 305, y: 418 },
          { x: 247, y: 466 },
          { x: 397, y: 346 },
          { x: 150, y: 428 },
        ],
      },
    },
  },
  {
    // Square 2x2 footprint. The door and patio face front-right, but the painting is lit from
    // the top-left like the rest of the village, so it is NOT mirrored (mirroring would flip the
    // light); r1/r3 (mirrored r0) show the door front-left. The generator painted a static smoke
    // plume above the chimney: it is erased (output px) and the game animates smoke at the mouth.
    type: 'tavern' as BuildingType,
    raw: 'tavern.png',
    file: 'buildings/tavern/tavern_r0',
    opts: {
      mirror: false,
      erase: SMOKE_FIX.tavern.erase,
      effects: {
        chimney: SMOKE_FIX.tavern.chimney,
        windows: [
          { x: 271, y: 313 },
          { x: 370, y: 301 },
          { x: 171, y: 444 },
          { x: 87, y: 411 },
          { x: 342, y: 513 },
          { x: 445, y: 491 },
        ],
      },
    },
  },
];

const entryOf = (type: BuildingType) => applyMeta(manifestByKey.get(`bld-${type}-r0`)!, meta);
const master = (file: string) => decodeImage(readFileSync(join(art, `${file}.png`)));

describe('painted farm, sawmill, mage tower, blacksmith, alchemist and tavern', () => {
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
    expect([BUILDINGS.alchemist.width, BUILDINGS.alchemist.depth]).toEqual([2, 2]);
    expect(BUILDINGS.alchemist.cost).toEqual({ wood: 60, stone: 50, magic: 40 });
    expect(BUILDINGS.alchemist.produces).toEqual({ magic: 4 });
    expect(BUILDINGS.alchemist.requires).toEqual(['mageTower']);
    expect(BUILDINGS.alchemist.tier).toBe(3);
    expect(BUILDINGS.alchemist.limit).toBeUndefined();
    expect([BUILDINGS.tavern.width, BUILDINGS.tavern.depth]).toEqual([2, 2]);
    expect(BUILDINGS.tavern.cost).toEqual({ wood: 80, stone: 30, magic: 0 });
    expect(BUILDINGS.tavern.produces).toEqual({});
    expect(BUILDINGS.tavern.boosts).toEqual({ all: 0.1 });
    expect(BUILDINGS.tavern.requires).toEqual(['cottage', 'farm']);
    expect(BUILDINGS.tavern.limit).toBe(1);
    expect(BUILDINGS.tavern.tier).toBe(2);
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
    expect(entryOf('alchemist').geometry.canvas).toEqual({ width: 576, height: 640 });
    expect(entryOf('tavern').geometry.canvas).toEqual({ width: 576, height: 640 });
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

  it('lights the alchemist windows and sparkles its potions', () => {
    const f = 'buildings/alchemist/alchemist_r0';
    const r = master(f);
    const e = entryOf('alchemist').effects!;
    expect(meta[f].import).toMatchObject({ mirrored: false });
    expect(e.windows).toHaveLength(4);
    for (const w of e.windows!) {
      const i = (w.y * r.width + w.x) * 4;
      // warm lit window, lantern or kiln: red and green high, blue low (or white-hot)
      const [R, G, B] = [r.data[i], r.data[i + 1], r.data[i + 2]];
      expect(R > 200 && G > 100 && (B < 160 || R + G + B > 720), `${w.x},${w.y}`).toBe(true);
    }
    expect(e.sparkles).toHaveLength(4);
    for (const p of e.sparkles!) {
      const i = (p.y * r.width + p.x) * 4;
      // on the glowing green glass: opaque, green the strongest channel
      expect(r.data[i + 3], `sparkle ${p.x},${p.y}`).toBe(255);
      expect(r.data[i + 1] > r.data[i] && r.data[i + 1] > r.data[i + 2] && r.data[i + 1] > 170, `sparkle ${p.x},${p.y}`).toBe(true);
    }
    // the base's front corner sits on the footprint's front corner
    const k = diamondCorners(entryOf('alchemist').geometry);
    let low = 0;
    for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) if (A(r)(x, y) > 128) low = y;
    expect(Math.abs(low - k.bottom.y)).toBeLessThanOrEqual(2);
  });

  for (const type of ['tavern', 'farm', 'alchemist'] as const) {
    const f = `buildings/${type}/${type}_r0`;
    const fix = SMOKE_FIX[type];

    it(`animates the ${type} chimney smoke from the chimney mouth, with no painted plume left`, () => {
      const r = master(f);
      const c = entryOf(type).effects!.chimney!;
      expect(c).toEqual(fix.chimney);
      expect(meta[f].effects!.chimney).toEqual(c);
      expect(A(r)(c.x, c.y)).toBe(255); // inside the chimney mouth
      expect(A(r)(c.x, c.y + 4)).toBe(255); // the cap stones just below
      expect(A(r)(c.x, c.y - 8)).toBe(0); // open sky above the mouth: the smoke rises freely
      // the mouth is dark again (no pale smoke stub left in it)
      const i = (c.y * r.width + c.x) * 4;
      expect(0.3 * r.data[i] + 0.59 * r.data[i + 1] + 0.11 * r.data[i + 2], 'mouth luminance').toBeLessThan(110);
      // no painted plume: nothing left where it was, so the animated smoke is never doubled
      for (const q of fix.erase) for (let y = q.y0; y < q.y1; y++) for (let x = q.x0; x < q.x1; x++) expect(A(r)(x, y), `${x},${y}`).toBe(0);
      // the selection marker sits on the roof, not on top of a smoke plume
      expect(meta[f].top!.y).toBeGreaterThan(c.y - 45);
    });

    it(`changes only the ${type} smoke pixels: every other pixel is exactly as imported before`, () => {
      const raw = decodeImage(readFileSync(join(root, `art-source/raw/buildings/${type}.png`)));
      const opts = CASES.find((k) => k.type === type)!.opts;
      const plain = importObject(raw, manifestByKey.get(`bld-${type}-r0`)!, { ...opts, erase: undefined, inpaint: undefined }).raster;
      const r = master(f);
      let erased = 0;
      for (let y = 0; y < r.height; y++) {
        for (let x = 0; x < r.width; x++) {
          const i = (y * r.width + x) * 4;
          if (inRects(fix.erase, x, y)) {
            if (plain.data[i + 3] > 0) erased++;
            continue;
          }
          if (inRects(fix.inpaint, x, y)) continue;
          for (let k = 0; k < 4; k++) if (r.data[i + k] !== plain.data[i + k]) throw new Error(`${type}: pixel ${x},${y} changed outside the smoke areas`);
        }
      }
      expect(erased).toBeGreaterThan(2000); // the plume really was there and is gone
      // the retouched mouth area is tiny (a few dozen px)
      const retouched = fix.inpaint.reduce((n, q) => n + (q.x1 - q.x0) * (q.y1 - q.y0), 0);
      expect(retouched).toBeLessThanOrEqual(40);
    });
  }

  it('lights the tavern windows and lanterns', () => {
    const f = 'buildings/tavern/tavern_r0';
    const r = master(f);
    const e = entryOf('tavern').effects!;
    // kept as painted: lit from the top-left like the cottage
    expect(meta[f].import).toMatchObject({ mirrored: false });
    expect(e.windows).toHaveLength(6);
    for (const w of e.windows!) {
      const i = (w.y * r.width + w.x) * 4;
      const [R, G, B] = [r.data[i], r.data[i + 1], r.data[i + 2]];
      expect(R > 200 && G > 100 && (B < 160 || R + G + B > 720), `${w.x},${w.y}`).toBe(true);
    }
    const k = diamondCorners(entryOf('tavern').geometry);
    let low = 0;
    for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) if (A(r)(x, y) > 128) low = y;
    expect(Math.abs(low - k.bottom.y)).toBeLessThanOrEqual(2);
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
