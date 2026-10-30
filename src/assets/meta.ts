/**
 * Per-file artwork metadata (src/assets/art/art-meta.json), written by `npm run art:import`
 * and editable by hand. It records where the *painted* art actually has its top and effect
 * points, overriding the manifest's reference values.
 */
import type { LocalBounds, Pt } from './geometry';
import { buildingGeometry, EFFECT_NAMES, manifestByKey, referencePoints, type AssetEntry, type EffectPoints } from './manifest';

export interface ArtMetaEntry {
  /** Highest painted point (source px). */
  top?: Pt;
  /** Effect overrides; `null` disables an effect, omitted keeps the manifest reference. */
  effects?: EffectPoints;
  /**
   * Visual footprint the artwork paints, in the building's local tile frame (see LocalBounds).
   * Must contain the logical footprint. Changes the canvas size and anchor of this file and of
   * its _ground layer; the logical footprint (collision, saves) is never affected.
   */
  visual?: LocalBounds;
  /** Canvas height override in source px (multiple of 32). */
  height?: number;
  /** Informational: how the file was produced (importer settings). Ignored by the game. */
  import?: Record<string, unknown>;
}

/** Keyed by manifest `file` (e.g. "buildings/cottage/cottage_r0"). */
export type ArtMeta = Record<string, ArtMetaEntry>;

/**
 * Manifest entry with the file's metadata applied: visual footprint / canvas height (which
 * re-derive geometry and reference points), then measured top and effect overrides.
 * Ground layers take their geometry from the building sprite they belong to.
 */
export function applyMeta(entry: AssetEntry, meta: ArtMeta): AssetEntry {
  const owner = entry.layerOf ? manifestByKey.get(entry.layerOf) : entry;
  const m = owner && meta[owner.file];
  if (!m) return entry;
  let out = entry;
  if (entry.building && (m.visual || m.height)) {
    const { type, rotation } = entry.building;
    const geometry = buildingGeometry(type, rotation, m.visual, m.height);
    out = entry.kind === 'ground' ? { ...entry, geometry } : { ...entry, geometry, ...referencePoints(type, rotation, geometry) };
  }
  if (entry.kind === 'ground') return out;
  const effects: EffectPoints = { ...(out.effects ?? {}) };
  for (const name of EFFECT_NAMES) {
    if (m.effects && name in m.effects) (effects as Record<string, unknown>)[name] = m.effects[name];
  }
  return { ...out, top: m.top ?? out.top, effects };
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
