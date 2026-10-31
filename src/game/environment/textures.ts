/**
 * Registers the procedural environment textures with Phaser, once per game:
 *   env-grass   512x512 seamless grass (power of two: tiles and mipmaps)
 *   env-details 256x64 atlas of ground details
 *   env-props   1024x512 atlas of every prop variant (power of two: mipmaps)
 *   env-glow    64x64 soft glow for fireflies, spores and magical light
 * Total GPU memory ≈ 3.3 MB including mipmaps.
 */
import Phaser from 'phaser';
import { PROP_ORDER, type PropType } from '../../assets/manifest';
import { DETAIL_KINDS, type DetailKind } from './layout';
import { DETAIL_CELL, DETAIL_PIVOT, paintDetail, paintGlow, paintGrass, paintProp, PIVOT_PAD, PROP_VARIANTS, propCell } from './paint';

export const ENV_GRASS = 'env-grass';
export const ENV_DETAILS = 'env-details';
export const ENV_PROPS = 'env-props';
export const ENV_GLOW = 'env-glow';
export const GRASS_SIZE = 512;
const PROP_ATLAS = { w: 1024, h: 512 };

/** Frame name and pivot (ground point, normalised origin) for a prop variant. */
export const propFrame = (type: PropType, variant: number) => `${type}:${variant % PROP_VARIANTS[type]}`;
export const propPivot = (type: PropType) => {
  const c = propCell(type);
  return { x: 0.5, y: (c.h - PIVOT_PAD) / c.h };
};
export const detailPivot = { x: DETAIL_PIVOT.x / DETAIL_CELL.w, y: DETAIL_PIVOT.y / DETAIL_CELL.h };

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ensureEnvironmentTextures(scene: Phaser.Scene) {
  const tm = scene.textures;
  if (!tm.exists(ENV_GRASS)) {
    const c = canvas(GRASS_SIZE, GRASS_SIZE);
    paintGrass(c.getContext('2d')!, GRASS_SIZE);
    tm.addCanvas(ENV_GRASS, c);
  }
  if (!tm.exists(ENV_DETAILS)) {
    const cols = Math.ceil(DETAIL_KINDS.length / 2);
    const c = canvas(256, 64);
    const ctx = c.getContext('2d')!;
    const tex = tm.addCanvas(ENV_DETAILS, c)!;
    DETAIL_KINDS.forEach((kind: DetailKind, i) => {
      const x = (i % cols) * DETAIL_CELL.w;
      const y = Math.floor(i / cols) * DETAIL_CELL.h;
      paintDetail(ctx, kind, x, y, 17 + i * 7);
      tex.add(kind, 0, x, y, DETAIL_CELL.w, DETAIL_CELL.h);
    });
    tex.refresh();
  }
  if (!tm.exists(ENV_PROPS)) {
    const c = canvas(PROP_ATLAS.w, PROP_ATLAS.h);
    const ctx = c.getContext('2d')!;
    const tex = tm.addCanvas(ENV_PROPS, c)!;
    // simple shelf packing, tallest first
    const items = PROP_ORDER.flatMap((t) => Array.from({ length: PROP_VARIANTS[t] }, (_, v) => ({ t, v, ...propCell(t) }))).sort((a, b) => b.h - a.h);
    let x = 0;
    let y = 0;
    let shelf = 0;
    for (const it of items) {
      if (x + it.w > PROP_ATLAS.w) {
        x = 0;
        y += shelf + 2;
        shelf = 0;
      }
      if (y + it.h > PROP_ATLAS.h) throw new Error('env-props atlas overflow');
      paintProp(ctx, it.t, it.v, x + it.w / 2, y + it.h - PIVOT_PAD);
      tex.add(propFrame(it.t, it.v), 0, x, y, it.w, it.h);
      x += it.w + 2;
      shelf = Math.max(shelf, it.h);
    }
    tex.refresh();
  }
  if (!tm.exists(ENV_GLOW)) {
    const c = canvas(64, 64);
    paintGlow(c.getContext('2d')!, 64);
    tm.addCanvas(ENV_GLOW, c);
  }
}
