/**
 * Asset manifest: every image the renderer knows how to use, with its expected geometry.
 *
 * Files live under src/assets/art/<file>.webp (preferred) or .png. Any entry whose file is
 * absent falls back to the procedural art in src/game/art.ts, so the game always runs.
 * Keep this file free of Phaser/React imports: the validator script and tests read it.
 */
import { BUILDING_ORDER, BUILDINGS } from '../core/buildings';
import type { BuildingType, Rotation } from '../core/types';
import { objectGeometry, tileGeometry, type SpriteGeometry } from './spec';

export type AssetKind = 'building' | 'terrain' | 'prop';

/** Effect attachment points in source px (same space as `anchor`). All optional. */
export interface EffectPoints {
  chimney?: { x: number; y: number };
  orb?: { x: number; y: number };
  windows?: { x: number; y: number }[];
}

export interface AssetEntry {
  /** Phaser texture key. */
  key: string;
  kind: AssetKind;
  /** Path under src/assets/art without extension, e.g. "buildings/cottage/cottage_r0". */
  file: string;
  geometry: SpriteGeometry;
  /** Required for the "complete art set"; optional entries only refine it. */
  required: boolean;
  /** Human description used in docs and validation messages. */
  description: string;
  effects?: EffectPoints;
}

export const ART_EXTENSIONS = ['webp', 'png'] as const;

/** Canvas heights (source px) give each building headroom for roofs, spires and smoke. */
export const BUILDING_CANVAS_HEIGHT: Record<BuildingType, number> = {
  cottage: 448,
  farm: 512,
  sawmill: 448,
  mageTower: 1024,
};

const BUILDING_BRIEF: Record<BuildingType, string> = {
  cottage: 'Timber-framed cottage, warm lit windows, smoking chimney',
  farm: 'Fenced moonwheat field with a small red barn',
  sawmill: 'Timber sawmill with saw blade and log pile',
  mageTower: 'Slender stone mage tower, violet spire, floating orb',
};

export const buildingKey = (type: BuildingType, rotation: Rotation) => `bld-${type}-r${rotation}`;

/** Footprint a building occupies at a rotation (mirrors core/grid.ts footprintSize). */
export function buildingFootprint(type: BuildingType, rotation: Rotation) {
  const def = BUILDINGS[type];
  return rotation % 2 === 0 ? { w: def.width, d: def.depth } : { w: def.depth, d: def.width };
}

function buildingEntries(): AssetEntry[] {
  const out: AssetEntry[] = [];
  for (const type of BUILDING_ORDER) {
    for (const rotation of [0, 1, 2, 3] as Rotation[]) {
      const { w, d } = buildingFootprint(type, rotation);
      out.push({
        key: buildingKey(type, rotation),
        kind: 'building',
        file: `buildings/${type}/${type}_r${rotation}`,
        geometry: objectGeometry(w, d, BUILDING_CANVAS_HEIGHT[type]),
        // r0 is enough for every rotation (see resolve.ts); r1-r3 add true side/back views.
        required: rotation === 0,
        description: `${BUILDING_BRIEF[type]} — rotation ${rotation} (${w}x${d} tiles)`,
      });
    }
  }
  return out;
}

export const TERRAIN_VARIANTS = 4;
export const terrainKey = (i: number) => `terrain-grass-${i}`;

function terrainEntries(): AssetEntry[] {
  return Array.from({ length: TERRAIN_VARIANTS }, (_, i) => ({
    key: terrainKey(i),
    kind: 'terrain' as const,
    file: `terrain/grass_${i}`,
    geometry: tileGeometry(),
    required: i === 0,
    description: `Lush grass ground tile, variant ${i}`,
  }));
}

export type PropType = 'treePine' | 'treeOak' | 'treeEnchanted' | 'rockMossy' | 'ruinPillar' | 'crystalCluster';

export const PROPS: Record<PropType, { file: string; height: number; tall: boolean; description: string }> = {
  treePine: { file: 'props/tree_pine', height: 512, tall: true, description: 'Dark pine tree of the enchanted forest' },
  treeOak: { file: 'props/tree_oak', height: 448, tall: true, description: 'Broad oak tree with a rich green canopy' },
  treeEnchanted: { file: 'props/tree_enchanted', height: 480, tall: true, description: 'Twisted tree with violet-blue glowing leaves' },
  rockMossy: { file: 'props/rock_mossy', height: 256, tall: false, description: 'Moss-covered boulder' },
  ruinPillar: { file: 'props/ruin_pillar', height: 448, tall: true, description: 'Broken ancient pillar with gold-inlaid runes' },
  crystalCluster: { file: 'props/crystal_cluster', height: 288, tall: false, description: 'Cluster of violet-blue magic crystals' },
};
export const PROP_ORDER = Object.keys(PROPS) as PropType[];
export const propKey = (p: PropType) => `prop-${p}`;

function propEntries(): AssetEntry[] {
  return PROP_ORDER.map((p) => ({
    key: propKey(p),
    kind: 'prop' as const,
    file: PROPS[p].file,
    geometry: objectGeometry(1, 1, PROPS[p].height),
    required: false,
    description: PROPS[p].description,
  }));
}

export const ASSET_MANIFEST: AssetEntry[] = [...buildingEntries(), ...terrainEntries(), ...propEntries()];

export const manifestByKey = new Map(ASSET_MANIFEST.map((e) => [e.key, e]));
export const manifestByFile = new Map(ASSET_MANIFEST.map((e) => [e.file, e]));
