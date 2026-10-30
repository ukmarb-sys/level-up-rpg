import { describe, expect, it } from 'vitest';
import { BUILDING_ORDER, BUILDINGS } from '../src/core/buildings';
import { footprintSize } from '../src/core/grid';
import type { Rotation } from '../src/core/types';
import { ASSET_MANIFEST, buildingKey, manifestByKey, terrainKey } from '../src/assets/manifest';
import { matchArtFiles, resolveBuildingSprite, resolveTerrainKey } from '../src/assets/resolve';
import { diamondCorners, objectGeometry, PAD, SRC_TILE_H, SRC_TILE_W } from '../src/assets/spec';
import { layoutProps, isInsideGrid } from '../src/game/props';
import { PROPS } from '../src/assets/manifest';

const ROTATIONS: Rotation[] = [0, 1, 2, 3];

describe('asset manifest', () => {
  it('has a building entry for every type and rotation with the gameplay footprint', () => {
    for (const type of BUILDING_ORDER) {
      for (const r of ROTATIONS) {
        const e = manifestByKey.get(buildingKey(type, r));
        expect(e, `${type} r${r}`).toBeDefined();
        expect(e!.geometry.footprint).toEqual(footprintSize(type, r));
        expect(e!.file).toBe(`buildings/${type}/${type}_r${r}`);
      }
    }
  });

  it('uses unique keys and files', () => {
    expect(new Set(ASSET_MANIFEST.map((e) => e.key)).size).toBe(ASSET_MANIFEST.length);
    expect(new Set(ASSET_MANIFEST.map((e) => e.file)).size).toBe(ASSET_MANIFEST.length);
  });

  it('marks exactly the r0 buildings and the first terrain tile as required', () => {
    const required = ASSET_MANIFEST.filter((e) => e.required).map((e) => e.key).sort();
    expect(required).toEqual([...BUILDING_ORDER.map((t) => buildingKey(t, 0)), terrainKey(0)].sort());
  });

  it('computes canvas sizes and anchors from the footprint', () => {
    expect(manifestByKey.get('bld-cottage-r0')!.geometry).toMatchObject({
      canvas: { width: 320, height: 448 },
      anchor: { x: 160, y: 352 },
    });
    expect(manifestByKey.get('bld-farm-r1')!.geometry).toMatchObject({
      footprint: { w: 3, d: 2 },
      canvas: { width: 704, height: 512 },
      anchor: { x: 352, y: 320 },
    });
    expect(manifestByKey.get('bld-mageTower-r0')!.geometry.anchor).toEqual({ x: 288, y: 864 });
    expect(manifestByKey.get(terrainKey(0))!.geometry.canvas).toEqual({ width: SRC_TILE_W, height: SRC_TILE_H });
  });

  it('keeps every object footprint diamond inside its canvas with the transparent margin', () => {
    for (const e of ASSET_MANIFEST.filter((x) => x.kind !== 'terrain')) {
      const c = diamondCorners(e.geometry);
      expect(c.left.x, e.key).toBe(PAD);
      expect(c.right.x, e.key).toBe(e.geometry.canvas.width - PAD);
      expect(c.bottom.y, e.key).toBe(e.geometry.canvas.height - PAD);
      expect(c.top.y, e.key).toBeGreaterThan(0);
    }
  });

  it('places the front corner according to orientation for non-square footprints', () => {
    const r0 = diamondCorners(objectGeometry(2, 3, 512));
    const r1 = diamondCorners(objectGeometry(3, 2, 512));
    expect(r0.bottom.x).toBe(288);
    expect(r1.bottom.x).toBe(416);
    // r1 is the mirror image of r0, which is why mirroring can stand in for a quarter turn.
    expect(r0.bottom.x + r1.bottom.x).toBe(704);
  });
});

describe('sprite resolution and fallbacks', () => {
  const only = (...keys: string[]) => (k: string) => keys.includes(k);

  it('returns null so the procedural art is drawn when nothing is available', () => {
    for (const r of ROTATIONS) expect(resolveBuildingSprite('farm', r, () => false)).toBeNull();
  });

  it('uses the exact rotation when present', () => {
    const has = only('bld-farm-r0', 'bld-farm-r1', 'bld-farm-r2', 'bld-farm-r3');
    for (const r of ROTATIONS) expect(resolveBuildingSprite('farm', r, has)).toEqual({ key: `bld-farm-r${r}`, flipX: false });
  });

  it('covers every rotation from r0 alone, mirroring for odd rotations', () => {
    const has = only('bld-sawmill-r0');
    expect(resolveBuildingSprite('sawmill', 0, has)).toEqual({ key: 'bld-sawmill-r0', flipX: false });
    expect(resolveBuildingSprite('sawmill', 1, has)).toEqual({ key: 'bld-sawmill-r0', flipX: true });
    expect(resolveBuildingSprite('sawmill', 2, has)).toEqual({ key: 'bld-sawmill-r0', flipX: false });
    expect(resolveBuildingSprite('sawmill', 3, has)).toEqual({ key: 'bld-sawmill-r0', flipX: true });
  });

  it('never picks an image whose footprint differs from the rotation it stands in for', () => {
    for (const type of BUILDING_ORDER) {
      for (const r of ROTATIONS) {
        for (const avail of ROTATIONS) {
          const choice = resolveBuildingSprite(type, r, only(buildingKey(type, avail)))!;
          const fp = manifestByKey.get(choice.key)!.geometry.footprint;
          const shown = choice.flipX ? { w: fp.d, d: fp.w } : fp;
          expect(shown, `${type} r${r} from r${avail}`).toEqual(footprintSize(type, r));
        }
      }
    }
  });

  it('cycles through available terrain variants and falls back when none exist', () => {
    expect(resolveTerrainKey(3, [])).toBeNull();
    expect(resolveTerrainKey(3, ['a', 'b'])).toBe('b');
  });

  it('maps files to manifest keys, prefers WebP, and reports unknown files', () => {
    const { found, unknown } = matchArtFiles([
      '/src/assets/art/buildings/cottage/cottage_r0.png',
      '/src/assets/art/buildings/cottage/cottage_r0.webp',
      '../assets/art/terrain/grass_2.png',
      '../assets/art/buildings/cottage/cottage.png',
      '../assets/art/buildings/castle/castle_r0.png',
      '../assets/art/props/tree_pine.jpg',
    ]);
    expect(found.get('bld-cottage-r0')).toMatch(/\.webp$/);
    expect(found.get('terrain-grass-2')).toBeDefined();
    expect(unknown).toHaveLength(3);
  });
});

describe('scenery layout', () => {
  const props = layoutProps(20);
  it('never places props on the buildable grid', () => {
    expect(props.length).toBeGreaterThan(20);
    for (const p of props) expect(isInsideGrid(p.x, p.y, 20)).toBe(false);
  });
  it('keeps tall props off the front edges except at the side corners', () => {
    for (const p of props) {
      const front = p.x >= 20 || p.y >= 20;
      const sideCorner = (p.x < 0 && p.y >= 17) || (p.y < 0 && p.x >= 17);
      if (front && !sideCorner) expect(PROPS[p.type].tall, `${p.type} at ${p.x},${p.y}`).toBe(false);
    }
  });
  it('is deterministic', () => {
    expect(layoutProps(20)).toEqual(props);
  });
});

it('building footprints in the manifest match the gameplay catalogue', () => {
  for (const type of BUILDING_ORDER) {
    const g = manifestByKey.get(buildingKey(type, 0))!.geometry.footprint;
    expect(g).toEqual({ w: BUILDINGS[type].width, d: BUILDINGS[type].depth });
  }
});

describe('docs/ASSET_SPEC.md stays in sync with the manifest', () => {
  it('lists the correct canvas, anchor and front corner for every file it names', async () => {
    const { readFileSync } = await import('node:fs');
    const doc = readFileSync(new URL('../docs/ASSET_SPEC.md', import.meta.url), 'utf8');
    const section = doc.slice(doc.indexOf('## 6. Exact files'), doc.indexOf('## 7.'));
    const rows = section.split('\n').filter((l) => /^\| `/.test(l));
    const toFile = (name: string) => {
      const short = /^([a-zA-Z]+)_r(\d)$/.exec(name);
      return short ? `buildings/${short[1]}/${name}` : name;
    };
    const checked = new Set<string>();
    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim());
      const files = [...cells[1].matchAll(/`([^`]+)`/g)].map((m) => toFile(m[1]));
      const size = /(\d+) × (\d+)/.exec(row)!;
      const pts = [...row.matchAll(/\((\d+), (\d+)\)/g)].map((m) => ({ x: +m[1], y: +m[2] }));
      for (const f of files) {
        const e = ASSET_MANIFEST.find((x) => x.file === f);
        expect(e, f).toBeDefined();
        expect(e!.geometry.canvas, f).toEqual({ width: +size[1], height: +size[2] });
        const c = diamondCorners(e!.geometry);
        const front = { x: c.bottom.x, y: c.bottom.y };
        if (pts.length === 2) {
          expect(e!.geometry.anchor, f).toEqual(pts[0]);
          expect(front, f).toEqual(pts[1]);
        } else if (pts.length === 1) {
          // Priority 3 lists only the front corner; prop/terrain rows list only the anchor.
          expect([front, e!.geometry.anchor], f).toContainEqual(pts[0]);
        }
        checked.add(f);
      }
    }
    // Every manifest entry must appear in the table.
    expect(checked.size).toBe(ASSET_MANIFEST.length);
  });
});
