/**
 * Enchanted Wilderness environment: floating island, seamless grass with a smooth tone field,
 * ground details, a layered perimeter forest and restrained ambient life. Built once; everything
 * static is a batched Image from a few atlases, and all animation runs in one update() pass
 * (no per-object tweens).
 *
 * Painted artwork still wins: terrain/grass_N tiles and props/* sprites from the asset pipeline
 * replace the procedural versions automatically.
 */
import Phaser from 'phaser';
import { propKey } from '../../assets/manifest';
import { box } from '../art';
import { makeSprite, terrainChoice, type LoadedArt } from '../assets';
import { footprintDepth, isoPoint, TILE_H, TILE_W, worldToGridF } from '../iso';
import { hash2, mixColor } from '../noise';
import { layoutProps, SCENERY_RING, type PropPlacement } from '../props';
import { ambientPlan, groundTone, layoutGroundDetails, type AmbientPlan, type Quality, type Rgb } from './layout';
import { ENV_PAINTED, buildPaintedPropAtlas } from './paintedAtlas';
import { PAINT_SCALE } from './paint';
import { detailPivot, ENV_DETAILS, ENV_GLOW, ENV_GRASS, ENV_PROPS, ensureEnvironmentTextures, propFrame, propPivot } from './textures';

export const DEPTH = {
  cliff: -2000,
  ground: -1000,
  tone: -999,
  rim: -998,
  details: -900,
  /** Glows and particles sit above everything in the world but below the selection marker. */
  ambient: 9_000,
};

/** World px per tone-field pixel; the field is upscaled with bilinear filtering for smooth blends. */
const TONE_RES = 8;

const toHex = ([r, g, b]: Rgb) => (r << 16) | (g << 8) | b;

interface Firefly {
  img: Phaser.GameObjects.Image;
  hx: number;
  hy: number;
  seed: number;
}
interface Spore {
  img: Phaser.GameObjects.Image;
  hx: number;
  hy: number;
  seed: number;
}
interface Glow {
  img: Phaser.GameObjects.Image;
  base: number;
  seed: number;
}

export interface EnvironmentOptions {
  mapSize: number;
  art: LoadedArt;
  quality: Quality;
  trackLod: <T extends Phaser.GameObjects.Image>(img: T, key: string) => T;
}

export class EnvironmentLayer {
  readonly props: PropPlacement[];
  private plan!: AmbientPlan;
  private fireflies: Firefly[] = [];
  private spores: Spore[] = [];
  private glows: Glow[] = [];
  get quality() {
    return this.opts.quality;
  }
  /** Counts for the ?perf overlay and tests. */
  readonly stats = { details: 0, props: 0, paintedProps: 0, ambient: 0 };

  constructor(
    private scene: Phaser.Scene,
    private opts: EnvironmentOptions,
  ) {
    this.props = layoutProps(opts.mapSize);
  }

  build() {
    ensureEnvironmentTextures(this.scene);
    this.drawCliff();
    if (this.opts.art.terrainKeys.length) this.drawPaintedTerrain();
    else this.drawGround();
    this.drawRim();
    this.drawDetails();
    this.drawProps();
    this.plan = ambientPlan(this.opts.mapSize, this.props, this.opts.quality);
    this.spawnAmbient();
  }

  // --- island ------------------------------------------------------------------------
  private drawCliff() {
    const size = this.opts.mapSize;
    const ring = SCENERY_RING;
    const lo = -ring;
    const span = size + ring * 2;
    const cliff = this.scene.add.graphics().setDepth(DEPTH.cliff);
    box(cliff, { x: lo, y: lo, w: span, d: span }, -78, 78, 0x4a3426);
    box(cliff, { x: lo, y: lo, w: span, d: span }, -24, 24, 0x5d4330);
    box(cliff, { x: lo, y: lo, w: span, d: span }, -6, 6, 0x34512e);
    for (let i = lo; i < size + ring; i += 1.5) {
      const len = 30 + ((Math.abs(i) * 37) % 50);
      const a = isoPoint(i, size + ring, -78);
      const b = isoPoint(i + 1.5, size + ring, -78);
      cliff.fillStyle(0x3a281d, 1).fillTriangle(a.x, a.y, b.x, b.y, (a.x + b.x) / 2, a.y + len);
      const c = isoPoint(size + ring, i, -78);
      const d = isoPoint(size + ring, i + 1.5, -78);
      cliff.fillStyle(0x2c1f17, 1).fillTriangle(c.x, c.y, d.x, d.y, (c.x + d.x) / 2, c.y + len * 0.9);
    }
  }

  /** Island bounds in world px. */
  private bounds() {
    const size = this.opts.mapSize;
    const lo = -SCENERY_RING;
    const hi = size + SCENERY_RING;
    return {
      lo,
      hi,
      minX: isoPoint(lo, hi).x,
      maxX: isoPoint(hi, lo).x,
      minY: isoPoint(lo, lo).y,
      maxY: isoPoint(hi, hi).y,
      corners: [isoPoint(lo, lo), isoPoint(hi, lo), isoPoint(hi, hi), isoPoint(lo, hi)],
    };
  }

  /**
   * One seamless grass TileSprite in world space (no per-tile seams) masked to the island,
   * multiplied by a low-resolution tone field that bilinear filtering turns into soft moss,
   * meadow and forest-floor blends.
   */
  private drawGround() {
    const b = this.bounds();
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const grass = this.scene.add.tileSprite(b.minX, b.minY, w, h, ENV_GRASS).setOrigin(0, 0).setDepth(DEPTH.ground);
    // 2 texels per world px: crisp when zoomed in, mipmapped when zoomed out.
    grass.setTileScale(0.5, 0.5);
    const shape = this.scene.make.graphics({}, false);
    shape.fillStyle(0xffffff).fillPoints(b.corners, true);
    grass.setMask(shape.createGeometryMask());

    // tone field
    const tw = Math.ceil(w / TONE_RES) + 1;
    const th = Math.ceil(h / TONE_RES) + 1;
    const c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    const ctx = c.getContext('2d')!;
    const data = ctx.createImageData(tw, th);
    const size = this.opts.mapSize;
    for (let py = 0; py < th; py++) {
      for (let px = 0; px < tw; px++) {
        const g = worldToGridF(b.minX + (px + 0.5) * TONE_RES, b.minY + (py + 0.5) * TONE_RES);
        // clamp to the island so colours extend to the masked edge without fading
        const gx = Math.min(b.hi - 0.01, Math.max(b.lo, g.x));
        const gy = Math.min(b.hi - 0.01, Math.max(b.lo, g.y));
        const t = groundTone(gx, gy, size);
        const i = (py * tw + px) * 4;
        data.data[i] = t[0];
        data.data[i + 1] = t[1];
        data.data[i + 2] = t[2];
        data.data[i + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
    const key = 'env-tone';
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.scene.textures.addCanvas(key, c);
    const tone = this.scene.add.image(b.minX, b.minY, key).setOrigin(0, 0).setScale(TONE_RES).setDepth(DEPTH.tone);
    tone.setBlendMode(Phaser.BlendModes.MULTIPLY);
    tone.setMask(shape.createGeometryMask());
  }

  /** Painted terrain tiles from the asset pipeline (unchanged behaviour), tinted by the tone field. */
  private drawPaintedTerrain() {
    const size = this.opts.mapSize;
    for (let y = -SCENERY_RING; y < size + SCENERY_RING; y++) {
      for (let x = -SCENERY_RING; x < size + SCENERY_RING; x++) {
        const p = isoPoint(x, y);
        const key = terrainChoice(this.opts.art, Math.floor(hash2(x, y, 3) * 4))!;
        const img = this.scene.add.image(p.x, p.y, key).setDepth(DEPTH.ground).setOrigin(0.5, 0);
        img.setScale(TILE_W / img.width, TILE_H / img.height);
        img.setTint(mixColor(toHex(groundTone(x + 0.5, y + 0.5, size)), 0xffffff, 0.6));
        this.opts.trackLod(img, key);
      }
    }
  }

  /** Faint ley-line glow along the edge of the buildable realm. */
  private drawRim() {
    const size = this.opts.mapSize;
    const rim = this.scene.add.graphics().setDepth(DEPTH.rim);
    rim.lineStyle(2, 0x9d8cff, 0.28);
    rim.strokePoints([isoPoint(0, 0), isoPoint(size, 0), isoPoint(size, size), isoPoint(0, size)], true);
    if (this.opts.quality.animate) {
      this.scene.tweens.add({ targets: rim, alpha: { from: 0.4, to: 0.9 }, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  private drawDetails() {
    const placements = layoutGroundDetails(this.opts.mapSize, SCENERY_RING, this.opts.quality.detailDensity);
    for (const d of placements) {
      const p = isoPoint(d.gx, d.gy);
      const img = this.scene.add.image(p.x, p.y, ENV_DETAILS, d.kind).setOrigin(detailPivot.x, detailPivot.y);
      const s = d.scale / PAINT_SCALE;
      img.setScale(d.flip ? -s : s, s).setDepth(DEPTH.details);
    }
    this.stats.details = placements.length;
  }

  private drawProps() {
    // With painted props, every prop (painted and procedural) draws from one combined atlas
    // that switches LOD as a whole: a single texture keeps the forest in one batch on Android.
    const painted = buildPaintedPropAtlas(this.scene, this.opts.art, ENV_PROPS);
    const combined = painted.size > 0;
    this.stats.paintedProps = painted.size;
    for (const p of this.props) {
      const gx = p.x + 0.5 + p.ox;
      const gy = p.y + 0.5 + p.oy;
      const at = isoPoint(gx, gy);
      const depth = footprintDepth(gx - 0.5, gy - 0.5, 1, 1);
      const key = propKey(p.type);
      if (this.opts.art.has(key)) {
        // Painted art draws from the shared atlas when it could be packed (one batch for the
        // whole forest). Same per-placement size variation as the procedural props, set before
        // LOD tracking, which records the base scale.
        const atlas = painted.has(key) ? ENV_PAINTED : undefined;
        const img = makeSprite(this.scene, this.opts.art, { key, flipX: p.flip }, atlas);
        img.setScale(img.scaleX * p.scale);
        this.opts.trackLod(img, atlas ?? key).setPosition(at.x, at.y).setDepth(depth);
        continue;
      }
      const pivot = propPivot(p.type);
      const atlas = combined ? ENV_PAINTED : ENV_PROPS;
      const img = this.scene.add.image(at.x, at.y, atlas, propFrame(p.type, p.variant)).setOrigin(pivot.x, pivot.y);
      const s = p.scale / PAINT_SCALE;
      img.setScale(p.flip ? -s : s, s).setDepth(depth);
      if (combined) this.opts.trackLod(img, ENV_PAINTED);
    }
    this.stats.props = this.props.length;
  }

  // --- ambient life --------------------------------------------------------------------
  private spawnAmbient() {
    const add = (gx: number, gy: number, lift: number) => {
      const p = isoPoint(gx, gy, lift);
      return this.scene.add.image(p.x, p.y, ENV_GLOW).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.ambient);
    };
    for (const g of this.plan.glows) {
      const img = add(g.gx, g.gy, g.lift).setTint(g.colour);
      const base = g.lift > 20 ? 0.32 : 0.45;
      img.setScale(g.lift > 20 ? 0.9 : 0.45).setAlpha(base);
      this.glows.push({ img, base, seed: g.seed });
    }
    for (const f of this.plan.fireflies) {
      const img = add(f.gx, f.gy, 8).setTint(f.seed % 3 ? 0xf5e98a : 0xc9ff9a).setScale(0.16);
      this.fireflies.push({ img, hx: f.gx, hy: f.gy, seed: f.seed });
    }
    for (const s of this.plan.spores) {
      const img = add(s.gx, s.gy, 20).setTint(s.seed % 2 ? 0xe3c4ff : 0x9ff3ea).setScale(0.11).setAlpha(0);
      this.spores.push({ img, hx: s.gx, hy: s.gy, seed: s.seed });
    }
    this.stats.ambient = this.glows.length + this.fireflies.length + this.spores.length;
  }

  /** Per-frame ambient animation (cheap: sin/cos on a few dozen sprites). */
  update(time: number) {
    if (!this.opts.quality.animate) return;
    const t = time / 1000;
    for (const g of this.glows) g.img.setAlpha(g.base * (0.7 + 0.3 * Math.sin(t * (0.9 + (g.seed % 5) * 0.13) + g.seed)));
    for (const f of this.fireflies) {
      const ph = f.seed * 1.7;
      const gx = f.hx + Math.sin(t * 0.21 + ph) * 0.9 + Math.sin(t * 0.53 + ph * 2) * 0.3;
      const gy = f.hy + Math.cos(t * 0.17 + ph) * 0.9 + Math.cos(t * 0.47 + ph) * 0.3;
      const p = isoPoint(gx, gy, 10 + Math.sin(t * 0.8 + ph) * 5);
      f.img.setPosition(p.x, p.y);
      // slow blink: mostly lit, occasionally dark
      const blink = Math.sin(t * (0.7 + (f.seed % 4) * 0.15) + ph);
      f.img.setAlpha(Math.max(0, blink) * 0.9);
    }
    for (const s of this.spores) {
      const period = 7 + (s.seed % 4);
      const u = ((t + s.seed * 1.37) % period) / period; // 0..1 lifetime
      const p = isoPoint(s.hx + Math.sin(t * 0.6 + s.seed) * 0.25, s.hy, 18 + u * 46);
      s.img.setPosition(p.x + Math.sin(t * 1.3 + s.seed) * 3, p.y);
      s.img.setAlpha(Math.sin(u * Math.PI) * 0.75);
    }
  }
}
