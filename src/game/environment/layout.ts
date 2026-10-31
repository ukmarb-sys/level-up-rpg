/**
 * Pure, deterministic layout for the "Enchanted Wilderness" environment: ground tone field,
 * ground details, ambient life (fireflies, floating spores) and mobile quality tiers.
 * No Phaser here — everything is unit-tested.
 */
import { hash2, fbm } from '../noise';
import { isInsideGrid, type PropPlacement } from '../props';

// ---------------------------------------------------------------------------------------
// Quality tiers (Android)
// ---------------------------------------------------------------------------------------

export interface DeviceInfo {
  cores?: number;
  /** navigator.deviceMemory in GB (Chrome/Android only). */
  memoryGb?: number;
  reducedMotion?: boolean;
  saveData?: boolean;
}

export interface Quality {
  tier: 'low' | 'high';
  /** Fraction of ground details kept (0..1). */
  detailDensity: number;
  fireflies: number;
  spores: number;
  /** Animate fireflies/spores/glows (false with prefers-reduced-motion). */
  animate: boolean;
}

/**
 * Low tier for modest Android phones (≤ 4 cores or ≤ 3 GB RAM) and Data Saver: fewer particles
 * and details. prefers-reduced-motion keeps the scene but stops ambient movement.
 */
export function qualityFor(d: DeviceInfo): Quality {
  const low = (d.cores !== undefined && d.cores <= 4) || (d.memoryGb !== undefined && d.memoryGb <= 3) || !!d.saveData;
  const animate = !d.reducedMotion;
  return low
    ? { tier: 'low', detailDensity: 0.55, fireflies: animate ? 8 : 0, spores: animate ? 6 : 0, animate }
    : { tier: 'high', detailDensity: 1, fireflies: animate ? 16 : 0, spores: animate ? 12 : 0, animate };
}

// ---------------------------------------------------------------------------------------
// Ground tone field (multiplied over the seamless grass texture)
// ---------------------------------------------------------------------------------------

export type Rgb = [number, number, number];

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const mix = (a: Rgb, b: Rgb, t: number): Rgb => {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};

/** Multiplier colours: 255 = keep the grass texture's own colour. */
export const TONES = {
  lush: [232, 240, 222] as Rgb,
  moss: [186, 210, 176] as Rgb,
  meadow: [250, 236, 192] as Rgb,
  shade: [182, 198, 190] as Rgb,
  forestFloor: [146, 156, 134] as Rgb,
  deepForest: [112, 118, 110] as Rgb,
};

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Tone of the ground at grid point (x, y) (tile centres use x + 0.5). A continuous function of
 * position — including the blend into forest floor around the grid edge — so the upscaled field
 * has no steps or staircase edges. Inside the grid it stays bright and calm so buildings and the
 * build grid read clearly; moss and warm meadow patches drift across it in soft blobs.
 */
export function groundTone(x: number, y: number, mapSize: number): Rgb {
  // signed distance outside the grid in tiles (negative inside)
  const e = Math.max(-x, -y, x - mapSize, y - mapSize);
  let c = TONES.lush;
  const moss = fbm(x / 5, y / 5, 1);
  if (moss > 0.5) c = mix(c, TONES.moss, (moss - 0.5) * 1.6);
  const meadow = fbm(x / 4 + 30, y / 4 + 30, 2);
  if (meadow > 0.58) c = mix(c, TONES.meadow, (meadow - 0.58) * 2.2);
  // gentle shade near the back forest edge
  const toBack = Math.min(x, y);
  if (toBack < 1.5) c = mix(c, TONES.shade, Math.min(1, (1.5 - toBack) * 0.35));
  // forest floor beyond the grid edge, deepening outwards
  const floor = mix(TONES.forestFloor, TONES.deepForest, Math.max(0, e) * 0.3 + fbm(x / 3, y / 3, 9) * 0.3);
  c = mix(c, floor, smoothstep(-1, 1, e));
  return c.map(clamp255) as Rgb;
}

// ---------------------------------------------------------------------------------------
// Ground details
// ---------------------------------------------------------------------------------------

export const DETAIL_KINDS = [
  'tuft',
  'tuftDark',
  'moss',
  'clover',
  'flowersYellow',
  'flowersWhite',
  'flowersViolet',
  'flowersPink',
  'pebbles',
  'mushrooms',
  'leaves',
  'glowDots',
] as const;
export type DetailKind = (typeof DETAIL_KINDS)[number];

/** Height of each detail above the ground, world px. Inside the grid everything is ≤ 6 px. */
export const DETAIL_HEIGHT: Record<DetailKind, number> = {
  tuft: 6,
  tuftDark: 6,
  moss: 2,
  clover: 3,
  flowersYellow: 5,
  flowersWhite: 5,
  flowersViolet: 5,
  flowersPink: 5,
  pebbles: 3,
  mushrooms: 6,
  leaves: 2,
  glowDots: 4,
};

export interface DetailPlacement {
  kind: DetailKind;
  /** Ground position in grid units. */
  gx: number;
  gy: number;
  scale: number;
  flip: boolean;
}

type Weighted = [DetailKind, number][];
const GRID_DETAILS: Weighted = [
  ['tuft', 0.3],
  ['tuftDark', 0.12],
  ['moss', 0.14],
  ['clover', 0.1],
  ['flowersYellow', 0.1],
  ['flowersWhite', 0.08],
  ['flowersViolet', 0.07],
  ['flowersPink', 0.04],
  ['pebbles', 0.04],
  ['mushrooms', 0.01],
];
const RING_DETAILS: Weighted = [
  ['moss', 0.24],
  ['leaves', 0.2],
  ['tuftDark', 0.18],
  ['glowDots', 0.1],
  ['mushrooms', 0.08],
  ['flowersViolet', 0.1],
  ['pebbles', 0.1],
];

function pickDetail(table: Weighted, h: number): DetailKind {
  let acc = 0;
  const total = table.reduce((a, [, p]) => a + p, 0);
  for (const [k, p] of table) {
    acc += p / total;
    if (h < acc) return k;
  }
  return table[table.length - 1][0];
}

/**
 * Sparse, small details inside the grid (about one per three tiles, all flat) and denser
 * forest-floor details in the ring. `density` (from the quality tier) thins them uniformly.
 */
export function layoutGroundDetails(mapSize: number, ring: number, density = 1): DetailPlacement[] {
  const out: DetailPlacement[] = [];
  for (let y = -ring; y < mapSize + ring; y++) {
    for (let x = -ring; x < mapSize + ring; x++) {
      const inside = isInsideGrid(x, y, mapSize);
      const slots = inside ? 1 : 2;
      for (let k = 0; k < slots; k++) {
        const s = k * 31;
        const chance = (inside ? 0.38 : 0.7) * density;
        if (hash2(x, y, 61 + s) >= chance) continue;
        out.push({
          kind: pickDetail(inside ? GRID_DETAILS : RING_DETAILS, hash2(x, y, 62 + s)),
          gx: x + 0.15 + hash2(x, y, 63 + s) * 0.7,
          gy: y + 0.15 + hash2(x, y, 64 + s) * 0.7,
          scale: 0.8 + hash2(x, y, 65 + s) * 0.45,
          flip: hash2(x, y, 66 + s) > 0.5,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Ambient life
// ---------------------------------------------------------------------------------------

export interface AmbientPlan {
  /** Home positions of fireflies (grid units) — they wander gently around these. */
  fireflies: { gx: number; gy: number; seed: number }[];
  /** Spore emitters: mystical trees and glowing plants. */
  spores: { gx: number; gy: number; seed: number }[];
  /** Props that get a soft pulsing glow. */
  glows: { gx: number; gy: number; lift: number; colour: number; seed: number }[];
}

const GLOWING: Partial<Record<PropPlacement['type'], { lift: number; colour: number }>> = {
  treeMystic: { lift: 40, colour: 0xd6a0ff },
  treeEnchanted: { lift: 36, colour: 0x9d7bff },
  glowShroom: { lift: 6, colour: 0x6ff0e0 },
  glowBloom: { lift: 9, colour: 0x8fb4ff },
  crystalCluster: { lift: 14, colour: 0xb79cff },
  standingStone: { lift: 26, colour: 0xf0c96a },
};

/**
 * Fireflies favour the forest edge and the ring (not the middle of the build area), spores rise
 * from mystical trees and glowing plants, and those props get a subtle glow. Deterministic.
 */
export function ambientPlan(mapSize: number, props: PropPlacement[], q: Quality): AmbientPlan {
  const glows = props
    .filter((p) => GLOWING[p.type])
    .map((p, i) => ({ gx: p.x + 0.5 + p.ox, gy: p.y + 0.5 + p.oy, ...GLOWING[p.type]!, seed: i }));
  const fireflies: AmbientPlan['fireflies'] = [];
  for (let i = 0; i < q.fireflies; i++) {
    // around the island's perimeter, inside or just outside the grid edge
    const t = hash2(i, 7, 81) * 4;
    const side = Math.floor(t);
    const f = (t - side) * mapSize;
    const inset = -1.5 + hash2(i, 7, 82) * 3; // -1.5 .. 1.5 tiles across the grid edge
    const pts = [
      [f, inset],
      [mapSize - inset, f],
      [f, mapSize - inset],
      [inset, f],
    ];
    const [gx, gy] = pts[side];
    fireflies.push({ gx, gy, seed: i });
  }
  const emitters = glows.filter((g) => g.colour !== 0xf0c96a);
  const spores: AmbientPlan['spores'] = [];
  for (let i = 0; i < q.spores && emitters.length; i++) {
    const e = emitters[Math.floor(hash2(i, 3, 91) * emitters.length)];
    spores.push({ gx: e.gx, gy: e.gy, seed: i });
  }
  return { fireflies, spores, glows };
}
