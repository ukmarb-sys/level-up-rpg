/**
 * Pure building geometry shared by the procedural renderer (src/game/art.ts) and the asset
 * manifest: the rotation frame, which wall a door/window goes on, and where effects attach.
 * No Phaser here, so the manifest, validator and tests can use it.
 */
import { BUILDINGS } from '../core/buildings';
import type { BuildingType, Rotation } from '../core/types';
import { isoPoint } from '../game/iso';

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

/**
 * Buildings are authored in a local (u, v) frame matching their rotation-0 footprint
 * (width x depth). Frame maps local rectangles into grid space for any rotation.
 */
export class Frame {
  constructor(
    readonly W: number,
    readonly D: number,
    readonly rotation: Rotation,
  ) {}

  /** Maps a local point to grid offsets inside the rotated footprint. */
  point(u: number, v: number): Pt {
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

/** Picks which visible wall faces a local side so details (doors) turn with the building. */
export function visibleFace(frame: Frame, rect: Rect): { face: 'x' | 'y'; len: number } {
  // The local "front" (+v) faces grid +y at rot 0, +x at rot 3 ... use whichever is visible.
  const r = frame.rotation;
  if (r === 0 || r === 1) return { face: r === 0 ? 'y' : 'x', len: r === 0 ? rect.w : rect.d };
  // Front is hidden at rotations 2/3; show the side door on the other visible face.
  return { face: r === 2 ? 'x' : 'y', len: r === 2 ? rect.d : rect.w };
}

/**
 * Effect attachment points, in container-local world px (origin = the footprint's top corner
 * at ground level, as used by the scene's building containers).
 */
export interface ArtAnchors {
  chimney?: Pt;
  orb?: Pt;
  /** Saw blade on the sawmill. */
  wheel?: Pt;
  windows?: Pt[];
  crops?: { rows: Pt[][] };
  /** Top of the building, used for the selection marker. */
  top: Pt;
}

const P = (gx: number, gy: number, z = 0): Pt => isoPoint(gx, gy, z);

/** Anchors of the procedural buildings. drawBuilding() returns exactly these. */
export function proceduralAnchors(type: BuildingType, rotation: Rotation): ArtAnchors {
  const def = BUILDINGS[type];
  const f = new Frame(def.width, def.depth, rotation);
  const full = f.rect(0, 0, def.width, def.depth);
  switch (type) {
    case 'cottage': {
      const body = f.rect(0.16, 0.18, 0.68, 0.64);
      const door = visibleFace(f, body);
      const win = door.face === 'y' ? 'x' : 'y';
      const chim = f.rect(0.58, 0.24, 0.13, 0.13);
      const winCenter =
        win === 'y' ? P(body.x + body.w * 0.47, body.y + body.d, 10) : P(body.x + body.w, body.y + body.d * 0.47, 10);
      return {
        chimney: P(chim.x + chim.w / 2, chim.y + chim.d / 2, 38),
        windows: [winCenter],
        top: P(full.x + full.w / 2, full.y + full.d / 2, 40),
      };
    }
    case 'farm': {
      const shed = f.rect(1.25, 0.12, 0.62, 0.62);
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
      return { crops: { rows }, top: P(shed.x + shed.w / 2, shed.y + shed.d / 2, 28) };
    }
    case 'sawmill': {
      const pile = f.rect(1.35, 0.2, 0.55, 0.6);
      const wheelAt = f.point(1.2, 0.5);
      return { wheel: P(wheelAt.x, wheelAt.y, 18), top: P(pile.x, pile.y, 34) };
    }
    case 'mageTower':
      return { orb: P(1, 1, 128), windows: [P(0.6 + 0.5, 1.5, 28), P(1.5, 1.1, 28)], top: P(1, 1, 112) };
  }
}
