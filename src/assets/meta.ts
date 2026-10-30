/**
 * Per-file artwork metadata (src/assets/art/art-meta.json), written by `npm run art:import`
 * and editable by hand. It records where the *painted* art actually has its top and effect
 * points, overriding the manifest's reference values.
 */
import type { Pt } from './geometry';
import { EFFECT_NAMES, type AssetEntry, type EffectPoints } from './manifest';

export interface ArtMetaEntry {
  /** Highest painted point (source px). */
  top?: Pt;
  /** Effect overrides; `null` disables an effect, omitted keeps the manifest reference. */
  effects?: EffectPoints;
  /** Informational: how the file was produced (importer settings). Ignored by the game. */
  import?: Record<string, unknown>;
}

/** Keyed by manifest `file` (e.g. "buildings/cottage/cottage_r0"). */
export type ArtMeta = Record<string, ArtMetaEntry>;

/** Manifest entry with the file's measured/overridden points applied. */
export function applyMeta(entry: AssetEntry, meta: ArtMeta): AssetEntry {
  const m = meta[entry.file];
  if (!m) return entry;
  const effects: EffectPoints = { ...(entry.effects ?? {}) };
  for (const name of EFFECT_NAMES) {
    if (m.effects && name in m.effects) (effects as Record<string, unknown>)[name] = m.effects[name];
  }
  return { ...entry, top: m.top ?? entry.top, effects };
}

/** Effect points that are switched on (non-null). */
export function activeEffects(e: EffectPoints | undefined): { name: (typeof EFFECT_NAMES)[number]; point: Pt }[] {
  const out: { name: (typeof EFFECT_NAMES)[number]; point: Pt }[] = [];
  if (!e) return out;
  if (e.chimney) out.push({ name: 'chimney', point: e.chimney });
  if (e.orb) out.push({ name: 'orb', point: e.orb });
  if (e.wheel) out.push({ name: 'wheel', point: e.wheel });
  for (const w of e.windows ?? []) out.push({ name: 'windows', point: w });
  return out;
}
