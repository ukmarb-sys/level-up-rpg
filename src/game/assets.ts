/**
 * Phaser side of the asset pipeline: queues whatever artwork exists in src/assets/art and
 * turns manifest entries into positioned, anchored, depth-ready sprites.
 */
import Phaser from 'phaser';
import { ASSET_MANIFEST, manifestByKey, terrainKey, TERRAIN_VARIANTS, type AssetEntry } from '../assets/manifest';
import { applyMeta, type ArtMeta } from '../assets/meta';
import artMeta from '../assets/art/art-meta.json';
import { matchArtFiles, resolveBuildingSprite, resolveTerrainKey, type SpriteChoice } from '../assets/resolve';
export { effectPoint } from '../assets/resolve';
import { SOURCE_SCALE } from '../assets/spec';
import type { BuildingType, Rotation } from '../core/types';

// Vite resolves this at build time: only files that exist are bundled, so missing art costs
// nothing and never produces 404s. URLs include the configured base path and a content hash.
const ART_URLS = import.meta.glob('../assets/art/**/*.{webp,png}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export interface LoadedArt {
  has(key: string): boolean;
  entry(key: string): AssetEntry | undefined;
  terrainKeys: string[];
  missing: string[];
  failed: string[];
}

/** Call from Scene.preload(). Returns a registry that is complete once preload finishes. */
export function queueArt(scene: Phaser.Scene): LoadedArt {
  const { found, unknown } = matchArtFiles(Object.keys(ART_URLS));
  if (unknown.length && import.meta.env.DEV) console.warn('[art] files not in manifest:', unknown);
  const failed: string[] = [];
  for (const [key, path] of found) scene.load.image(key, ART_URLS[path]);
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => failed.push(file.key));

  const has = (key: string) => found.has(key) && !failed.includes(key) && scene.textures.exists(key);
  return {
    has,
    entry: (key) => {
      const e = manifestByKey.get(key);
      return e && applyMeta(e, artMeta as ArtMeta);
    },
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
