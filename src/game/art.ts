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
import { Frame, proceduralAnchors, visibleFace, type ArtAnchors, type Rect } from '../assets/geometry';
import { isoPoint } from './iso';

export { Frame, type ArtAnchors, type Rect };

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
      return proceduralAnchors(type, rotation);
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
      // crop rows are drawn (and animated) by the scene from proceduralAnchors().crops
      return proceduralAnchors(type, rotation);
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
      for (let i = 0; i < 3; i++) box(g, f.rect(1.36, 0.22 + i * 0.19, 0.52, 0.16), 0, 5, 0x9c6b3e, alpha);
      box(g, f.rect(1.42, 0.3, 0.42, 0.16), 5, 5, 0xa87747, alpha);
      box(g, f.rect(1.42, 0.52, 0.42, 0.16), 5, 5, 0xa87747, alpha);
      return proceduralAnchors(type, rotation);
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
      return proceduralAnchors(type, rotation);
    }
  }
}

/**
 * Procedural ground textures (used when no terrain artwork is present). No outlines are baked
 * in: the construction grid is a separate overlay shown only while building.
 */
export function makeGroundTextures(scene: Phaser.Scene, tileW: number, tileH: number) {
  // Near-white bases carry only texture; the scene tints each tile to its final colour.
  const variants = [0xf2f2f2, 0xeaeaea, 0xf6f6f6, 0xeeeeee];
  const diamond = [
    { x: tileW / 2, y: 0 },
    { x: tileW, y: tileH / 2 },
    { x: tileW / 2, y: tileH },
    { x: 0, y: tileH / 2 },
  ];
  variants.forEach((base, i) => {
    const key = `grass-${i}`;
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(base, 1);
    // Overdraw by half a pixel so neighbouring diamonds never show hairline seams.
    g.fillPoints(
      diamond.map((p) => ({ x: p.x + Math.sign(p.x - tileW / 2) * 0.5, y: p.y + Math.sign(p.y - tileH / 2) * 0.5 })),
      true,
    );
    let seed = 1337 + i * 97;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // grass tufts: short light/dark strokes
    for (let k = 0; k < 22; k++) {
      const u = rnd();
      const v = rnd();
      const x = (u - v) * (tileW / 2) * 0.82 + tileW / 2;
      const y = (u + v) * (tileH / 2) * 0.82 + tileH * 0.09;
      g.fillStyle(shade(base, rnd() > 0.45 ? 1.06 : 0.8), 0.75);
      g.fillRect(x, y, 1, 2);
    }
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

/**
 * Procedural fallback props, drawn around (0,0) = centre of a 1x1 footprint at ground level.
 * Returns the height (world px) of the prop's top for depth/effects.
 */
export function drawProp(g: Phaser.GameObjects.Graphics, type: string, variant = 0): number {
  const ellipseShadow = (rx: number) => g.fillStyle(0x000000, 0.22).fillEllipse(0, 2, rx * 2, rx);
  switch (type) {
    case 'treePine': {
      ellipseShadow(14);
      g.fillStyle(0x4a3222, 1).fillRect(-2, -10, 4, 12);
      const tiers = [
        [16, -6, -30],
        [13, -20, -42],
        [9, -32, -54],
      ];
      for (const [hw, base, top] of tiers) {
        g.fillStyle(0x1f4a35, 1).fillTriangle(-hw, base, hw, base, 0, top);
        g.fillStyle(0x163a2a, 1).fillTriangle(0, base, hw, base, 0, top);
      }
      return 54;
    }
    case 'treeOak': {
      ellipseShadow(16);
      g.fillStyle(0x5a3a24, 1).fillRect(-2.5, -14, 5, 16);
      const blobs = [
        [-8, -24, 11, 0x3f7a3a],
        [8, -24, 11, 0x356b33],
        [0, -34, 13, 0x4a8a42],
        [0, -22, 10, 0x2f5f2e],
      ] as const;
      for (const [x, y, r, c] of blobs) g.fillStyle(c, 1).fillCircle(x, y, r);
      g.fillStyle(0x6fae5c, 0.6).fillCircle(-4, -38, 5);
      return 46;
    }
    case 'treeEnchanted': {
      ellipseShadow(14);
      g.fillStyle(0x3b2c3f, 1).fillTriangle(-4, 2, 4, 2, 1, -26);
      g.lineStyle(2, 0x3b2c3f, 1).lineBetween(0, -16, -9, -26).lineBetween(1, -20, 10, -30);
      const blobs = [
        [-9, -30, 9, 0x5b45c0],
        [9, -32, 9, 0x4b3a99],
        [0, -38, 11, 0x6d58d6],
      ] as const;
      for (const [x, y, r, c] of blobs) g.fillStyle(c, 1).fillCircle(x, y, r);
      g.fillStyle(0xb79cff, 0.8).fillCircle(-5, -40, 2).fillCircle(6, -33, 1.6).fillCircle(-10, -29, 1.4);
      return 48;
    }
    case 'rockMossy': {
      ellipseShadow(13);
      g.fillStyle(0x6d6a7c, 1).fillPoints(
        [
          { x: -12, y: 0 },
          { x: -9, y: -10 },
          { x: 0, y: -15 - variant * 2 },
          { x: 10, y: -9 },
          { x: 13, y: 0 },
          { x: 0, y: 4 },
        ],
        true,
      );
      g.fillStyle(0x56536a, 1).fillTriangle(0, -15 - variant * 2, 13, 0, 0, 4);
      g.fillStyle(0x5f8a45, 0.9).fillEllipse(-4, -11, 12, 5);
      return 16;
    }
    case 'ruinPillar': {
      ellipseShadow(13);
      g.fillStyle(0x7d7a96, 1).fillRect(-7, -40, 14, 42);
      g.fillStyle(0x5f5c78, 1).fillRect(1, -40, 6, 42);
      g.fillStyle(0x8f8ca8, 1).fillRect(-10, -4, 20, 6);
      // broken top
      g.fillStyle(0x7d7a96, 1).fillTriangle(-7, -40, 7, -40, -2, -48);
      g.fillStyle(0xf0c96a, 0.9).fillRect(-4, -30, 2, 6).fillRect(-4, -20, 2, 4);
      g.fillStyle(0x4f7a3a, 0.8).fillEllipse(-4, -6, 10, 4);
      return 48;
    }
    case 'crystalCluster': {
      ellipseShadow(11);
      const shards = [
        [-7, 0, -10, -18, 4],
        [0, 0, 1, -26, 5],
        [7, 0, 9, -15, 4],
      ] as const;
      for (const [x, y, tx, ty, hw] of shards) {
        g.fillStyle(0x7b5cff, 1).fillTriangle(x - hw, y, x + hw, y, tx, ty);
        g.fillStyle(0xc4b2ff, 0.85).fillTriangle(x - hw, y, x, y, tx, ty);
      }
      return 26;
    }
  }
  return 0;
}
