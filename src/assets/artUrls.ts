/**
 * The bundled artwork, shared by the game (Phaser) and the UI (React) so both always show the
 * same images. Vite resolves the glob at build time: only files that exist are bundled, and
 * URLs include the configured base path and a content hash.
 */
import artMeta from './art/art-meta.json';
import { manifestByKey, type AssetEntry } from './manifest';
import { applyMeta, type ArtMeta } from './meta';
import { matchArtFiles } from './resolve';

export const ART_URLS = import.meta.glob('./art/**/*.{webp,png}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const matched = matchArtFiles(Object.keys(ART_URLS));

/** Manifest key -> bundled file path (WebP preferred over PNG). */
export const ART_FILES: ReadonlyMap<string, string> = matched.found;
/** Files in the art folder that the manifest doesn't know. */
export const UNKNOWN_ART_FILES: readonly string[] = matched.unknown;

/** URL of the bundled image for a manifest key, if one exists. */
export function artUrl(key: string): string | undefined {
  const path = ART_FILES.get(key);
  return path ? ART_URLS[path] : undefined;
}

/** Manifest entry with art-meta.json applied (visual footprint, top, effects). */
export function artEntry(key: string): AssetEntry | undefined {
  const e = manifestByKey.get(key);
  return e && applyMeta(e, artMeta as ArtMeta);
}
