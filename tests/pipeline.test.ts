import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILDING_ORDER } from '../src/core/buildings';
import type { Rotation } from '../src/core/types';
import { proceduralAnchors } from '../src/assets/geometry';
import { ART_EXTENSIONS, ASSET_MANIFEST, buildingKey, manifestByKey, worldToSource } from '../src/assets/manifest';
import { activeEffects, applyMeta } from '../src/assets/meta';
import { effectPoint, explainUnknownFile, matchArtFiles } from '../src/assets/resolve';
import { validateArt } from '../scripts/lib/validate';
import { alignedObjectPng } from './helpers/fixtures';

const ROT: Rotation[] = [0, 1, 2, 3];

describe('file extension and name case', () => {
  it('only matches lowercase extensions, like the game loader', () => {
    const { found, unknown } = matchArtFiles([
      'src/assets/art/buildings/cottage/cottage_r0.PNG',
      'src/assets/art/buildings/farm/farm_r0.Webp',
      'src/assets/art/buildings/sawmill/sawmill_r0.png',
    ]);
    expect([...found.keys()]).toEqual(['bld-sawmill-r0']);
    expect(unknown).toHaveLength(2);
  });

  it('keeps the loader glob and the manifest extensions in sync', () => {
    const src = readFileSync(new URL('../src/game/assets.ts', import.meta.url), 'utf8');
    const glob = /import\.meta\.glob\('([^']+)'/.exec(src)![1];
    expect(glob).toBe(`../assets/art/**/*.{${ART_EXTENSIONS.join(',')}}`);
    expect(ART_EXTENSIONS.every((e) => e === e.toLowerCase())).toBe(true);
  });

  it('explains how to fix misnamed files', () => {
    expect(explainUnknownFile('art/buildings/cottage/cottage_r0.PNG')).toMatch(/lowercase.*Rename to buildings\/cottage\/cottage_r0\.png/);
    expect(explainUnknownFile('art/buildings/magetower/magetower_r0.png')).toMatch(/letter case.*buildings\/mageTower\/mageTower_r0\.png/);
    expect(explainUnknownFile('art/cottage_r0.png')).toMatch(/Wrong folder.*buildings\/cottage\/cottage_r0\.png/);
    expect(explainUnknownFile('art/buildings/cottage/cottage_r0.jpg')).toMatch(/JPEG has no transparency/);
    expect(explainUnknownFile('art/buildings/cottage/cottage_r0.gif')).toMatch(/Unsupported extension/);
    expect(explainUnknownFile('art/buildings/castle/castle_r0.png')).toMatch(/Not in the asset manifest/);
  });

  it('reports uppercase extensions as errors in validation', () => {
    const report = validateArt([{ path: 'src/assets/art/buildings/cottage/cottage_r0.PNG', data: alignedObjectPng('bld-cottage-r0') }]);
    expect(report.issues.find((i) => i.severity === 'error')?.message).toMatch(/must be lowercase/);
    expect(report.matched).toHaveLength(0);
  });
});

describe('manifest top and effect points', () => {
  it('gives every building rotation a top point and the right effects, inside its canvas', () => {
    const expected = { cottage: ['chimney', 'windows'], farm: [], sawmill: ['wheel'], mageTower: ['orb', 'windows', 'windows'] };
    for (const type of BUILDING_ORDER) {
      for (const r of ROT) {
        const e = manifestByKey.get(buildingKey(type, r))!;
        const { width, height } = e.geometry.canvas;
        const pts = [{ name: 'top', point: e.top! }, ...activeEffects(e.effects)];
        expect(activeEffects(e.effects).map((x) => x.name).sort(), `${type} r${r}`).toEqual([...expected[type]].sort());
        for (const { point } of pts) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThan(width);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThan(height);
        }
      }
    }
  });

  it('derives reference points from the procedural buildings (one source of truth)', () => {
    for (const type of BUILDING_ORDER) {
      for (const r of ROT) {
        const e = manifestByKey.get(buildingKey(type, r))!;
        const a = proceduralAnchors(type, r);
        expect(e.top).toEqual(worldToSource(e.geometry, a.top));
        if (a.chimney) expect(e.effects?.chimney).toEqual(worldToSource(e.geometry, a.chimney));
        if (a.wheel) expect(e.effects?.wheel).toEqual(worldToSource(e.geometry, a.wheel));
      }
    }
  });

  it('round-trips points from sprite space back to the procedural position', () => {
    const e = manifestByKey.get('bld-cottage-r1')!;
    const a = proceduralAnchors('cottage', 1);
    const local = effectPoint(e, e.effects!.chimney!, false);
    const centre = { x: 0, y: 16 }; // isoPoint(0.5, 0.5)
    expect(local.x + centre.x).toBeCloseTo(a.chimney!.x, 0);
    expect(local.y + centre.y).toBeCloseTo(a.chimney!.y, 0);
  });

  it('mirrors effect points with the image', () => {
    const e = manifestByKey.get('bld-cottage-r0')!;
    const p = { x: e.geometry.anchor.x + 40, y: 100 };
    expect(effectPoint(e, p, false).x).toBe(10);
    expect(effectPoint(e, p, true).x).toBe(-10);
  });

  it('applies art-meta overrides, including disabling an effect with null', () => {
    const e = manifestByKey.get('bld-cottage-r0')!;
    const merged = applyMeta(e, { [e.file]: { top: { x: 150, y: 120 }, effects: { chimney: null, windows: [{ x: 100, y: 300 }] } } });
    expect(merged.top).toEqual({ x: 150, y: 120 });
    expect(activeEffects(merged.effects).map((x) => x.name)).toEqual(['windows']);
    expect(applyMeta(e, {})).toBe(e);
  });

  it('ships a valid art-meta.json whose entries are all manifest files', () => {
    const meta = JSON.parse(readFileSync(new URL('../src/assets/art/art-meta.json', import.meta.url), 'utf8'));
    for (const file of Object.keys(meta)) expect(ASSET_MANIFEST.some((e) => e.file === file), file).toBe(true);
  });
});

describe('art-meta validation', () => {
  const cottage = { path: 'src/assets/art/buildings/cottage/cottage_r0.png', data: alignedObjectPng('bld-cottage-r0') };
  const msgs = (meta: object) => validateArt([cottage], { meta: meta as never }).issues.map((i) => `${i.severity}: ${i.message}`);

  it('rejects unknown keys and points outside the canvas', () => {
    expect(msgs({ 'buildings/castle/castle_r0': {} })).toContainEqual(expect.stringMatching(/^error: Not a manifest file/));
    expect(msgs({ 'buildings/cottage/cottage_r0': { top: { x: 500, y: 10 } } })).toContainEqual(expect.stringMatching(/^error: top point .* outside/));
  });

  it('warns about stale tops, floating effects, missing metadata and orphaned entries', () => {
    expect(msgs({ 'buildings/cottage/cottage_r0': { top: { x: 160, y: 300 } } })).toContainEqual(expect.stringMatching(/Top point y=300/));
    expect(msgs({ 'buildings/cottage/cottage_r0': { effects: { chimney: { x: 5, y: 5 } } } })).toContainEqual(
      expect.stringMatching(/chimney effect point .* transparent/),
    );
    expect(msgs({})).toContainEqual(expect.stringMatching(/No art-meta.json entry/));
    expect(msgs({ 'buildings/farm/farm_r0': {} })).toContainEqual(expect.stringMatching(/image that does not exist/));
  });

  it('every manifest file is a valid art-meta key', () => {
    for (const e of ASSET_MANIFEST) expect(e.file).toMatch(/^(buildings|terrain|props)\/[a-zA-Z_0-9/]+$/);
  });
});
