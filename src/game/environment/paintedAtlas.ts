/**
 * Packs every painted prop that loaded (trees, rocks, ruins…) together with the procedural
 * prop atlas into ONE texture at startup.
 *
 * Hundreds of props are interleaved by depth. On Android, Phaser renders with its
 * single-texture MobilePipeline, so every switch between two textures is another draw call:
 * with a texture per painted tree the forest cost ~160 draw calls per frame, ~85 with two
 * atlases. From one atlas (whose ½/¼ LOD copies switch as a whole) it batches like the
 * procedural forest did. The standalone textures are freed afterwards.
 */
import Phaser from 'phaser';
import { PROP_ORDER, propKey } from '../../assets/manifest';
import type { LoadedArt } from '../assets';

export const ENV_PAINTED = 'env-painted-props';

export interface PackItem {
  key: string;
  w: number;
  h: number;
}

export interface PackResult {
  width: number;
  height: number;
  rects: Map<string, { x: number; y: number; w: number; h: number }>;
}

/**
 * Shelf packing, tallest first. Positions are multiples of `align` and items are separated by
 * `gap` transparent px, so the ½- and ¼-size LOD copies keep exact, bleed-free frames.
 */
export function packShelves(items: PackItem[], maxWidth: number, gap = 16, align = 4): PackResult | null {
  const up = (v: number) => Math.ceil(v / align) * align;
  const sorted = [...items].sort((a, b) => b.h - a.h || a.key.localeCompare(b.key));
  const rects: PackResult['rects'] = new Map();
  let x = 0;
  let y = 0;
  let shelf = 0;
  let width = 0;
  for (const it of sorted) {
    if (it.w > maxWidth) return null;
    if (x > 0 && x + it.w > maxWidth) {
      y += up(shelf + gap);
      x = 0;
      shelf = 0;
    }
    rects.set(it.key, { x, y, w: it.w, h: it.h });
    width = Math.max(width, x + it.w);
    shelf = Math.max(shelf, it.h);
    x += up(it.w + gap);
  }
  return { width: up(width), height: up(y + shelf), rects };
}

const PROCEDURAL_BLOCK = '__procedural';

/**
 * Builds one atlas holding the procedural prop atlas plus every painted prop that loaded, and
 * frees the standalone textures. Android uses Phaser's single-texture MobilePipeline, where
 * each texture switch between depth-sorted neighbours is a draw call, so all props must share
 * one texture. Returns the painted frame names (= prop texture keys); an empty set means
 * "no painted props, keep using the procedural atlas".
 */
export function buildPaintedPropAtlas(scene: Phaser.Scene, art: LoadedArt, procedural: string): Set<string> {
  const tm = scene.textures;
  const isPainted = (n: string) => n.startsWith('prop-');
  if (tm.exists(ENV_PAINTED)) {
    // Scene restarted: the atlas survives in the game-wide texture manager.
    const frames = new Set(tm.get(ENV_PAINTED).getFrameNames().filter(isPainted));
    for (const k of frames) {
      if (!art.has(k)) continue;
      art.markPacked(k);
      if (tm.exists(k)) tm.remove(k);
    }
    if (frames.size && tm.exists(procedural)) tm.remove(procedural);
    return frames;
  }
  const keys = PROP_ORDER.map(propKey).filter((k) => art.has(k));
  if (!keys.length || !tm.exists(procedural)) return new Set();
  const procTex = tm.get(procedural);
  const sources = [
    { key: PROCEDURAL_BLOCK, img: procTex.getSourceImage() as HTMLCanvasElement | HTMLImageElement },
    ...keys.map((key) => ({ key, img: tm.get(key).getSourceImage() as HTMLImageElement })),
  ].map((it) => ({ ...it, w: it.img.width, h: it.img.height }));
  const maxTex = (scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer).getMaxTextureSize?.() ?? 2048;
  const limit = Math.min(2048, maxTex);
  const pack = packShelves(sources, limit);
  if (!pack || pack.height > limit) return new Set(); // fall back to per-prop textures
  const tex = tm.createCanvas(ENV_PAINTED, pack.width, pack.height);
  if (!tex) return new Set();
  const ctx = tex.getContext();
  for (const it of sources) {
    const r = pack.rects.get(it.key)!;
    ctx.drawImage(it.img, r.x, r.y);
    if (it.key !== PROCEDURAL_BLOCK) tex.add(it.key, 0, r.x, r.y, r.w, r.h);
  }
  const block = pack.rects.get(PROCEDURAL_BLOCK)!;
  for (const name of procTex.getFrameNames()) {
    if (name === '__BASE') continue;
    const f = procTex.get(name);
    tex.add(name, 0, block.x + f.cutX, block.y + f.cutY, f.cutWidth, f.cutHeight);
  }
  tex.refresh();
  for (const k of keys) {
    art.markPacked(k);
    tm.remove(k);
  }
  tm.remove(procedural); // copied into the combined atlas
  return new Set(keys);
}
