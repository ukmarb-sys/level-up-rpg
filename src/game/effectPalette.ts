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
  // Ancient temple: cool cyan runes and the statues' glowing orbs, pale blue motes.
  temple: { glow: 0x62d6ff, motes: [0xc4f3ff, 0x7cc4ff, 0xe2ecff] },
  // Castle keep: the two braziers by the stairs breathe warm firelight and loose rising embers.
  castle: { glow: 0xffa53a, motes: [0xffd27a, 0xff9a3c, 0xffe9b0] },
};

export function sparklePalette(type: BuildingType): SparklePalette {
  return SPARKLE_PALETTES[type] ?? DEFAULT_SPARKLE_PALETTE;
}

/**
 * Tint of the soft breathing halo around a painted floating crystal (the `orb` effect point).
 * Violet by default (the mage tower); the temple's crystal is ice blue.
 */
export const DEFAULT_ORB_TINT = 0x8f6bff;
export const ORB_TINTS: Partial<Record<BuildingType, number>> = {
  temple: 0x4fa8ff,
};

export function orbTint(type: BuildingType): number {
  return ORB_TINTS[type] ?? DEFAULT_ORB_TINT;
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
  /** Additive blend: the puffs glow softly instead of shading (magical smoke). Default false. */
  additive?: boolean;
}

/** The original chimney smoke (cottage, sawmill, blacksmith): unchanged. */
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

// The tavern, farm, alchemist and sawmill paintings came with static smoke painted in; it was
// removed from the sprites (`--erase`/`--inpaint` on import). These three get their own animated
// style; the sawmill keeps the default.
export const SMOKE_STYLES: Partial<Record<BuildingType, SmokeStyle>> = {
  // Tavern: a soft, steady column, a little denser and taller than the rest: a working hearth.
  tavern: { tint: 0xddd5d2, interval: 380, alpha: 0.72, scaleFrom: 0.28, scaleTo: 1.05, rise: 34, riseJitter: 12, drift: 8, driftJitter: 8, duration: 2600 },
  // Farm: subtle farmhouse smoke, lighter and sparser than the tavern's.
  farm: { tint: 0xd8d2d4, interval: 520, alpha: 0.6, scaleFrom: 0.3, scaleTo: 0.95, rise: 30, riseJitter: 10, drift: 7, driftJitter: 8, duration: 2400 },
  // Alchemist: delicate, faintly glowing mint wisps that rise slowly and thin out (alchemy fumes).
  alchemist: { tint: 0xa8f0c8, interval: 430, alpha: 0.42, scaleFrom: 0.16, scaleTo: 0.62, rise: 38, riseJitter: 14, drift: 3, driftJitter: 10, duration: 3000, additive: true },
};

export function smokeStyle(type: BuildingType): SmokeStyle {
  return SMOKE_STYLES[type] ?? DEFAULT_SMOKE_STYLE;
}
