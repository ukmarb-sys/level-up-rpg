/**
 * Procedural "painted" textures for the Enchanted Wilderness environment, drawn once at startup
 * with the Canvas 2D API (no image downloads). Light comes from the top-left like the painted
 * cottage. All painters are deterministic (seeded) and Phaser-free so they can be previewed in
 * any canvas.
 *
 * Scale: props and details are painted at 2 px per world px (PAINT_SCALE) and displayed at 0.5.
 */
import type { PropType } from '../../assets/manifest';
import { PROP_SIZE } from '../props';
import type { DetailKind } from './layout';

export const PAINT_SCALE = 2;

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function hex(c: number, a = 1) {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}
function shadeHex(c: number, f: number) {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// ---------------------------------------------------------------------------------------
// Seamless grass
// ---------------------------------------------------------------------------------------

/**
 * Seamless grass: periodic multi-scale value noise for soft colour drift, thousands of short
 * blades and tiny clover/speckles, every stroke drawn with wrap-around so the texture tiles
 * without seams in both directions. Bright on purpose — the tone field multiplies over it.
 */
export function paintGrass(ctx: Ctx, size = 512, seed = 7) {
  const r = rng(seed);
  // periodic value noise
  const lattice = (period: number) => {
    const v = Array.from({ length: period * period }, () => r());
    return (x: number, y: number) => {
      const fx = (x / size) * period;
      const fy = (y / size) * period;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number) => v[((j + period) % period) * period + ((i + period) % period)];
      const a = at(x0, y0);
      const b = at(x0 + 1, y0);
      const c = at(x0, y0 + 1);
      const d = at(x0 + 1, y0 + 1);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  };
  const n1 = lattice(4);
  const n2 = lattice(16);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = n1(x, y) * 0.65 + n2(x, y) * 0.35; // 0..1
      const warm = n1(x + 97, y + 31); // yellow-green vs blue-green drift
      const i = (y * size + x) * 4;
      img.data[i] = 96 + n * 32 + warm * 14;
      img.data[i + 1] = 156 + n * 30;
      img.data[i + 2] = 70 + n * 16 - warm * 8;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const wrap = (x: number, y: number, draw: (x: number, y: number) => void) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) if (x + dx > -24 && x + dx < size + 24 && y + dy > -24 && y + dy < size + 24) draw(x + dx, y + dy);
  };
  const blades = [0x4f8f3a, 0x5fa043, 0x6fb24c, 0x86c25a, 0x9fd16a, 0x3f7a35, 0x2f6430];
  ctx.lineCap = 'round';
  for (let k = 0; k < 9000; k++) {
    const x = r() * size;
    const y = r() * size;
    const len = 4 + r() * 6;
    const ang = -Math.PI / 2 + (r() - 0.5) * 0.8;
    const col = blades[Math.floor(r() * blades.length)];
    const a = 0.45 + r() * 0.45;
    const w = 0.8 + r() * 0.9;
    wrap(x, y, (px, py) => {
      ctx.strokeStyle = hex(col, a);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + Math.cos(ang) * len * 0.5 + (r() - 0.5), py + Math.sin(ang) * len * 0.5, px + Math.cos(ang) * len, py + Math.sin(ang) * len);
      ctx.stroke();
    });
  }
  // clover and specks
  for (let k = 0; k < 700; k++) {
    const x = r() * size;
    const y = r() * size;
    const col = r() > 0.25 ? 0x7cc35e : 0xc9e08a;
    const rad = 0.8 + r() * 1.1;
    wrap(x, y, (px, py) => {
      ctx.fillStyle = hex(col, 0.55);
      for (let l = 0; l < 3; l++) {
        ctx.beginPath();
        ctx.arc(px + Math.cos((l * TAU) / 3) * rad, py + Math.sin((l * TAU) / 3) * rad * 0.6, rad, 0, TAU);
        ctx.fill();
      }
    });
  }
}

// ---------------------------------------------------------------------------------------
// Ground details (2x scale, bottom-centre pivot)
// ---------------------------------------------------------------------------------------

export const DETAIL_CELL = { w: 40, h: 32 };
/** Pivot (ground point) inside a detail cell. */
export const DETAIL_PIVOT = { x: 20, y: 26 };

export function paintDetail(ctx: Ctx, kind: DetailKind, ox: number, oy: number, seed: number) {
  const r = rng(seed);
  const cx = ox + DETAIL_PIVOT.x;
  const cy = oy + DETAIL_PIVOT.y;
  const blade = (x: number, y: number, len: number, ang: number, col: number, w = 1.2, a = 0.95) => {
    ctx.strokeStyle = hex(col, a);
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 + 1, y + Math.sin(ang) * len * 0.5, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  };
  const softBlob = (x: number, y: number, rx: number, ry: number, col: number, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, hex(col, a));
    g.addColorStop(1, hex(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
  };
  const flowers = (petal: number) => {
    for (let i = 0; i < 4; i++) {
      const fx = cx + (r() - 0.5) * 22;
      const fy = cy - 1 + (r() - 0.5) * 6;
      blade(fx, fy, 6 + r() * 3, -Math.PI / 2 + (r() - 0.5) * 0.4, 0x4f8f3a, 1);
      const tx = fx + (r() - 0.5) * 2;
      const ty = fy - 7 - r() * 3;
      for (let p = 0; p < 5; p++) {
        ctx.fillStyle = hex(shadeHex(petal, 0.9 + r() * 0.2));
        ctx.beginPath();
        ctx.arc(tx + Math.cos((p * TAU) / 5) * 1.6, ty + Math.sin((p * TAU) / 5) * 1.1, 1.3, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = hex(0xffd75a);
      ctx.beginPath();
      ctx.arc(tx, ty, 0.9, 0, TAU);
      ctx.fill();
    }
  };
  switch (kind) {
    case 'tuft':
    case 'tuftDark': {
      const cols = kind === 'tuft' ? [0x5fa043, 0x7dbb52, 0x9fd16a, 0x4a8a38] : [0x2f6a3a, 0x3d7a44, 0x285a35, 0x4b8a4a];
      for (let i = 0; i < 11; i++) blade(cx + (r() - 0.5) * 8, cy, 7 + r() * 7, -Math.PI / 2 + (r() - 0.5) * 1.1, cols[i % cols.length], 1.3);
      break;
    }
    case 'moss':
      softBlob(cx, cy - 2, 16, 7, 0x3f6e33, 0.55);
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = hex(r() > 0.5 ? 0x5b8f3c : 0x7aa84a, 0.7);
        ctx.beginPath();
        ctx.arc(cx + (r() - 0.5) * 24, cy - 2 + (r() - 0.5) * 8, 0.9 + r() * 1.2, 0, TAU);
        ctx.fill();
      }
      break;
    case 'clover':
      for (let i = 0; i < 7; i++) {
        const x = cx + (r() - 0.5) * 20;
        const y = cy - 1 + (r() - 0.5) * 6;
        for (let l = 0; l < 3; l++) {
          ctx.fillStyle = hex(l === 0 ? 0x8fcf6a : 0x6fb050, 0.95);
          ctx.beginPath();
          ctx.arc(x + Math.cos((l * TAU) / 3 - 1.57) * 1.6, y + Math.sin((l * TAU) / 3 - 1.57) * 1.2, 1.5, 0, TAU);
          ctx.fill();
        }
      }
      break;
    case 'flowersYellow':
      flowers(0xffe066);
      break;
    case 'flowersWhite':
      flowers(0xfbf6ea);
      break;
    case 'flowersViolet':
      flowers(0xb48cff);
      break;
    case 'flowersPink':
      flowers(0xffa6c9);
      break;
    case 'pebbles':
      for (let i = 0; i < 3; i++) {
        const x = cx + (i - 1) * 6 + (r() - 0.5) * 3;
        const rx = 3 + r() * 2.5;
        const ry = rx * 0.6;
        softBlob(x + 1, cy + 1, rx + 1.5, ry + 1, 0x1d2a18, 0.35);
        const g = ctx.createLinearGradient(x - rx, cy - ry, x + rx, cy + ry);
        g.addColorStop(0, '#c9c5b8');
        g.addColorStop(1, '#7d786d');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, cy - ry * 0.4, rx, ry, 0, 0, TAU);
        ctx.fill();
      }
      break;
    case 'mushrooms':
      for (let i = 0; i < 2; i++) {
        const x = cx + (i ? 5 : -3);
        const h = i ? 6 : 9;
        ctx.fillStyle = '#efe4cf';
        ctx.fillRect(x - 0.9, cy - h, 1.8, h);
        const g = ctx.createRadialGradient(x - 1.5, cy - h - 1.5, 0.5, x, cy - h, 5);
        g.addColorStop(0, '#f47a62');
        g.addColorStop(1, '#a8322a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, cy - h, i ? 3.6 : 4.6, i ? 2.4 : 3, 0, Math.PI, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,248,235,0.95)';
        for (let d = 0; d < 3; d++) {
          ctx.beginPath();
          ctx.arc(x + (d - 1) * 1.6, cy - h - 1.2, 0.55, 0, TAU);
          ctx.fill();
        }
      }
      break;
    case 'leaves':
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = hex([0x8a6a3a, 0xa8823e, 0x6e5a32, 0x9a7a4a][i % 4], 0.85);
        ctx.beginPath();
        ctx.ellipse(cx + (r() - 0.5) * 24, cy - 1 + (r() - 0.5) * 7, 2.6, 1.3, r() * Math.PI, 0, TAU);
        ctx.fill();
      }
      break;
    case 'glowDots':
      for (let i = 0; i < 6; i++) {
        const x = cx + (r() - 0.5) * 22;
        const y = cy - 2 - r() * 6;
        const col = r() > 0.5 ? 0x7ff5e6 : 0xc5a6ff;
        softBlob(x, y, 4, 4, col, 0.5);
        ctx.fillStyle = hex(0xffffff, 0.95);
        ctx.beginPath();
        ctx.arc(x, y, 0.8, 0, TAU);
        ctx.fill();
      }
      break;
  }
}

// ---------------------------------------------------------------------------------------
// Props (2x scale, bottom-centre pivot)
// ---------------------------------------------------------------------------------------

/** Canvas cell for a prop frame (2x px), with the ground pivot at (w/2, h - PIVOT_PAD). */
export const PIVOT_PAD = 10;
export function propCell(type: PropType) {
  const { hw, h } = PROP_SIZE[type];
  return { w: Math.ceil(hw * 2 * PAINT_SCALE + 16), h: Math.ceil(h * PAINT_SCALE + PIVOT_PAD + 12) };
}

/** How many painted variants each prop type has. */
export const PROP_VARIANTS: Record<PropType, number> = {
  treePine: 2,
  treeSpruce: 2,
  treeFir: 2,
  treeOak: 2,
  treeEnchanted: 1,
  treeMystic: 2,
  bushFern: 2,
  glowShroom: 1,
  glowBloom: 1,
  rockMossy: 2,
  rockSmall: 2,
  ruinPillar: 1,
  standingStone: 1,
  crystalCluster: 1,
};

function groundShadow(ctx: Ctx, x: number, y: number, rx: number, a = 0.32) {
  const g = ctx.createRadialGradient(x + rx * 0.15, y, 0, x + rx * 0.15, y, rx);
  g.addColorStop(0, `rgba(12,24,14,${a})`);
  g.addColorStop(1, 'rgba(12,24,14,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x + rx * 0.15, y, rx, rx * 0.42, 0, 0, TAU);
  ctx.fill();
}

function trunk(ctx: Ctx, x: number, y: number, w: number, h: number, col = 0x5a3c26) {
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, hex(shadeHex(col, 1.25)));
  g.addColorStop(1, hex(shadeHex(col, 0.6)));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w * 0.3, y - h);
  ctx.lineTo(x + w * 0.3, y - h);
  ctx.lineTo(x + w / 2, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * Evergreen: irregular drooping tiers painted in three passes — dark silhouette, mid-tone
 * boughs, then needle strokes lit from the top-left — so it reads as foliage, not a cone.
 */
function evergreen(ctx: Ctx, x: number, y: number, s: { hw: number; h: number }, light: number, dark: number, tiers: number, r: () => number) {
  const S = PAINT_SCALE;
  trunk(ctx, x, y, 7, 18);
  const top = y - s.h * S;
  const base = y - 10;
  const tierShapes: { yt: number; yb: number; half: number }[] = [];
  for (let t = 0; t < tiers; t++) {
    const f0 = t / tiers;
    const f1 = (t + 1.5) / tiers;
    tierShapes.push({
      yb: base - (base - top) * f0 * 0.9,
      yt: Math.max(top, base - (base - top) * f1),
      half: s.hw * S * (1 - f0 * 0.8) * (0.92 + r() * 0.12),
    });
  }
  const outline = (t: { yt: number; yb: number; half: number }, grow: number) => {
    ctx.beginPath();
    ctx.moveTo(x + (r() - 0.5) * 2, t.yt - grow);
    const teeth = 7;
    for (let k = 1; k <= teeth; k++) {
      const u = k / teeth;
      const droop = k % 2 ? 5 + r() * 4 : -1;
      ctx.lineTo(x + (t.half + grow) * u + (r() - 0.5) * 3, t.yt + (t.yb - t.yt) * u + droop);
    }
    ctx.quadraticCurveTo(x, t.yb + 8, x - (t.half + grow), t.yb + 3);
    for (let k = teeth - 1; k >= 1; k--) {
      const u = k / teeth;
      const droop = k % 2 ? 5 + r() * 4 : -1;
      ctx.lineTo(x - (t.half + grow) * u + (r() - 0.5) * 3, t.yt + (t.yb - t.yt) * u + droop);
    }
    ctx.closePath();
  };
  for (const t of tierShapes) {
    ctx.fillStyle = hex(dark);
    outline(t, 1.5);
    ctx.fill();
    const g = ctx.createLinearGradient(x - t.half, t.yt, x + t.half * 0.6, t.yb);
    g.addColorStop(0, hex(shadeHex(light, 1.05)));
    g.addColorStop(0.7, hex(shadeHex(light, 0.78)));
    g.addColorStop(1, hex(dark, 0));
    ctx.fillStyle = g;
    outline(t, -2);
    ctx.fill();
    // needles: bright on the lit (left/top) side, deep on the right
    ctx.lineCap = 'round';
    for (let k = 0; k < 34; k++) {
      const u = r();
      const side = r() * 2 - 1;
      const nx = x + side * t.half * u * 0.95;
      const ny = t.yt + (t.yb - t.yt) * u + 1 + r() * 3;
      const lit = side < 0.1 ? 1.25 + r() * 0.25 : 0.65 + r() * 0.2;
      ctx.strokeStyle = hex(shadeHex(light, lit), 0.75);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(nx + side * (3 + r() * 3), ny + 2 + r() * 2);
      ctx.stroke();
    }
  }
}

/**
 * Broadleaf canopy painted in passes: a dark silhouette from overlapping lobes, mid-tone lobes
 * shifted towards the light, soft top-left highlights, then a dense leaf texture whose shade
 * depends on position — no hard circle outlines.
 */
function canopy(ctx: Ctx, x: number, cy: number, rx: number, ry: number, light: number, dark: number, n: number, r: () => number) {
  const lobes = Array.from({ length: n }, () => {
    const a = r() * TAU;
    const d = Math.sqrt(r());
    return { bx: x + Math.cos(a) * rx * d * 0.7, by: cy + Math.sin(a) * ry * d * 0.7, br: Math.min(rx, ry) * (0.42 + r() * 0.22) };
  });
  const pass = (col: string, dx: number, dy: number, k: number) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (const l of lobes) {
      ctx.moveTo(l.bx + dx + l.br * k, l.by + dy);
      ctx.arc(l.bx + dx, l.by + dy, l.br * k, 0, TAU);
    }
    ctx.fill();
  };
  pass(hex(dark), 0, 0, 1);
  pass(hex(shadeHex(light, 0.72)), -rx * 0.06, -ry * 0.08, 0.86);
  const hl = ctx.createRadialGradient(x - rx * 0.45, cy - ry * 0.55, 1, x - rx * 0.2, cy - ry * 0.2, Math.max(rx, ry) * 1.1);
  hl.addColorStop(0, hex(shadeHex(light, 1.15), 0.9));
  hl.addColorStop(0.55, hex(light, 0.35));
  hl.addColorStop(1, hex(light, 0));
  ctx.fillStyle = hl;
  ctx.beginPath();
  for (const l of lobes) {
    ctx.moveTo(l.bx + l.br * 0.75, l.by);
    ctx.arc(l.bx - rx * 0.06, l.by - ry * 0.08, l.br * 0.75, 0, TAU);
  }
  ctx.fill();
  // leaf texture
  for (let k = 0; k < 170; k++) {
    const l = lobes[Math.floor(r() * lobes.length)];
    const a = r() * TAU;
    const d = Math.sqrt(r()) * l.br * 0.95;
    const px = l.bx + Math.cos(a) * d;
    const py = l.by + Math.sin(a) * d;
    const litness = Math.max(0, Math.min(1, 0.5 - (px - x) / (rx * 2.2) - (py - cy) / (ry * 2.2)));
    const col = litness > 0.55 ? shadeHex(light, 1.05 + r() * 0.25) : litness > 0.3 ? shadeHex(light, 0.8 + r() * 0.15) : shadeHex(dark, 1.1 + r() * 0.4);
    ctx.fillStyle = hex(col, 0.85);
    ctx.beginPath();
    ctx.ellipse(px, py, 2.4, 1.4, r() * Math.PI, 0, TAU);
    ctx.fill();
  }
}

function sparkle(ctx: Ctx, x: number, y: number, col: number, rad: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, hex(0xffffff, 0.95));
  g.addColorStop(0.35, hex(col, 0.75));
  g.addColorStop(1, hex(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
}

function rock(ctx: Ctx, x: number, y: number, rx: number, ry: number, r: () => number, moss = true) {
  const pts = Array.from({ length: 9 }, (_, i) => {
    const a = Math.PI + (i / 8) * Math.PI;
    const k = 0.78 + r() * 0.3;
    return [x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k * 1.6] as const;
  });
  const g = ctx.createLinearGradient(x - rx, y - ry * 1.6, x + rx, y);
  g.addColorStop(0, '#c2bfcf');
  g.addColorStop(0.55, '#8e8a9e');
  g.addColorStop(1, '#55526a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - rx, y);
  for (const [px, py] of pts) ctx.lineTo(px, py);
  ctx.lineTo(x + rx, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,36,56,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - rx * 0.2, y - ry * 1.3);
  ctx.lineTo(x + rx * 0.05, y - ry * 0.6);
  ctx.lineTo(x - rx * 0.1, y - ry * 0.2);
  ctx.stroke();
  if (moss) {
    for (let k = 0; k < 18; k++) {
      ctx.fillStyle = hex(r() > 0.5 ? 0x5f9a45 : 0x7cb259, 0.85);
      ctx.beginPath();
      ctx.arc(x - rx * 0.6 + r() * rx * 1.1, y - ry * (1.05 + r() * 0.5), 1.5 + r() * 2, 0, TAU);
      ctx.fill();
    }
  }
}

/** Paints one prop variant with its ground pivot at (x, y). */
export function paintProp(ctx: Ctx, type: PropType, variant: number, x: number, y: number) {
  const r = rng(1000 + type.length * 97 + variant * 13 + type.charCodeAt(0) * 7);
  const s = PROP_SIZE[type];
  const S = PAINT_SCALE;
  const v = variant % PROP_VARIANTS[type];
  switch (type) {
    case 'treePine':
      groundShadow(ctx, x, y, s.hw * S * 0.95);
      evergreen(ctx, x, y, s, v ? 0x356f52 : 0x3a7a55, v ? 0x123a2c : 0x163f2e, 5, r);
      break;
    case 'treeSpruce':
      groundShadow(ctx, x, y, s.hw * S * 1.05);
      evergreen(ctx, x, y, s, v ? 0x2f6764 : 0x335f6a, v ? 0x10302f : 0x112c36, 7, r);
      break;
    case 'treeFir':
      groundShadow(ctx, x, y, s.hw * S * 0.95);
      evergreen(ctx, x, y, s, v ? 0x4b8a4c : 0x4f8f45, v ? 0x1d4a2c : 0x204d26, 4, r);
      break;
    case 'treeOak': {
      groundShadow(ctx, x, y, s.hw * S * 0.9);
      trunk(ctx, x, y, 10, 34, 0x5e4026);
      canopy(ctx, x, y - s.h * S * 0.62, s.hw * S, s.h * S * 0.36, v ? 0x5f9a45 : 0x4f8f3e, v ? 0x23502a : 0x1f4824, 18, r);
      break;
    }
    case 'treeEnchanted': {
      groundShadow(ctx, x, y, s.hw * S * 0.9);
      trunk(ctx, x, y, 9, 36, 0x3b2c3f);
      canopy(ctx, x, y - s.h * S * 0.62, s.hw * S, s.h * S * 0.35, 0x7b6ae0, 0x2f2768, 16, r);
      for (let k = 0; k < 9; k++) sparkle(ctx, x + (r() - 0.5) * s.hw * S * 1.4, y - s.h * S * (0.45 + r() * 0.4), 0xb7a4ff, 4 + r() * 3);
      break;
    }
    case 'treeMystic': {
      groundShadow(ctx, x, y, s.hw * S * 0.9);
      // curving trunk
      ctx.strokeStyle = '#4a3346';
      ctx.lineCap = 'round';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x - 10, y - 30, x + 12, y - 50, x + 2, y - s.h * S * 0.55);
      ctx.stroke();
      const light = v ? 0xe2a6e8 : 0xc99af0;
      const dark = v ? 0x6a3a8a : 0x4f3a8f;
      canopy(ctx, x, y - s.h * S * 0.66, s.hw * S, s.h * S * 0.3, light, dark, 18, r);
      // weeping strands
      for (let k = 0; k < 14; k++) {
        const sx = x + (r() - 0.5) * s.hw * S * 1.7;
        const sy = y - s.h * S * (0.55 + r() * 0.15);
        const len = 18 + r() * 26;
        ctx.strokeStyle = hex(r() > 0.5 ? light : shadeHex(light, 0.8), 0.75);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(sx + (r() - 0.5) * 6, sy + len * 0.6, sx + (r() - 0.5) * 4, sy + len);
        ctx.stroke();
      }
      for (let k = 0; k < 10; k++) sparkle(ctx, x + (r() - 0.5) * s.hw * S * 1.5, y - s.h * S * (0.35 + r() * 0.5), 0xffd0ff, 3 + r() * 3);
      break;
    }
    case 'bushFern': {
      groundShadow(ctx, x, y, s.hw * S * 0.95, 0.25);
      const cols = v ? [0x4f9a4a, 0x3c7f3e, 0x6ab35a] : [0x5a9a3a, 0x467f33, 0x79b552];
      for (let f = 0; f < 9; f++) {
        const a = -Math.PI / 2 + (f / 8 - 0.5) * 2.4;
        const len = s.h * S * (0.7 + r() * 0.5);
        const col = cols[f % 3];
        for (let l = 0; l < 7; l++) {
          const u = l / 7;
          const px = x + Math.cos(a) * len * u * 1.4;
          const py = y - 2 + Math.sin(a) * len * u;
          ctx.fillStyle = hex(shadeHex(col, 1 + (1 - u) * 0.1));
          ctx.beginPath();
          ctx.ellipse(px, py, 4 * (1 - u * 0.5), 2 * (1 - u * 0.4), a + 0.6, 0, TAU);
          ctx.fill();
        }
      }
      break;
    }
    case 'glowShroom': {
      groundShadow(ctx, x, y, s.hw * S, 0.25);
      for (let m = 0; m < 4; m++) {
        const mx = x + (m - 1.5) * 6 + (r() - 0.5) * 3;
        const h = 8 + r() * 12;
        ctx.fillStyle = '#e7f5ef';
        ctx.fillRect(mx - 1.3, y - h, 2.6, h);
        sparkle(ctx, mx, y - h - 1, 0x6ff0e0, 9);
        const g = ctx.createRadialGradient(mx - 2, y - h - 3, 0.5, mx, y - h, 6);
        g.addColorStop(0, '#d9fff9');
        g.addColorStop(0.5, '#56d8cf');
        g.addColorStop(1, '#1e7a86');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(mx, y - h, 5.5, 3.6, 0, Math.PI, TAU);
        ctx.fill();
      }
      break;
    }
    case 'glowBloom': {
      for (let f = 0; f < 5; f++) {
        const fx = x + (f - 2) * 5 + (r() - 0.5) * 3;
        const h = 14 + r() * 16;
        ctx.strokeStyle = '#3f7a3c';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(fx, y);
        ctx.quadraticCurveTo(fx + 3, y - h * 0.6, fx + 1, y - h);
        ctx.stroke();
        sparkle(ctx, fx + 1, y - h, 0x8fb4ff, 8);
        ctx.fillStyle = f % 2 ? '#9f8cff' : '#7fa8ff';
        ctx.beginPath();
        ctx.moveTo(fx - 3, y - h);
        ctx.quadraticCurveTo(fx + 1, y - h - 7, fx + 5, y - h);
        ctx.lineTo(fx + 3.5, y - h + 2);
        ctx.lineTo(fx - 1.5, y - h + 2);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'rockMossy':
      groundShadow(ctx, x, y, s.hw * S, 0.3);
      rock(ctx, x, y, s.hw * S * (v ? 0.85 : 0.95), s.h * S * 0.55, r);
      break;
    case 'rockSmall':
      groundShadow(ctx, x, y, s.hw * S, 0.25);
      rock(ctx, x - 6, y, s.hw * S * 0.5, s.h * S * 0.5, r, v === 0);
      rock(ctx, x + 8, y + 1, s.hw * S * 0.35, s.h * S * 0.35, r, v === 1);
      break;
    case 'ruinPillar': {
      groundShadow(ctx, x, y, s.hw * S * 1.1, 0.3);
      const w = s.hw * S * 1.1;
      const h = s.h * S * 0.88;
      const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, '#c9c4d6');
      g.addColorStop(0.5, '#9a96ad');
      g.addColorStop(1, '#5e5a74');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.lineTo(x - w / 2, y - h);
      ctx.lineTo(x - w * 0.1, y - h - 12);
      ctx.lineTo(x + w * 0.2, y - h + 4);
      ctx.lineTo(x + w / 2, y - h - 6);
      ctx.lineTo(x + w / 2, y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(50,46,70,0.35)';
      ctx.lineWidth = 1;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(x + k * w * 0.25, y - 4);
        ctx.lineTo(x + k * w * 0.25, y - h + 4);
        ctx.stroke();
      }
      const plinth = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      plinth.addColorStop(0, '#a9a4bb');
      plinth.addColorStop(1, '#5f5a75');
      ctx.fillStyle = plinth;
      ctx.fillRect(x - w / 2 - 4, y - 10, w + 8, 10);
      ctx.strokeStyle = 'rgba(240,201,106,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - h * 0.55);
      ctx.lineTo(x, y - h * 0.62);
      ctx.lineTo(x + 4, y - h * 0.55);
      ctx.moveTo(x, y - h * 0.62);
      ctx.lineTo(x, y - h * 0.45);
      ctx.stroke();
      for (let k = 0; k < 16; k++) {
        ctx.fillStyle = hex(r() > 0.5 ? 0x5f9a45 : 0x7cb259, 0.85);
        ctx.beginPath();
        ctx.arc(x - w / 2 + r() * w, y - 8 - r() * 14, 1.5 + r() * 2, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'standingStone': {
      groundShadow(ctx, x, y, s.hw * S * 1.2, 0.3);
      const w = s.hw * S * 1.4;
      const h = s.h * S * 0.92;
      const g = ctx.createLinearGradient(x - w / 2, y - h, x + w / 2, y);
      g.addColorStop(0, '#b9b5c7');
      g.addColorStop(0.6, '#7d7992');
      g.addColorStop(1, '#4a465e');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.lineTo(x - w * 0.42, y - h * 0.7);
      ctx.quadraticCurveTo(x - w * 0.3, y - h, x + w * 0.1, y - h);
      ctx.lineTo(x + w * 0.45, y - h * 0.75);
      ctx.lineTo(x + w / 2, y);
      ctx.closePath();
      ctx.fill();
      sparkle(ctx, x, y - h * 0.55, 0xf0c96a, 10);
      ctx.strokeStyle = 'rgba(255,220,140,0.95)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y - h * 0.55, 5, 0, TAU);
      ctx.moveTo(x, y - h * 0.68);
      ctx.lineTo(x, y - h * 0.42);
      ctx.stroke();
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = hex(r() > 0.5 ? 0x8fa860 : 0xb7c27a, 0.7);
        ctx.beginPath();
        ctx.arc(x - w / 2 + r() * w * 0.6, y - h * (0.2 + r() * 0.6), 1 + r() * 1.6, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'crystalCluster': {
      groundShadow(ctx, x, y, s.hw * S, 0.3);
      sparkle(ctx, x, y - s.h * S * 0.5, 0xb79cff, s.h * S * 0.55);
      const shards = [
        [-9, 0, -14, -30, 6],
        [0, 0, 2, -48, 7],
        [10, 0, 14, -26, 6],
        [4, 2, 8, -18, 4],
      ];
      for (const [bx, by, tx, ty, hw] of shards) {
        const g = ctx.createLinearGradient(x + bx - hw, y + by, x + tx, y + ty);
        g.addColorStop(0, '#5a3fd0');
        g.addColorStop(0.6, '#a58cff');
        g.addColorStop(1, '#f2ecff');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x + bx - hw, y + by);
        ctx.lineTo(x + tx, y + ty);
        ctx.lineTo(x + bx + hw, y + by);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
  }
}

/** Soft radial glow sprite (white, tinted at runtime). */
export function paintGlow(ctx: Ctx, size: number) {
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}
