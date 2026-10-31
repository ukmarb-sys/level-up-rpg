/**
 * Asset manifest: every image the renderer knows how to use, with its expected geometry.
 *
 * Files live under src/assets/art/<file>.webp (preferred) or .png. Any entry whose file is
 * absent falls back to the procedural art in src/game/art.ts, so the game always runs.
 * Keep this file free of Phaser/React imports: the validator script and tests read it.
 */
import { BUILDING_ORDER, BUILDINGS } from '../core/buildings';
import type { BuildingType, Rotation } from '../core/types';
import { isoPoint } from '../game/iso';
import { logicalBounds, proceduralAnchors, rotateBounds, type LocalBounds, type Pt } from './geometry';
import { objectGeometry, SOURCE_SCALE, tileGeometry, type SpriteGeometry } from './spec';
export type { LocalBounds } from './geometry';

/** 'ground' = optional low layer of a building (garden, path, shadow) drawn beneath all buildings. */
export type AssetKind = 'building' | 'ground' | 'terrain' | 'prop';

/**
 * Effect attachment points in source px (same space as `anchor`). All optional; `null` in
 * art-meta.json explicitly disables an effect for a painted sprite.
 */
export interface EffectPoints {
  /** Chimney mouth: smoke rises from here. */
  chimney?: Pt | null;
  /** Magic orb centre: glow, bob and orbiting runes. */
  orb?: Pt | null;
  /** Lit windows: warm flickering glow. */
  windows?: Pt[];
  /** Saw blade centre: sawdust puffs (sprites) / spinning blade (procedural). */
  wheel?: Pt | null;
}

export const EFFECT_NAMES = ['chimney', 'orb', 'windows', 'wheel'] as const;

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
  /**
   * Highest point of the artwork in source px, used for the selection marker. For buildings
   * this is a reference value; the importer measures the real one into art-meta.json.
   */
  top?: Pt;
  /** Reference effect points; overridden per file by art-meta.json. */
  effects?: EffectPoints;
  /** Building sprites and their ground layers: which building/rotation the image depicts. */
  building?: { type: BuildingType; rotation: Rotation };
  /** Ground layers: key of the building sprite they belong to (same canvas and anchor). */
  layerOf?: string;
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
export const groundKey = (spriteKey: string) => `${spriteKey}-ground`;
/** Suffix of ground-layer files: buildings/cottage/cottage_r0_ground.png */
export const GROUND_SUFFIX = '_ground';

/**
 * Default canvas height when the art overhangs: the base height scaled by how much wider the
 * visual footprint is than the logical one, rounded up to 32 px.
 */
export function visualCanvasHeight(type: BuildingType, visual: { w: number; d: number }, w: number, d: number): number {
  return Math.ceil((BUILDING_CANVAS_HEIGHT[type] * ((visual.w + visual.d) / (w + d))) / 32) * 32;
}

/**
 * Sprite geometry for a building image. `bounds` (local r0 frame) declares how far the art
 * overhangs the logical footprint; `height` overrides the canvas height.
 */
export function buildingGeometry(type: BuildingType, rotation: Rotation, bounds?: LocalBounds, height?: number): SpriteGeometry {
  const { w, d } = buildingFootprint(type, rotation);
  const visual = rotateBounds(type, rotation, bounds ?? logicalBounds(type));
  const h = height ?? (bounds ? visualCanvasHeight(type, visual, w, d) : BUILDING_CANVAS_HEIGHT[type]);
  return objectGeometry(w, d, h, visual);
}

/** Converts a container-local world point (origin = footprint top corner) to sprite source px. */
export function worldToSource(g: SpriteGeometry, p: Pt): Pt {
  const centre = isoPoint(g.footprint.w / 2, g.footprint.d / 2);
  return {
    x: Math.round(g.anchor.x + (p.x - centre.x) * SOURCE_SCALE),
    y: Math.round(g.anchor.y + (p.y - centre.y) * SOURCE_SCALE),
  };
}

/**
 * Reference top/effect points for a building sprite: the procedural building's own anchors
 * expressed in that sprite's source pixels. Art painted to the reference proportions lines up.
 */
export function referencePoints(type: BuildingType, rotation: Rotation, g: SpriteGeometry): { top: Pt; effects: EffectPoints } {
  const a = proceduralAnchors(type, rotation);
  const conv = (p: Pt) => worldToSource(g, p);
  const effects: EffectPoints = {};
  if (a.chimney) effects.chimney = conv(a.chimney);
  if (a.orb) effects.orb = conv(a.orb);
  if (a.windows) effects.windows = a.windows.map(conv);
  if (a.wheel) effects.wheel = conv(a.wheel);
  return { top: conv(a.top), effects };
}

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
      const geometry = buildingGeometry(type, rotation);
      const key = buildingKey(type, rotation);
      const file = `buildings/${type}/${type}_r${rotation}`;
      out.push({
        key,
        kind: 'building',
        file,
        geometry,
        ...referencePoints(type, rotation, geometry),
        building: { type, rotation },
        // r0 is enough for every rotation (see resolve.ts); r1-r3 add true side/back views.
        required: rotation === 0,
        description: `${BUILDING_BRIEF[type]} — rotation ${rotation} (${w}x${d} tiles)`,
      });
      out.push({
        key: groundKey(key),
        kind: 'ground',
        file: `${file}${GROUND_SUFFIX}`,
        geometry,
        building: { type, rotation },
        layerOf: key,
        required: false,
        description: `Optional ground layer for ${file} (garden, path, shadow); same canvas and anchor`,
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

export type PropType =
  | 'treePine'
  | 'treeSpruce'
  | 'treeFir'
  | 'treeOak'
  | 'treeEnchanted'
  | 'treeMystic'
  | 'bushFern'
  | 'glowShroom'
  | 'glowBloom'
  | 'rockMossy'
  | 'rockSmall'
  | 'ruinPillar'
  | 'standingStone'
  | 'crystalCluster';

/**
 * Scenery around the island. Every type has a built-in painted-procedural version; dropping a
 * painted image at `file` replaces it. `tall` props never stand where they could cover the
 * buildable grid (see src/game/props.ts).
 */
export const PROPS: Record<PropType, { file: string; height: number; tall: boolean; description: string }> = {
  treePine: { file: 'props/tree_pine', height: 512, tall: true, description: 'Dark pine tree of the enchanted forest' },
  treeSpruce: { file: 'props/tree_spruce', height: 576, tall: true, description: 'Tall narrow spruce, deep blue-green' },
  treeFir: { file: 'props/tree_fir', height: 480, tall: true, description: 'Broad soft fir with layered boughs' },
  treeOak: { file: 'props/tree_oak', height: 448, tall: true, description: 'Broad oak tree with a rich green canopy' },
  treeEnchanted: { file: 'props/tree_enchanted', height: 480, tall: true, description: 'Twisted tree with violet-blue glowing leaves' },
  treeMystic: { file: 'props/tree_mystic', height: 512, tall: true, description: 'Weeping mystical tree with lilac-pink canopy and glowing motes' },
  bushFern: { file: 'props/bush_fern', height: 224, tall: false, description: 'Low fern and leafy undergrowth' },
  glowShroom: { file: 'props/glow_shroom', height: 224, tall: false, description: 'Cluster of softly glowing teal mushrooms' },
  glowBloom: { file: 'props/glow_bloom', height: 256, tall: false, description: 'Luminous blue-violet bellflowers' },
  rockMossy: { file: 'props/rock_mossy', height: 256, tall: false, description: 'Moss-covered boulder' },
  rockSmall: { file: 'props/rock_small', height: 192, tall: false, description: 'Small weathered stones in moss' },
  ruinPillar: { file: 'props/ruin_pillar', height: 448, tall: true, description: 'Broken ancient pillar with gold-inlaid runes' },
  standingStone: { file: 'props/standing_stone', height: 448, tall: true, description: 'Ancient standing stone with faint glowing runes' },
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
