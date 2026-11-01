/**
 * Per-building colours and styles for building effects: `sparkles` and chimney smoke.
 *
 * Pure data, no Phaser, so it can be unit-tested. The effect points themselves stay in
 * `art-meta.json`; buildings without an entry here use the defaults.
 *
 * Sparkles (a breathing glint on each point plus motes drifting up from them) default to the
 * violet-blue arcane colour of the mage tower's crystals.
 */
import type { BuildingType } from '../core/types';

export interface SparklePalette {
  /** Tint of the soft glint breathing on each sparkle point (additive blend). */
  glow: number;
  /** Tints the rising motes pick from at random (additive blend). */
  motes: readonly number[];
}

/** Arcane violet: crystals, runes and the mage tower. */
export const DEFAULT_SPARKLE_PALETTE: SparklePalette = { glow: 0xc9a6ff, motes: [0xd9c2ff, 0xa98bff] };

export const SPARKLE_PALETTES: Partial<Record<BuildingType, SparklePalette>> = {
  // Emerald alchemy: matches the glowing green alembic and potion flasks.
  alchemist: { glow: 0x2fe07f, motes: [0x9dffc6, 0x34d57a, 0xc8ff8a] },
};

export function sparklePalette(type: BuildingType): SparklePalette {
  return SPARKLE_PALETTES[type] ?? DEFAULT_SPARKLE_PALETTE;
}

/**
 * Per-building chimney smoke: puffs spawned every `interval` ms at the chimney point, each rising
 * `rise` px (plus up to `riseJitter`), drifting right by `drift` (plus up to `driftJitter`),
 * growing from `scaleFrom` to `scaleTo` and fading from `alpha` to 0 over `duration` ms.
 */
export interface SmokeStyle {
  tint: number;
  interval: number;
  alpha: number;
  scaleFrom: number;
  scaleTo: number;
  rise: number;
  riseJitter: number;
  drift: number;
  driftJitter: number;
  duration: number;
}

/** The original chimney smoke (cottage, farm, sawmill, blacksmith): unchanged. */
export const DEFAULT_SMOKE_STYLE: SmokeStyle = {
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
};

export const SMOKE_STYLES: Partial<Record<BuildingType, SmokeStyle>> = {
  // Tavern: its painted (static) plume was removed from the sprite; this soft, steady column
  // replaces it, a little denser and taller than the default so it reads as a working hearth.
  tavern: { tint: 0xddd5d2, interval: 380, alpha: 0.72, scaleFrom: 0.28, scaleTo: 1.05, rise: 34, riseJitter: 12, drift: 8, driftJitter: 8, duration: 2600 },
};

export function smokeStyle(type: BuildingType): SmokeStyle {
  return SMOKE_STYLES[type] ?? DEFAULT_SMOKE_STYLE;
}
