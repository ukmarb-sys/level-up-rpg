/**
 * Locks in the art/gameplay decisions for overhanging artwork:
 *  - the cottage collides on 1x1 only; gardens, flowers and fences never block neighbours;
 *  - decoration goes in a separate ground layer where possible (validator nudges);
 *  - mirrored rotations are reported as temporary fallbacks until four directional images exist.
 */
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/core/buildings';
import { createInitialState, placeBuilding } from '../src/core/game';
import { buildingKey, manifestByKey } from '../src/assets/manifest';
import { resolveBuildingSprite } from '../src/assets/resolve';
import { importObject } from '../scripts/lib/import';
import { encodeRgba } from '../scripts/lib/png';
import { rotationFallbacks, validateArt, type ArtFile } from '../scripts/lib/validate';
import { fakeCottageWithGarden } from './helpers/fixtures';

const GARDEN = { u0: -0.5, v0: -0.5, u1: 1.5, v1: 1.5 };
const cottage = manifestByKey.get('bld-cottage-r0')!;
const png = (r: { width: number; height: number; data: Uint8Array }) => encodeRgba(r.width, r.height, r.data);
const file = (name: string, data: Buffer): ArtFile => ({ path: `src/assets/art/buildings/cottage/${name}`, data });

/** A cottage imported as building + ground layers, the preferred setup. */
function layered() {
  const { main, ground } = fakeCottageWithGarden({ garden: 2, split: true });
  return importObject(main, cottage, { visual: GARDEN, ground });
}

describe('decision: the cottage collides on its 1x1 tile only', () => {
  it('keeps the logical footprint at 1x1', () => {
    expect([BUILDINGS.cottage.width, BUILDINGS.cottage.depth]).toEqual([1, 1]);
  });

  it('leaves all eight neighbouring tiles free for other buildings', () => {
    let s = { ...createInitialState(0), resources: { wood: 9999, stone: 9999, magic: 9999 } };
    s = placeBuilding(s, 'cottage', { x: 10, y: 10 }, 0).state;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const res = placeBuilding(s, 'cottage', { x: 10 + dx, y: 10 + dy }, 0);
        expect(res.ok, `(${10 + dx}, ${10 + dy})`).toBe(true);
        s = res.state;
      }
    }
    expect(s.buildings).toHaveLength(9);
  });
});

describe('decision: decoration in a separate ground layer where possible', () => {
  it('accepts the layered setup without layering warnings', () => {
    const res = layered();
    const report = validateArt([file('cottage_r0.png', png(res.raster)), file('cottage_r0_ground.png', png(res.ground!))], {
      meta: { [cottage.file]: res.meta! },
    });
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(report.issues.some((i) => /no ground layer/.test(i.message))).toBe(false);
  });

  it('warns when overhanging art has no ground layer (single-image fallback)', () => {
    const { main } = fakeCottageWithGarden({ garden: 2, background: 'white' });
    const res = importObject(main, cottage, { visual: GARDEN });
    const report = validateArt([file('cottage_r0.png', png(res.raster))], { meta: { [cottage.file]: res.meta! } });
    const w = report.issues.find((i) => /no ground layer/.test(i.message));
    expect(w?.severity).toBe('warning');
    expect(w?.message).toMatch(/Gardens, flowers and fences/);
    expect(w?.message).toMatch(/cottage_r0_ground\.png/);
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('does not ask for a ground layer when the art stays within its tile', () => {
    const report = validateArt([], { meta: {} });
    expect(report.issues.some((i) => /ground layer/.test(i.message))).toBe(false);
  });

  it('warns when directional images disagree about the visual footprint', () => {
    const res = layered();
    const report = validateArt(
      [
        file('cottage_r0.png', png(res.raster)),
        file('cottage_r0_ground.png', png(res.ground!)),
        file('cottage_r1.png', png(res.raster)), // r1 present but imported without --visual
      ],
      { meta: { [cottage.file]: res.meta! } },
    );
    expect(report.issues.some((i) => i.file.endsWith('cottage_r1.png') && /declare a visual footprint/.test(i.message))).toBe(true);
  });
});

describe('decision: mirrored rotations are temporary fallbacks', () => {
  it('reports each borrowed direction as info, never as an error or warning', () => {
    const res = layered();
    const report = validateArt([file('cottage_r0.png', png(res.raster)), file('cottage_r0_ground.png', png(res.ground!))], {
      meta: { [cottage.file]: res.meta! },
    });
    expect(report.fallbacks).toEqual([
      { type: 'cottage', rotation: 1, from: 'buildings/cottage/cottage_r0', mirrored: true },
      { type: 'cottage', rotation: 2, from: 'buildings/cottage/cottage_r0', mirrored: false },
      { type: 'cottage', rotation: 3, from: 'buildings/cottage/cottage_r0', mirrored: true },
    ]);
    const infos = report.issues.filter((i) => /Temporary fallback/.test(i.message));
    expect(infos).toHaveLength(3);
    expect(infos.every((i) => i.severity === 'info')).toBe(true);
    expect(infos[0].message).toMatch(/mirrored buildings\/cottage\/cottage_r0\.png/);
  });

  it('stops reporting a direction as soon as its real image exists, which then takes priority', () => {
    const found = new Map(
      [0, 1, 2, 3].map((r) => [buildingKey('cottage', r as 0 | 1 | 2 | 3), `art/buildings/cottage/cottage_r${r}.png`]),
    );
    expect(rotationFallbacks(found)).toEqual([]);
    for (const r of [0, 1, 2, 3] as const) {
      expect(resolveBuildingSprite('cottage', r, (k) => found.has(k))).toEqual({ key: buildingKey('cottage', r), flipX: false });
    }
  });

  it('reports nothing when a building has no art at all (procedural fallback)', () => {
    expect(rotationFallbacks(new Map())).toEqual([]);
  });
});
