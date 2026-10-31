/**
 * Phaser side of the asset pipeline: queues whatever artwork exists in src/assets/art and
 * turns manifest entries into positioned, anchored, depth-ready sprites.
 */
import Phaser from 'phaser';
import { ART_FILES, ART_URLS, artEntry, UNKNOWN_ART_FILES } from '../assets/artUrls';
import { ASSET_MANIFEST, terrainKey, TERRAIN_VARIANTS, type AssetEntry } from '../assets/manifest';
import { resolveBuildingSprite, resolveTerrainKey, type SpriteChoice } from '../assets/resolve';
export { effectPoint } from '../assets/resolve';
import { SOURCE_SCALE } from '../assets/spec';
import type { BuildingType, Rotation } from '../core/types';

export interface LoadedArt {
  has(key: string): boolean;
  /** True when at least one painted image loaded (enables art-specific zoom limits). */
  readonly any: boolean;
  entry(key: string): AssetEntry | undefined;
  terrainKeys: string[];
  missing: string[];
  failed: string[];
}

/** Call from Scene.preload(). Returns a registry that is complete once preload finishes. */
export function queueArt(scene: Phaser.Scene): LoadedArt {
  const found = ART_FILES;
  if (UNKNOWN_ART_FILES.length && import.meta.env.DEV) console.warn('[art] files not in manifest:', UNKNOWN_ART_FILES);
  const failed: string[] = [];
  for (const [key, path] of found) scene.load.image(key, ART_URLS[path]);
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => failed.push(file.key));

  const has = (key: string) => found.has(key) && !failed.includes(key) && scene.textures.exists(key);
  return {
    has,
    get any() {
      return [...found.keys()].some(has);
    },
    entry: artEntry,
    get terrainKeys() {
      return Array.from({ length: TERRAIN_VARIANTS }, (_, i) => terrainKey(i)).filter(has);
    },
    missing: ASSET_MANIFEST.filter((e) => !found.has(e.key)).map((e) => e.key),
    failed,
  };
}

/**
 * Creates an image anchored so that its footprint centre sits at (0,0) of the parent
 * container, which the scene positions at the footprint centre in world space.
 */
export function makeSprite(scene: Phaser.Scene, art: LoadedArt, choice: SpriteChoice): Phaser.GameObjects.Image {
  const e = art.entry(choice.key)!;
  const { canvas, anchor } = e.geometry;
  const img = scene.add.image(0, 0, choice.key);
  // Phaser applies flipX around the origin's mirror, so mirror the anchor too.
  const ax = choice.flipX ? canvas.width - anchor.x : anchor.x;
  img.setOrigin(ax / canvas.width, anchor.y / canvas.height);
  img.setFlipX(choice.flipX);
  img.setScale(1 / SOURCE_SCALE);
  return img;
}

export function buildingChoice(art: LoadedArt, type: BuildingType, rotation: Rotation) {
  return resolveBuildingSprite(type, rotation, art.has);
}

export function terrainChoice(art: LoadedArt, variant: number) {
  return resolveTerrainKey(variant, art.terrainKeys);
}

/**
 * Lazily builds downsampled copies of a loaded texture ("key@2", "key@4") using the browser's
 * high-quality canvas scaler, so zoomed-out sprites don't shimmer (Phaser has no mipmaps for
 * non-power-of-two textures). Returns the key to use for the given factor.
 */
export function lodTextureKey(scene: Phaser.Scene, key: string, factor: 1 | 2 | 4): string {
  if (factor === 1) return key;
  const lodKey = `${key}@${factor}`;
  if (scene.textures.exists(lodKey)) return lodKey;
  const from = factor === 4 ? lodTextureKey(scene, key, 2) : key;
  const src = scene.textures.get(from).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = Math.max(1, Math.round(src.width / 2));
  const h = Math.max(1, Math.round(src.height / 2));
  const tex = scene.textures.createCanvas(lodKey, w, h);
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  tex.refresh();
  return lodKey;
}
