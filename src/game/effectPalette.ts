/**
 * Per-building colours for the `sparkles` effect (a breathing glint on each point plus motes
 * drifting up from them). Pure data, no Phaser, so it can be unit-tested.
 *
 * Buildings without an entry use the violet-blue arcane default (the mage tower's crystals).
 * Add an entry to give a building its own magic colour; the art and effect points stay in
 * `art-meta.json`.
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
