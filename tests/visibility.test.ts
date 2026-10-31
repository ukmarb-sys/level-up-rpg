/**
 * Regression tests for "the new cottage art isn't visibly replacing the old cottage":
 * the UI icons must use the painted sprite, the camera must open on the player's buildings at a
 * readable zoom, and a stale cached page must be detectable.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { artEntry, artUrl } from '../src/assets/artUrls';
import { buildingIconCrop, iconBackground, paintedIcon } from '../src/assets/icon';
import { buildingKey } from '../src/assets/manifest';
import { logicalCorners } from '../src/assets/spec';
import { BUILD_ID, fetchDeployedBuild, isStaleBuild } from '../src/core/version';
import { BASE_MIN_ZOOM, initialView, OPENING_MAX_ZOOM } from '../src/game/spriteRules';
import { decodeImage } from '../scripts/lib/image';

describe('UI icons use the painted artwork', () => {
  it('uses the bundled painted art for every building icon (vector icons are only a fallback)', () => {
    expect(artUrl(buildingKey('cottage', 0))).toMatch(/cottage_r0\.webp/);
    for (const type of ['cottage', 'farm', 'sawmill', 'mageTower'] as const) {
      const icon = paintedIcon(type);
      expect(icon, type).not.toBeNull();
      expect(icon!.url).toMatch(new RegExp(`${type}_r0\\.webp`));
      // the crop covers the whole logical footprint and the painted top
      const e = artEntry(buildingKey(type, 0))!;
      const l = logicalCorners(e.geometry);
      expect(icon!.crop.x).toBeLessThanOrEqual(l.left.x);
      expect(icon!.crop.x + icon!.crop.size).toBeGreaterThanOrEqual(l.right.x);
      expect(icon!.crop.y).toBeLessThanOrEqual(e.top!.y);
      expect(icon!.crop.y + icon!.crop.size).toBeGreaterThanOrEqual(l.bottom.y);
    }
  });

  it('crops the icon to the house: a square around the logical tile from the painted top down', () => {
    const e = artEntry(buildingKey('cottage', 0))!;
    const c = buildingIconCrop(e);
    const l = logicalCorners(e.geometry);
    expect(c.x).toBeLessThanOrEqual(l.left.x);
    expect(c.x + c.size).toBeGreaterThanOrEqual(l.right.x);
    expect(c.y).toBeLessThanOrEqual(e.top!.y);
    expect(c.y + c.size).toBeGreaterThanOrEqual(l.bottom.y);
    // the crop is mostly house: well over a third of it is opaque painted pixels
    const img = decodeImage(readFileSync(new URL('../src/assets/art/buildings/cottage/cottage_r0.png', import.meta.url)));
    let opaque = 0;
    for (let y = c.y; y < c.y + c.size; y++)
      for (let x = c.x; x < c.x + c.size; x++)
        if (x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3] > 128) opaque++;
    expect(opaque / (c.size * c.size)).toBeGreaterThan(0.35);
  });

  it('places the crop in a square icon via CSS background maths', () => {
    const bg = iconBackground({ x: 100, y: 50, size: 200, canvas: { width: 600, height: 400 } }, 40);
    expect(bg).toEqual({ backgroundSize: '120px 80px', backgroundPosition: '-20px -10px' });
  });
});

describe('opening camera view', () => {
  const tile = 64;
  it('opens a new realm on the map centre at a phone-readable zoom', () => {
    const v = initialView([], 20, 390, tile);
    expect(v.center).toEqual({ x: 10, y: 10 });
    expect(v.zoom).toBeCloseTo(390 / (64 * 6), 5); // ~1.02: a 1x1 tile is ~65 CSS px wide
    expect(64 * v.zoom).toBeGreaterThan(60);
  });

  it("centres on the player's buildings", () => {
    const v = initialView(
      [
        { x: 2, y: 2, w: 1, d: 1 },
        { x: 4, y: 2, w: 2, d: 3 },
      ],
      20,
      390,
      tile,
    );
    expect(v.center).toEqual({ x: (2.5 + 5) / 2, y: (2.5 + 3.5) / 2 });
  });

  it('keeps desktop framing and respects the zoom limits', () => {
    expect(initialView([], 20, 1280, tile).zoom).toBe(OPENING_MAX_ZOOM);
    expect(initialView([], 20, 100, tile).zoom).toBe(BASE_MIN_ZOOM);
  });
});

describe('stale deploy detection', () => {
  it('compares the running build with the deployed one', () => {
    expect(isStaleBuild('abc1234', 'def5678')).toBe(true);
    expect(isStaleBuild('abc1234', 'abc1234')).toBe(false);
    expect(isStaleBuild('dev', 'def5678')).toBe(false);
    expect(isStaleBuild('abc1234', null)).toBe(false);
    expect(isStaleBuild('abc1234', '')).toBe(false);
  });

  it('fetches version.json bypassing caches and tolerates failures', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const ok = (async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ build: 'def5678' }), { status: 200 });
    }) as typeof fetch;
    expect(await fetchDeployedBuild('/level-up-rpg/', ok)).toBe('def5678');
    expect(calls[0][0]).toMatch(/^\/level-up-rpg\/version\.json\?t=\d+$/);
    expect(calls[0][1]).toEqual({ cache: 'no-store' });
    const notFound = (async () => new Response('nope', { status: 404 })) as typeof fetch;
    const offline = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    const junk = (async () => new Response('{"x":1}', { status: 200 })) as typeof fetch;
    expect(await fetchDeployedBuild('/', notFound)).toBeNull();
    expect(await fetchDeployedBuild('/', offline)).toBeNull();
    expect(await fetchDeployedBuild('/', junk)).toBeNull();
  });

  it('stamps the build with an id', () => {
    expect(typeof BUILD_ID).toBe('string');
    expect(BUILD_ID.length).toBeGreaterThan(0);
  });
});
