import { describe, expect, it } from 'vitest';
import { BUILDING_ORDER } from '../src/core/buildings';
import { DEFAULT_SMOKE_STYLE, DEFAULT_SPARKLE_PALETTE, SMOKE_STYLES, SPARKLE_PALETTES, smokeStyle, sparklePalette } from '../src/game/effectPalette';

const rgb = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];

describe('per-building sparkle colours', () => {
  it('keeps the arcane violet for the mage tower and every building without its own palette', () => {
    expect(sparklePalette('mageTower')).toBe(DEFAULT_SPARKLE_PALETTE);
    expect(DEFAULT_SPARKLE_PALETTE).toEqual({ glow: 0xc9a6ff, motes: [0xd9c2ff, 0xa98bff] });
    for (const t of BUILDING_ORDER) if (!SPARKLE_PALETTES[t]) expect(sparklePalette(t)).toBe(DEFAULT_SPARKLE_PALETTE);
  });

  it('gives the alchemist emerald-green magic', () => {
    const p = sparklePalette('alchemist');
    expect(p).not.toBe(DEFAULT_SPARKLE_PALETTE);
    for (const c of [p.glow, ...p.motes]) {
      const [r, g, b] = rgb(c);
      expect(g, c.toString(16)).toBeGreaterThan(r);
      expect(g, c.toString(16)).toBeGreaterThan(b);
    }
  });

  it('only uses valid 24-bit colours with at least one mote tint', () => {
    for (const p of [DEFAULT_SPARKLE_PALETTE, ...Object.values(SPARKLE_PALETTES)]) {
      expect(p!.motes.length).toBeGreaterThan(0);
      for (const c of [p!.glow, ...p!.motes]) expect(Number.isInteger(c) && c >= 0 && c <= 0xffffff).toBe(true);
    }
  });
});

describe('per-building chimney smoke', () => {
  it('keeps the original smoke for every building without its own style (cottage, farm, ...)', () => {
    expect(DEFAULT_SMOKE_STYLE).toEqual({
      tint: 0xcfc6d6,
      interval: 650,
      alpha: 0.5,
      scaleFrom: 0.35,
      scaleTo: 0.9,
      rise: 26,
      riseJitter: 10,
      drift: 6,
      driftJitter: 8,
      duration: 2200,
    });
    for (const t of BUILDING_ORDER) if (!SMOKE_STYLES[t]) expect(smokeStyle(t)).toBe(DEFAULT_SMOKE_STYLE);
    expect(Object.keys(SMOKE_STYLES).sort()).toEqual(['alchemist', 'farm', 'tavern']);
  });

  it('gives the tavern a soft but readable, continuous column', () => {
    const s = smokeStyle('tavern');
    expect(s.alpha).toBeGreaterThan(DEFAULT_SMOKE_STYLE.alpha);
    expect(s.alpha).toBeLessThanOrEqual(0.8); // still subtle
    expect(s.interval).toBeLessThan(DEFAULT_SMOKE_STYLE.interval);
    // puffs overlap: several are alive at once, so the column never disappears
    expect(s.duration / s.interval).toBeGreaterThanOrEqual(5);
    const [r, g, b] = rgb(s.tint);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(24); // neutral grey, not tinted
  });

  it('makes the farm subtle, the alchemist delicate and mystical, and the tavern the densest', () => {
    const [tavern, farm, alchemist] = (['tavern', 'farm', 'alchemist'] as const).map(smokeStyle);
    // density = how opaque the puffs start x how often they come
    const density = (s: typeof tavern) => s.alpha / s.interval;
    expect(density(tavern)).toBeGreaterThan(density(farm));
    expect(density(tavern)).toBeGreaterThan(density(alchemist));
    expect(farm.alpha).toBeLessThan(tavern.alpha);
    expect(farm.additive).toBeFalsy();
    // alchemist: thin wisps (smaller puffs), slow and tall, softly glowing, faintly green
    expect(alchemist.scaleTo).toBeLessThan(farm.scaleTo);
    expect(alchemist.duration).toBeGreaterThan(farm.duration);
    expect(alchemist.additive).toBe(true);
    const [r, g, b] = rgb(alchemist.tint);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(DEFAULT_SMOKE_STYLE.additive).toBeUndefined();
  });
});
