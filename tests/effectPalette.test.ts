import { describe, expect, it } from 'vitest';
import { BUILDING_ORDER } from '../src/core/buildings';
import { DEFAULT_SPARKLE_PALETTE, SPARKLE_PALETTES, sparklePalette } from '../src/game/effectPalette';

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
