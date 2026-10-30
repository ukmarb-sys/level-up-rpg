/**
 * Programmatic building art. Everything is drawn with Phaser Graphics from isometric
 * primitives, so there are no external image assets.
 *
 * Buildings are authored in a local (u, v) frame matching their rotation-0 footprint
 * (width x depth). `Frame` maps local rectangles into grid space for any rotation,
 * which is what makes rotation visible (doors, chimneys and roofs turn with the building).
 */
import Phaser from 'phaser';
import { BUILDINGS } from '../core/buildings';
import type { BuildingType, Rotation } from '../core/types';
import { isoPoint } from './iso';

export interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

export class Frame {
  constructor(
    readonly W: number,
    readonly D: number,
    readonly rotation: Rotation,
  ) {}

  /** Maps a local point to grid offsets inside the rotated footprint. */
  point(u: number, v: number): { x: number; y: number } {
    const { W, D } = this;
    switch (this.rotation) {
      case 0:
        return { x: u, y: v };
      case 1:
        return { x: D - v, y: u };
      case 2:
        return { x: W - u, y: D - v };
      case 3:
        return { x: v, y: W - u };
    }
  }

  rect(u: number, v: number, w: number, d: number): Rect {
    const a = this.point(u, v);
    const b = this.point(u + w, v + d);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), d: Math.abs(b.y - a.y) };
  }

  /** Local ridge axis 'u' becomes grid 'x' or 'y' depending on rotation. */
  axis(a: 'u' | 'v'): 'x' | 'y' {
    const odd = this.rotation % 2 === 1;
    return (a === 'u') !== odd ? 'x' : 'y';
  }
}

export function shade(color: number, factor: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue));
}

type Pt = { x: number; y: number };
const P = (gx: number, gy: number, z = 0): Pt => isoPoint(gx, gy, z);

function poly(g: Phaser.GameObjects.Graphics, pts: Pt[], color: number, alpha = 1, line?: number) {
  g.fillStyle(color, alpha);
  g.fillPoints(pts, true);
  if (line !== undefined) {
    g.lineStyle(1, line, 0.55 * alpha);
    g.strokePoints(pts, true);
  }
}

/** An isometric box: top, left (+y) and right (+x) faces. */
export function box(g: Phaser.GameObjects.Graphics, r: Rect, z0: number, h: number, color: number, alpha = 1) {
  const { x, y, w, d } = r;
  const z1 = z0 + h;
  const edge = shade(color, 0.45);
  poly(g, [P(x, y + d, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x, y + d, z1)], shade(color, 0.72), alpha, edge);
  poly(g, [P(x + w, y, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x + w, y, z1)], shade(color, 0.56), alpha, edge);
  poly(g, [P(x, y, z1), P(x + w, y, z1), P(x + w, y + d, z1), P(x, y + d, z1)], shade(color, 1.08), alpha, edge);
}

/** Flat diamond on the ground (or raised to z). */
export function flat(g: Phaser.GameObjects.Graphics, r: Rect, z: number, color: number, alpha = 1) {
  const { x, y, w, d } = r;
  poly(g, [P(x, y, z), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z)], color, alpha);
}

/** Gable roof over rect at height z with the ridge along `axis`. */
export function gableRoof(
  g: Phaser.GameObjects.Graphics,
  r: Rect,
  z: number,
  rise: number,
  axis: 'x' | 'y',
  color: number,
  wall: number,
  alpha = 1,
) {
  const { x, y, w, d } = r;
  const zr = z + rise;
  const edge = shade(color, 0.4);
  if (axis === 'x') {
    const my = y + d / 2;
    poly(g, [P(x, y, z), P(x + w, y, z), P(x + w, my, zr), P(x, my, zr)], shade(color, 0.85), alpha, edge);
    poly(g, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, my, zr)], shade(wall, 0.62), alpha, edge);
    poly(g, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, my, zr), P(x, my, zr)], shade(color, 0.7), alpha, edge);
  } else {
    const mx = x + w / 2;
    poly(g, [P(x, y, z), P(x, y + d, z), P(mx, y + d, zr), P(mx, y, zr)], shade(color, 0.95), alpha, edge);
    poly(g, [P(x, y + d, z), P(x + w, y + d, z), P(mx, y + d, zr)], shade(wall, 0.78), alpha, edge);
    poly(g, [P(x + w, y, z), P(x + w, y + d, z), P(mx, y + d, zr), P(mx, y, zr)], shade(color, 0.6), alpha, edge);
  }
}

/** Pyramid/cone roof on a square-ish rect. */
export function spire(g: Phaser.GameObjects.Graphics, r: Rect, z: number, rise: number, color: number, alpha = 1) {
  const { x, y, w, d } = r;
  const apex = P(x + w / 2, y + d / 2, z + rise);
  const edge = shade(color, 0.4);
  poly(g, [P(x, y + d, z), P(x + w, y + d, z), apex], shade(color, 0.8), alpha, edge);
  poly(g, [P(x + w, y, z), P(x + w, y + d, z), apex], shade(color, 0.6), alpha, edge);
}

/** A small vertical rectangle drawn on the +y (left-facing) or +x (right-facing) wall. */
export function wallPatch(
  g: Phaser.GameObjects.Graphics,
  r: Rect,
  face: 'x' | 'y',
  along: number,
  width: number,
  z0: number,
  h: number,
  color: number,
  alpha = 1,
) {
  const pts =
    face === 'y'
      ? [P(r.x + along, r.y + r.d, z0), P(r.x + along + width, r.y + r.d, z0), P(r.x + along + width, r.y + r.d, z0 + h), P(r.x + along, r.y + r.d, z0 + h)]
      : [P(r.x + r.w, r.y + along, z0), P(r.x + r.w, r.y + along + width, z0), P(r.x + r.w, r.y + along + width, z0 + h), P(r.x + r.w, r.y + along, z0 + h)];
  poly(g, pts, color, alpha);
}

/** Picks which visible wall faces a local side so details (doors) turn with the building. */
function visibleFace(frame: Frame, rect: Rect): { face: 'x' | 'y'; len: number } {
  // The local "front" (+v) faces grid +y at rot 0, +x at rot 3 ... use whichever is visible.
  const r = frame.rotation;
  if (r === 0 || r === 1) return { face: r === 0 ? 'y' : 'x', len: r === 0 ? rect.w : rect.d };
  // Front is hidden at rotations 2/3; show the side door on the other visible face.
  return { face: r === 2 ? 'x' : 'y', len: r === 2 ? rect.d : rect.w };
}

export interface ArtAnchors {
  /** Where animated effects attach, in container-local pixels. */
  chimney?: Pt;
  orb?: Pt;
  wheel?: Pt;
  windows?: Pt[];
  crops?: { rows: Pt[][] };
  /** Top of the building, used for floating labels/selection markers. */
  top: Pt;
}

const STONE = 0x8d8a9e;
const DARK_WOOD = 0x5a3a24;
const WOOD = 0x8a5a33;
const WINDOW = 0xffc96b;

export function drawBuilding(
  g: Phaser.GameObjects.Graphics,
  type: BuildingType,
  rotation: Rotation,
  alpha = 1,
): ArtAnchors {
  const def = BUILDINGS[type];
  const f = new Frame(def.width, def.depth, rotation);
  const full = f.rect(0, 0, def.width, def.depth);

  // A soft contact shadow / plinth makes buildings sit on the grass.
  flat(g, full, 0, 0x000000, 0.18 * alpha);

  switch (type) {
    case 'cottage': {
      const body = f.rect(0.16, 0.18, 0.68, 0.64);
      flat(g, f.rect(0.08, 0.1, 0.84, 0.82), 0, 0x6b5a45, alpha);
      box(g, body, 0, 18, 0xe8d3a8, alpha);
      // timber frame
      box(g, f.rect(0.16, 0.18, 0.06, 0.64), 0, 18, DARK_WOOD, alpha);
      const door = visibleFace(f, body);
      wallPatch(g, body, door.face, door.len * 0.38, door.len * 0.24, 0, 11, DARK_WOOD, alpha);
      const win1 = door.face === 'y' ? 'x' : 'y';
      const winLen = win1 === 'y' ? body.w : body.d;
      wallPatch(g, body, win1, winLen * 0.32, winLen * 0.3, 7, 6, WINDOW, alpha);
      const chim = f.rect(0.58, 0.24, 0.13, 0.13);
      const chimDepth = chim.x + chim.y;
      const bodyMid = body.x + body.w / 2 + body.y + body.d / 2;
      const drawChim = () => box(g, chim, 18, 18, 0x7a6f72, alpha);
      if (chimDepth < bodyMid) drawChim();
      gableRoof(g, f.rect(0.1, 0.12, 0.8, 0.76), 18, 14, f.axis('u'), 0xa4452f, 0xe8d3a8, alpha);
      if (chimDepth >= bodyMid) drawChim();
      const winCenter =
        win1 === 'y'
          ? P(body.x + body.w * 0.47, body.y + body.d, 10)
          : P(body.x + body.w, body.y + body.d * 0.47, 10);
      return { chimney: P(chim.x + chim.w / 2, chim.y + chim.d / 2, 38), windows: [winCenter], top: P(full.x + full.w / 2, full.y + full.d / 2, 40) };
    }

    case 'farm': {
      flat(g, full, 0, 0x5b4128, alpha);
      flat(g, f.rect(0.06, 0.06, 1.88, 2.88), 0, 0x6e5131, alpha);
      // fence posts around the edge
      const posts: [number, number][] = [];
      for (let i = 0; i <= 4; i++) posts.push([0.04 + i * 0.48, 0.04], [0.04 + i * 0.48, 2.9]);
      for (let i = 1; i < 6; i++) posts.push([0.04, 0.04 + i * 0.48], [1.9, 0.04 + i * 0.48]);
      // small barn/shed at the back corner
      const shed = f.rect(1.25, 0.12, 0.62, 0.62);
      box(g, shed, 0, 14, 0xa3423a, alpha);
      gableRoof(g, shed, 14, 9, f.axis('v'), 0x5b3a2e, 0xa3423a, alpha);
      for (const [u, v] of posts) box(g, f.rect(u, v, 0.06, 0.06), 0, 6, 0x8f6a43, alpha);
      // crop rows (animated separately)
      const rows: Pt[][] = [];
      for (let r = 0; r < 5; r++) {
        const v = 0.95 + r * 0.42;
        const row: Pt[] = [];
        for (let k = 0; k < 6; k++) {
          const p = f.point(0.22 + k * 0.28, v);
          row.push(P(p.x, p.y, 0));
        }
        rows.push(row);
      }
      const shedTop = shed;
      return { crops: { rows }, top: P(shedTop.x + shedTop.w / 2, shedTop.y + shedTop.d / 2, 28) };
    }

    case 'sawmill': {
      flat(g, f.rect(0.04, 0.06, 1.92, 0.88), 0, 0x5d4a37, alpha);
      const hall = f.rect(0.1, 0.14, 1.1, 0.72);
      box(g, hall, 0, 4, STONE, alpha);
      box(g, hall, 4, 16, WOOD, alpha);
      const door = visibleFace(f, hall);
      wallPatch(g, hall, door.face, door.len * 0.36, door.len * 0.28, 4, 12, 0x3a2716, alpha);
      gableRoof(g, f.rect(0.05, 0.1, 1.2, 0.8), 20, 13, f.axis('u'), 0x4f6b3a, WOOD, alpha);
      // log pile
      const pile = f.rect(1.35, 0.2, 0.55, 0.6);
      for (let i = 0; i < 3; i++) box(g, f.rect(1.36, 0.22 + i * 0.19, 0.52, 0.16), 0, 5, 0x9c6b3e, alpha);
      box(g, f.rect(1.42, 0.3, 0.42, 0.16), 5, 5, 0xa87747, alpha);
      box(g, f.rect(1.42, 0.52, 0.42, 0.16), 5, 5, 0xa87747, alpha);
      const wheelAt = f.point(1.2, 0.5);
      return { wheel: P(wheelAt.x, wheelAt.y, 18), top: P(pile.x, pile.y, 34) };
    }

    case 'mageTower': {
      flat(g, f.rect(0.05, 0.05, 1.9, 1.9), 0, 0x3b3550, alpha);
      // rune circle on the plaza
      flat(g, f.rect(0.2, 0.2, 1.6, 1.6), 0.5, 0x4a3f78, alpha);
      box(g, f.rect(0.35, 0.35, 1.3, 1.3), 0, 10, 0x6d6a84, alpha);
      box(g, f.rect(0.5, 0.5, 1.0, 1.0), 10, 34, 0x7d7a96, alpha);
      box(g, f.rect(0.45, 0.45, 1.1, 1.1), 44, 5, 0x5a5772, alpha);
      box(g, f.rect(0.58, 0.58, 0.84, 0.84), 49, 22, 0x8784a3, alpha);
      const tower = f.rect(0.5, 0.5, 1.0, 1.0);
      // glowing slit windows
      wallPatch(g, tower, 'y', 0.4, 0.2, 22, 12, 0xb79cff, alpha);
      wallPatch(g, tower, 'x', 0.4, 0.2, 22, 12, 0xb79cff, alpha);
      spire(g, f.rect(0.52, 0.52, 0.96, 0.96), 71, 40, 0x4b3a99, alpha);
      return { orb: P(1, 1, 128), windows: [P(0.6 + 0.5, 1.5, 28), P(1.5, 1.1, 28)], top: P(1, 1, 112) };
    }
  }
}

/** Grass tile textures with a few variants for organic ground. */
export function makeGroundTextures(scene: Phaser.Scene, tileW: number, tileH: number) {
  const variants = [0x3f6b3a, 0x3a6536, 0x44723d, 0x3d6838];
  variants.forEach((base, i) => {
    const key = `grass-${i}`;
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const diamond = [
      { x: tileW / 2, y: 0 },
      { x: tileW, y: tileH / 2 },
      { x: tileW / 2, y: tileH },
      { x: 0, y: tileH / 2 },
    ];
    g.fillStyle(base, 1);
    g.fillPoints(diamond, true);
    // deterministic speckles: tufts and tiny flowers
    let seed = 1337 + i * 97;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 14; k++) {
      const u = rnd();
      const v = rnd();
      const x = (u - v) * (tileW / 2) * 0.85 + tileW / 2;
      const y = (u + v) * (tileH / 2) * 0.85 + tileH * 0.075;
      const c = k % 7 === 0 ? (i % 2 ? 0xe6d36a : 0xc8a6ff) : shade(base, rnd() > 0.5 ? 1.25 : 0.8);
      g.fillStyle(c, k % 7 === 0 ? 0.9 : 0.6);
      g.fillRect(x, y, k % 7 === 0 ? 2 : 2, 1);
    }
    g.lineStyle(1, 0x000000, 0.12);
    g.strokePoints(diamond, true);
    g.generateTexture(key, tileW, tileH);
    g.destroy();
  });

  if (!scene.textures.exists('mote')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    for (let r = 8; r > 0; r--) {
      g.fillStyle(0xffffff, 0.08 + (8 - r) * 0.06);
      g.fillCircle(8, 8, r);
    }
    g.generateTexture('mote', 16, 16);
    g.destroy();
  }
}
