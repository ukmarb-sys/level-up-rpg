/**
 * Menu/action-bar icons drawn from the same painted sprite the map uses, cropped to the
 * building itself (its logical tile, from the painted top down to the front corner) so
 * decoration such as a neighbouring garden doesn't shrink the house to a speck.
 */
import type { BuildingType } from '../core/types';
import { artEntry, artUrl } from './artUrls';
import { buildingKey, type AssetEntry } from './manifest';
import { logicalCorners } from './spec';

export interface IconCrop {
  /** Square crop in source px (may extend past the canvas edge; the area outside is transparent). */
  x: number;
  y: number;
  size: number;
  canvas: { width: number; height: number };
}

/** Square crop around a building's logical footprint and painted height. */
export function buildingIconCrop(e: AssetEntry, pad = 12): IconCrop {
  const g = e.geometry;
  const l = logicalCorners(g);
  const x0 = l.left.x - pad;
  const x1 = l.right.x + pad;
  const y0 = (e.top?.y ?? 0) - pad;
  const y1 = l.bottom.y + pad;
  const size = Math.max(x1 - x0, y1 - y0);
  return {
    x: Math.round((x0 + x1) / 2 - size / 2),
    y: Math.round((y0 + y1) / 2 - size / 2),
    size: Math.round(size),
    canvas: g.canvas,
  };
}

/** CSS background placement that shows `crop` of the sprite in a `px`-sized square. */
export function iconBackground(crop: IconCrop, px: number) {
  const s = px / crop.size;
  return {
    backgroundSize: `${crop.canvas.width * s}px ${crop.canvas.height * s}px`,
    backgroundPosition: `${-crop.x * s}px ${-crop.y * s}px`,
  };
}

/** Painted icon for a building type, or null to use the built-in SVG icon. */
export function paintedIcon(type: BuildingType): { url: string; crop: IconCrop } | null {
  const key = buildingKey(type, 0);
  const url = artUrl(key);
  const e = artEntry(key);
  return url && e ? { url, crop: buildingIconCrop(e) } : null;
}
