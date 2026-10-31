import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/core/buildings';
import { createInitialState, placeBuilding, relocateBuilding } from '../src/core/game';
import { checkPlacement, footprintSize } from '../src/core/grid';
import { loadGame, SAVE_KEY } from '../src/core/save';
import { GameStore } from '../src/core/store';
import type { Rotation } from '../src/core/types';
import { proceduralAnchors, rotateBounds } from '../src/assets/geometry';
import { buildingGeometry, buildingKey, groundKey, manifestByKey } from '../src/assets/manifest';
import { applyMeta } from '../src/assets/meta';
import { effectPoint, matchArtFiles } from '../src/assets/resolve';
import { diamondCorners, logicalCorners, objectGeometry, overhangs, PAD, SOURCE_SCALE } from '../src/assets/spec';
import { footprintDepth, isoPoint } from '../src/game/iso';
import {
  chooseLod,
  drawnVisualRect,
  GROUND_DECAL_DEPTH,
  groundDecalDepth,
  maxZoomFor,
  resolveTap,
  spritePixelAt,
} from '../src/game/spriteRules';
import { decodePng } from '../scripts/lib/image';
import { importObject } from '../scripts/lib/import';
import { encodeRgba } from '../scripts/lib/png';
import { opaqueBounds } from '../scripts/lib/raster';
import { validateArt } from '../scripts/lib/validate';
import { parseVisual } from '../scripts/import-art';
import { fakeCottageWithGarden } from './helpers/fixtures';
import { MemoryStorage } from './memoryStorage';

const GARDEN = { u0: -0.5, v0: -0.5, u1: 1.5, v1: 1.5 };
const ROT: Rotation[] = [0, 1, 2, 3];
const cottage = manifestByKey.get('bld-cottage-r0')!;
const meta = { 'buildings/cottage/cottage_r0': { visual: GARDEN } };

describe('visual footprint geometry', () => {
  it('sizes the canvas from the visual footprint but anchors on the logical tile', () => {
    const g = buildingGeometry('cottage', 0, GARDEN);
    expect(g.footprint).toEqual({ w: 1, d: 1 });
    expect(g.visual).toEqual({ x: -0.5, y: -0.5, w: 2, d: 2 });
    expect(g.canvas).toEqual({ width: 576, height: 896 });
    expect(g.anchor).toEqual({ x: 288, y: 736 });
    const v = diamondCorners(g);
    expect(v.left.x).toBe(PAD);
    expect(v.right.x).toBe(576 - PAD);
    expect(v.bottom.y).toBe(896 - PAD);
    // the logical 1x1 diamond sits in the middle, centred on the anchor
    const l = logicalCorners(g);
    expect((l.left.x + l.right.x) / 2).toBe(g.anchor.x);
    expect((l.top.y + l.bottom.y) / 2).toBe(g.anchor.y);
    expect(l.right.x - l.left.x).toBe(256);
    expect(overhangs(g)).toBe(true);
  });

  it('is identical to the old geometry when there is no overhang', () => {
    expect(objectGeometry(2, 3, 512)).toEqual(buildingGeometry('farm', 0));
    expect(overhangs(buildingGeometry('farm', 1))).toBe(false);
  });

  it('rotates asymmetric overhang with the building', () => {
    const frontGarden = { u0: 0, v0: 0, u1: 1, v1: 2 }; // one extra tile in front (+v) at r0
    expect(rotateBounds('cottage', 0, frontGarden)).toEqual({ x: 0, y: 0, w: 1, d: 2 });
    expect(rotateBounds('cottage', 1, frontGarden)).toEqual({ x: -1, y: 0, w: 2, d: 1 });
    expect(rotateBounds('cottage', 2, frontGarden)).toEqual({ x: 0, y: -1, w: 1, d: 2 });
    expect(rotateBounds('cottage', 3, frontGarden)).toEqual({ x: 0, y: 0, w: 2, d: 1 });
    for (const r of ROT) {
      const g = buildingGeometry('cottage', r, frontGarden);
      // anchor always sits at the centre of the logical tile
      const l = logicalCorners(g);
      expect((l.left.x + l.right.x) / 2, `r${r}`).toBe(g.anchor.x);
    }
  });

  it('applies art-meta visual bounds to the sprite and its ground layer, recomputing reference points', () => {
    const e = applyMeta(cottage, meta);
    expect(e.geometry.canvas).toEqual({ width: 576, height: 896 });
    const gEntry = applyMeta(manifestByKey.get(groundKey('bld-cottage-r0'))!, meta);
    expect(gEntry.geometry).toEqual(e.geometry);
    // reference chimney still lands on the same world position relative to the tile
    const a = proceduralAnchors('cottage', 0);
    const local = effectPoint(e, e.effects!.chimney!, false);
    const centre = isoPoint(0.5, 0.5);
    expect(local.x + centre.x).toBeCloseTo(a.chimney!.x, 0);
    expect(local.y + centre.y).toBeCloseTo(a.chimney!.y, 0);
  });

  it('mirrors the visual footprint with the image', () => {
    const g = buildingGeometry('cottage', 0, { u0: 0, v0: 0, u1: 1, v1: 2 });
    expect(drawnVisualRect(g, true)).toEqual({ x: 0, y: 0, w: 2, d: 1 });
    expect(drawnVisualRect(g, false)).toEqual({ x: 0, y: 0, w: 1, d: 2 });
  });

  it('recognises ground-layer files', () => {
    const { found, unknown } = matchArtFiles(['src/assets/art/buildings/cottage/cottage_r0_ground.png', 'src/assets/art/buildings/cottage/cottage_r0_garden.png']);
    expect(found.get(groundKey(buildingKey('cottage', 0)))).toBeDefined();
    expect(unknown).toHaveLength(1);
  });
});

describe('gameplay is unaffected by decorative overhang', () => {
  it('keeps the cottage logical footprint at 1x1', () => {
    expect(BUILDINGS.cottage.width).toBe(1);
    expect(BUILDINGS.cottage.depth).toBe(1);
    for (const r of ROT) expect(footprintSize('cottage', r)).toEqual({ w: 1, d: 1 });
  });

  it('lets buildings be placed and moved right up against a cottage, inside its visual area', () => {
    let s = { ...createInitialState(0), resources: { wood: 9999, stone: 9999, magic: 9999 } };
    s = placeBuilding(s, 'cottage', { x: 10, y: 10 }, 0).state;
    for (const p of [{ x: 11, y: 10 }, { x: 9, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 9 }]) {
      expect(checkPlacement('cottage', p, 0, s.buildings, 20).valid).toBe(true);
    }
    s = placeBuilding(s, 'sawmill', { x: 11, y: 10 }, 0).state;
    expect(s.buildings).toHaveLength(2);
    expect(placeBuilding(s, 'cottage', { x: 10, y: 10 }, 0)).toMatchObject({ ok: false, reason: 'collision' });
    expect(relocateBuilding(s, 'b1', { x: 10, y: 11 }, 1).ok).toBe(true);
  });

  it('allows a cottage on the map edge even though its garden would overhang the edge', () => {
    const s = createInitialState(0);
    expect(placeBuilding(s, 'cottage', { x: 19, y: 19 }, 0).ok).toBe(true);
    expect(placeBuilding(s, 'cottage', { x: 0, y: 0 }, 0).ok).toBe(true);
  });

  it('never writes visual/art data into saves', () => {
    const storage = new MemoryStorage();
    const store = new GameStore(undefined, { storage });
    store.startPlacing('cottage');
    store.tapTile({ x: 10, y: 10 });
    store.confirm();
    store.saveNow();
    const saved = JSON.parse(storage.getItem(SAVE_KEY)!);
    expect(JSON.stringify(saved)).not.toMatch(/visual|ground|overhang|sprite/i);
    expect(loadGame(storage)!.buildings[0]).toMatchObject({ type: 'cottage', x: 10, y: 10 });
  });

  it('selects a building from a resolved artwork tap, but still moves the ghost while placing', () => {
    const store = new GameStore(undefined, { storage: new MemoryStorage() });
    store.startPlacing('cottage');
    store.tapTile({ x: 10, y: 10 });
    store.confirm();
    store.cancel();
    store.tapBuilding('b1', { x: 9, y: 9 }); // tapped the roof, which is drawn over tile (9,9)
    expect(store.mode).toEqual({ kind: 'selected', id: 'b1' });
    store.tapBuilding(null, { x: 15, y: 15 });
    expect(store.mode).toEqual({ kind: 'idle' });
    store.tapBuilding('nope', { x: 10, y: 10 }); // unknown id falls back to the tile
    expect(store.mode).toEqual({ kind: 'selected', id: 'b1' });
    store.startPlacing('farm');
    store.tapBuilding('b1', { x: 3, y: 3 });
    expect(store.mode).toMatchObject({ kind: 'placing', pos: { x: 3, y: 3 } });
  });
});

describe('rendering rules', () => {
  it('puts ground layers above terrain details but below the build grid and every building', () => {
    for (const [x, y] of [
      [0, 0],
      [19, 19],
      [10, 3],
    ]) {
      const d = groundDecalDepth(x, y, 1, 1);
      expect(d).toBeGreaterThan(-900);
      expect(d).toBeLessThan(-500);
      expect(d).toBeLessThan(footprintDepth(0, 0, 1, 1));
    }
    expect(groundDecalDepth(5, 5, 1, 1)).toBeGreaterThan(groundDecalDepth(4, 5, 1, 1));
    expect(GROUND_DECAL_DEPTH).toBe(-800);
  });

  it('picks the smallest texture that is not upscaled', () => {
    expect(chooseLod(4.8)).toBe(1); // max zoom on a 2x phone
    expect(chooseLod(2)).toBe(2);
    expect(chooseLod(1.45)).toBe(2); // default zoom on a 390px-wide 2x phone
    expect(chooseLod(0.9)).toBe(4); // min zoom
    expect(chooseLod(1)).toBe(4);
  });

  it('caps zoom so painted art is never upscaled on high-DPI phones', () => {
    expect(maxZoomFor(2, false)).toBe(2.4);
    expect(maxZoomFor(2, true)).toBe(SOURCE_SCALE / 2);
    expect(maxZoomFor(1, true)).toBe(2.4);
  });

  it('maps a world point to the sprite pixel, including mirrored sprites', () => {
    const g = buildingGeometry('cottage', 0, GARDEN);
    const at = { x: 100, y: 200 };
    expect(spritePixelAt(at, at, g, false)).toEqual(g.anchor);
    expect(spritePixelAt({ x: 110, y: 190 }, at, g, false)).toEqual({ x: g.anchor.x + 40, y: g.anchor.y - 40 });
    expect(spritePixelAt({ x: 110, y: 190 }, at, g, true)).toEqual({ x: g.anchor.x - 40, y: g.anchor.y - 40 });
    expect(spritePixelAt({ x: 1000, y: 200 }, at, g, false)).toBeNull();
  });

  it('resolves taps: upright art first, then the occupied tile, then ground decoration', () => {
    expect(resolveTap({ upright: 'a', tile: 'b', ground: 'c' })).toBe('a');
    expect(resolveTap({ tile: 'b', ground: 'c' })).toBe('b');
    expect(resolveTap({ ground: 'c' })).toBe('c');
    expect(resolveTap({})).toBeNull();
  });
});

describe('importing overhanging artwork', () => {
  const v = { visual: GARDEN };

  it('parses --visual sizes and explicit bounds', () => {
    expect(parseVisual('2x2', cottage)).toEqual(GARDEN);
    expect(parseVisual('3x4', manifestByKey.get('bld-farm-r0')!)).toEqual({ u0: -0.5, v0: -0.5, u1: 2.5, v1: 3.5 });
    expect(parseVisual('0,0,1,2', cottage)).toEqual({ u0: 0, v0: 0, u1: 1, v1: 2 });
    expect(() => parseVisual('big', cottage)).toThrow(/WxD/);
  });

  it('imports a single image of a cottage with a garden: garden spans 2x2, house sits on the logical tile', () => {
    const { main } = fakeCottageWithGarden({ garden: 2, background: 'white' });
    const res = importObject(main, cottage, v);
    expect(res.raster.width).toBe(576);
    expect(res.meta?.visual).toEqual(GARDEN);
    const g = applyMeta(cottage, { [cottage.file]: res.meta! }).geometry;
    expect(errorsFor(res.raster, res.meta!)).toEqual([]);
    // the house's warm window must be inside the logical tile's horizontal span
    const l = logicalCorners(g);
    const win = res.meta!.effects!.windows![0];
    expect(win.x).toBeGreaterThan(l.left.x);
    expect(win.x).toBeLessThan(l.right.x);
    // the garden reaches the visual front corner
    expect(opaqueBounds(res.raster)!.maxY).toBe(diamondCorners(g).bottom.y);
  });

  it('imports house and garden as separate layers with identical alignment', () => {
    const { main, ground } = fakeCottageWithGarden({ garden: 2, split: true });
    const res = importObject(main, cottage, { ...v, ground });
    expect(res.ground).toBeDefined();
    expect([res.ground!.width, res.ground!.height]).toEqual([res.raster.width, res.raster.height]);
    expect(errorsFor(res.raster, res.meta!, res.ground)).toEqual([]);
    // judged alone, the house does not span the visual footprint — the ground layer is what makes it valid
    expect(errorsFor(res.raster, res.meta!).some((e) => /visual footprint/.test(e.message))).toBe(true);
    expect(opaqueBounds(res.ground!)!.maxY).toBe(896 - PAD);
  });

  it('rejects a ground layer of a different size', () => {
    const { main } = fakeCottageWithGarden({ split: true });
    const small = { width: 10, height: 10, data: new Uint8Array(400) };
    expect(() => importObject(main, cottage, { ...v, ground: small })).toThrow(/same size/);
  });

  it('refuses visual bounds for non-building assets', () => {
    const { main } = fakeCottageWithGarden();
    expect(() => importObject(main, manifestByKey.get('prop-treeOak')!, v)).toThrow(/building sprites/);
  });
});

function errorsFor(r: { width: number; height: number; data: Uint8Array }, m: object, ground?: { width: number; height: number; data: Uint8Array }) {
  const files = [{ path: 'src/assets/art/buildings/cottage/cottage_r0.png', data: encodeRgba(r.width, r.height, r.data) }];
  if (ground) files.push({ path: 'src/assets/art/buildings/cottage/cottage_r0_ground.png', data: encodeRgba(ground.width, ground.height, ground.data) });
  return validateArt(files, { meta: { 'buildings/cottage/cottage_r0': m } as never }).issues.filter((i) => i.severity === 'error');
}

describe('validating overhang metadata and ground layers', () => {
  const house = () => {
    const { main } = fakeCottageWithGarden({ garden: 2, background: 'white' });
    return importObject(main, cottage, { visual: GARDEN });
  };
  const msgs = (m: object, files?: { path: string; data: Buffer }[]) =>
    validateArt(files ?? [], { meta: m as never }).issues.map((i) => `${i.severity}: ${i.message}`);

  it('requires the visual footprint to contain the logical one, in quarter tiles, within 2 tiles', () => {
    expect(msgs({ [cottage.file]: { visual: { u0: 0.5, v0: 0, u1: 1, v1: 1 } } })).toContainEqual(expect.stringMatching(/must contain the logical footprint/));
    expect(msgs({ [cottage.file]: { visual: { u0: -0.3, v0: 0, u1: 1, v1: 1 } } })).toContainEqual(expect.stringMatching(/quarter tiles/));
    expect(msgs({ [cottage.file]: { visual: { u0: -3, v0: 0, u1: 1, v1: 1 } } })).toContainEqual(expect.stringMatching(/^error: Overhang of 3 tiles/));
    expect(msgs({ [cottage.file]: { visual: { u0: -1.5, v0: 0, u1: 1, v1: 1 } } })).toContainEqual(expect.stringMatching(/^warning: Overhang of 1.5/));
    expect(msgs({ [cottage.file]: { height: 500 } })).toContainEqual(expect.stringMatching(/multiple of 32/));
    expect(msgs({ 'props/tree_oak': { visual: GARDEN } })).toContainEqual(expect.stringMatching(/only supported for building sprites/));
    expect(msgs({ 'buildings/cottage/cottage_r0_ground': {} })).toContainEqual(expect.stringMatching(/share their building's metadata/));
  });

  it('checks the image against the visual canvas size from art-meta.json', () => {
    const res = house();
    const png = encodeRgba(res.raster.width, res.raster.height, res.raster.data);
    const file = { path: 'src/assets/art/buildings/cottage/cottage_r0.png', data: png };
    expect(msgs({ [cottage.file]: res.meta! }, [file]).filter((m) => m.startsWith('error'))).toEqual([]);
    // without the metadata the same image is the wrong size for a plain 1x1 cottage
    expect(msgs({}, [file])).toContainEqual(expect.stringMatching(/Wrong size 576x896; expected 320x448/));
  });

  it('reports a ground layer without its building sprite', () => {
    const res = house();
    const ground = { path: 'src/assets/art/buildings/cottage/cottage_r0_ground.png', data: encodeRgba(res.raster.width, res.raster.height, res.raster.data) };
    expect(msgs({ [cottage.file]: res.meta! }, [ground])).toContainEqual(expect.stringMatching(/Ground layer without its building sprite/));
  });

  it('decodes what the importer writes as an 8-bit RGBA master', () => {
    const res = house();
    expect(decodePng(encodeRgba(res.raster.width, res.raster.height, res.raster.data))).not.toBeNull();
  });
});
