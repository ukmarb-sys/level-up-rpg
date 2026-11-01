/**
 * The isometric city view. Reads everything from GameStore and only writes back through
 * its interaction methods, so the scene stays a thin rendering/input layer.
 */
import Phaser from 'phaser';
import { footprintSize } from '../core/grid';
import type { GameStore, Snapshot } from '../core/store';
import type { Building, BuildingType, GridPos, Rotation } from '../core/types';
import { drawBuilding, flat, makeButterflyTexture, makeMoteTexture, type ArtAnchors } from './art';
import { buildingChoice, effectPoint, lodTextureKey, makeSprite, queueArt, type LoadedArt } from './assets';
import { detectQuality } from './environment/device';
import { EnvironmentLayer } from './environment/EnvironmentLayer';
import { smokeStyle, sparklePalette } from './effectPalette';
import { buildingAt } from '../core/grid';
import { groundKey, type AssetEntry } from '../assets/manifest';
import { overhangs, type GridRect } from '../assets/spec';
import {
  BASE_MIN_ZOOM,
  chooseLod,
  drawnVisualRect,
  groundDecalDepth,
  HIT_ALPHA,
  initialView,
  maxZoomFor,
  resolveTap,
  spritePixelAt,
  type LodFactor,
} from './spriteRules';
import { footprintDepth, isoPoint, TILE_H, TILE_W, worldToGridF, worldToTile } from './iso';

const MIN_ZOOM = BASE_MIN_ZOOM;
const DRAG_THRESHOLD = 10;

const GRID_DEPTH = -500;

/** What addBuildingVisual produced for one building. */
interface VisualParts {
  anchors: ArtAnchors & { sprite?: boolean };
  /** Upright painted sprite (absent for procedural buildings). */
  sprite?: { img: Phaser.GameObjects.Image; key: string; flipX: boolean; entry: AssetEntry };
  /** Optional ground layer (garden/path/shadow), same anchor as the sprite. */
  ground?: { img: Phaser.GameObjects.Image; key: string };
  /** Visual footprint in grid tiles relative to the building's logical top corner. */
  visual: GridRect;
}

interface BuildingView {
  building: Building;
  container: Phaser.GameObjects.Container;
  anchors: ArtAnchors;
  parts: VisualParts;
  dispose: () => void;
}

interface LodImage {
  img: Phaser.GameObjects.Image;
  key: string;
  /** Atlas frame, when the image draws from one. */
  frame?: string;
  scaleX: number;
  scaleY: number;
}

export class CityScene extends Phaser.Scene {
  private store!: GameStore;
  private dpr = 1;
  private userZoom = 1;
  private views = new Map<string, BuildingView>();
  private ghost?: {
    key: string;
    container: Phaser.GameObjects.Container;
    base: Phaser.GameObjects.Graphics;
    /** Collision outline drawn above the preview art, which can fully cover its own tile. */
    overlay: Phaser.GameObjects.Graphics;
    sprites: Phaser.GameObjects.Image[];
    visual: GridRect;
  };
  private selection!: Phaser.GameObjects.Graphics;
  private marker!: Phaser.GameObjects.Container;
  private grid!: Phaser.GameObjects.Graphics;
  private gridShown = false;
  private art!: LoadedArt;
  private environment!: EnvironmentLayer;
  private lodImages = new Set<LodImage>();
  private lod: LodFactor = 1;
  private unsubscribe?: () => void;
  private lastSnapshot?: Snapshot;

  // gesture state
  private gesture:
    | { kind: 'none' }
    | { kind: 'pending' | 'pan'; startX: number; startY: number; scrollX: number; scrollY: number }
    | { kind: 'ghost'; offset: GridPos }
    | { kind: 'pinch'; dist: number; zoom: number; mid: { x: number; y: number } } = { kind: 'none' };

  constructor() {
    super('city');
  }

  init(data: { store: GameStore; dpr: number }) {
    this.store = data.store;
    this.dpr = data.dpr;
  }

  preload() {
    this.art = queueArt(this);
  }

  create() {
    makeMoteTexture(this);
    makeButterflyTexture(this);
    this.input.addPointer(1);
    this.environment = new EnvironmentLayer(this, {
      mapSize: this.store.state.mapSize,
      art: this.art,
      quality: detectQuality(),
      trackLod: (img, key) => this.trackLod(img, key),
    });
    this.environment.build();
    this.drawGrid();

    this.selection = this.add.graphics().setDepth(5_000);
    this.tweens.add({ targets: this.selection, alpha: { from: 1, to: 0.55 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.marker = this.makeSelectionMarker();

    const cam = this.cameras.main;
    const size = this.store.state.mapSize;
    // Open on the player's buildings at a zoom where they are clearly visible on a phone.
    const view = initialView(
      this.store.state.buildings.map((b) => ({ x: b.x, y: b.y, ...footprintSize(b.type, b.rotation) })),
      size,
      this.scale.width / this.dpr,
      TILE_W,
    );
    const centre = isoPoint(view.center.x, view.center.y);
    cam.centerOn(centre.x, centre.y);
    this.userZoom = view.zoom;
    this.applyZoom();

    this.setupInput();
    this.unsubscribe = this.store.subscribe(() => this.sync());
    this.sync();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
  }

  update(time: number, delta: number) {
    this.store.advance(delta);
    this.environment.update(time);
    const cam = this.cameras.main;
    const g = worldToGridF(cam.midPoint.x, cam.midPoint.y);
    this.store.viewCenter = { x: Math.round(g.x), y: Math.round(g.y) };
  }

  // --- world -------------------------------------------------------------------------
  /** Construction grid, faded in only while placing or moving a building. */
  private drawGrid() {
    const size = this.store.state.mapSize;
    const g = this.add.graphics().setDepth(GRID_DEPTH).setAlpha(0);
    g.lineStyle(1, 0xe9e2ff, 0.28);
    for (let i = 0; i <= size; i++) {
      g.lineBetween(isoPoint(i, 0).x, isoPoint(i, 0).y, isoPoint(i, size).x, isoPoint(i, size).y);
      g.lineBetween(isoPoint(0, i).x, isoPoint(0, i).y, isoPoint(size, i).x, isoPoint(size, i).y);
    }
    this.grid = g;
  }

  private occupied?: Phaser.GameObjects.Graphics;

  private setGridVisible(show: boolean, ignoreId?: string) {
    this.occupied?.destroy();
    this.occupied = undefined;
    if (show) {
      // Tint occupied tiles so free space reads at a glance.
      const g = this.add.graphics().setDepth(GRID_DEPTH + 1);
      for (const b of this.store.state.buildings) {
        if (b.id === ignoreId) continue;
        const { w, d } = footprintSize(b.type, b.rotation);
        flat(g, { x: b.x, y: b.y, w, d }, 0, 0x1a1030, 0.28);
      }
      this.occupied = g;
    }
    if (show === this.gridShown) return;
    this.gridShown = show;
    this.tweens.killTweensOf(this.grid);
    this.tweens.add({ targets: this.grid, alpha: show ? 1 : 0, duration: 220 });
  }

  // --- sync with store ---------------------------------------------------------------
  private sync() {
    const snap = this.store.getSnapshot();
    const prev = this.lastSnapshot;
    this.lastSnapshot = snap;
    if (!prev || prev.state.buildings !== snap.state.buildings) this.syncBuildings(snap.state.buildings, prev);
    this.syncGhost(snap);
    this.syncSelection(snap);
    const m = snap.mode;
    const building = m.kind === 'placing' || m.kind === 'moving';
    if (building || this.gridShown) this.setGridVisible(building, m.kind === 'moving' ? m.id : undefined);
  }

  private syncBuildings(buildings: Building[], prev?: Snapshot) {
    const seen = new Set<string>();
    for (const b of buildings) {
      seen.add(b.id);
      const view = this.views.get(b.id);
      if (view && view.building.x === b.x && view.building.y === b.y && view.building.rotation === b.rotation) continue;
      view?.dispose();
      const isNew = !view && !!prev;
      this.views.set(b.id, this.createView(b, isNew));
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      this.puff(view.container.x, view.container.y, 0x8d7a66);
      view.dispose();
      this.views.delete(id);
    }
  }

  private createView(b: Building, animateIn: boolean): BuildingView {
    const p = isoPoint(b.x, b.y);
    const { w, d } = footprintSize(b.type, b.rotation);
    const container = this.add.container(p.x, p.y).setDepth(footprintDepth(b.x, b.y, w, d));
    const parts = this.addBuildingVisual(container, b.type, b.rotation, 1, 'scene');
    if (parts.ground) {
      // Ground layers live in their own depth band beneath every upright building.
      parts.ground.img.setPosition(p.x + parts.ground.img.x, p.y + parts.ground.img.y).setDepth(groundDecalDepth(b.x, b.y, w, d));
    }
    const anchors = parts.anchors;
    const cleanups = this.animate(b.type, container, anchors);
    if (animateIn) {
      container.setScale(0.6, 0.2).setAlpha(0);
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' });
      if (parts.ground) {
        parts.ground.img.setAlpha(0);
        this.tweens.add({ targets: parts.ground.img, alpha: 1, duration: 420 });
      }
      this.puff(p.x + (w - d) * (TILE_W / 4), p.y + (w + d) * (TILE_H / 4), 0xf3e2b5);
    }
    return {
      building: b,
      container,
      anchors,
      parts,
      dispose: () => {
        cleanups.forEach((c) => c());
        this.tweens.killTweensOf(container);
        if (parts.ground) {
          this.tweens.killTweensOf(parts.ground.img);
          parts.ground.img.destroy();
        }
        container.destroy(true);
      },
    };
  }

  /** Registers an image for level-of-detail texture switching as the camera zooms. */
  private trackLod<T extends Phaser.GameObjects.Image>(img: T, key: string): T {
    const frame = img.frame.name === '__BASE' ? undefined : img.frame.name;
    const rec: LodImage = { img, key, frame, scaleX: img.scaleX, scaleY: img.scaleY };
    this.lodImages.add(rec);
    img.once(Phaser.GameObjects.Events.DESTROY, () => this.lodImages.delete(rec));
    if (this.lod !== 1) this.applyLodTo(rec);
    return img;
  }

  private applyLodTo(rec: LodImage) {
    rec.img.setTexture(lodTextureKey(this, rec.key, this.lod), rec.frame);
    rec.img.setScale(rec.scaleX * this.lod, rec.scaleY * this.lod);
  }

  private updateLod() {
    const next = chooseLod(this.cameras.main.zoom);
    if (next === this.lod) return;
    this.lod = next;
    this.lodImages.forEach((rec) => this.applyLodTo(rec));
  }

  /**
   * Adds artwork for a building to a container positioned at the footprint's top corner.
   * Uses the painted sprite when one loaded, otherwise the procedural drawing. A painted
   * sprite's optional ground layer goes into the container (`'container'`, used by the
   * placement preview) or is returned as a separate scene object (`'scene'`) so the caller can
   * put it in the ground-decal depth band.
   */
  private addBuildingVisual(
    container: Phaser.GameObjects.Container,
    type: BuildingType,
    rotation: Rotation,
    alpha: number,
    groundTarget: 'scene' | 'container',
  ): VisualParts {
    const { w, d } = footprintSize(type, rotation);
    const choice = buildingChoice(this.art, type, rotation);
    if (!choice) {
      const g = this.add.graphics();
      container.add(g);
      return { anchors: drawBuilding(g, type, rotation, alpha), visual: { x: 0, y: 0, w, d } };
    }
    const centre = isoPoint(w / 2, d / 2);
    const entry = this.art.entry(choice.key)!;
    let ground: VisualParts['ground'];
    const gKey = groundKey(choice.key);
    if (this.art.has(gKey)) {
      const gImg = this.trackLod(makeSprite(this, this.art, { key: gKey, flipX: choice.flipX }), gKey);
      gImg.setPosition(centre.x, centre.y).setAlpha(alpha);
      if (groundTarget === 'container') container.add(gImg);
      ground = { img: gImg, key: gKey };
    }
    const img = this.trackLod(makeSprite(this, this.art, choice), choice.key).setPosition(centre.x, centre.y).setAlpha(alpha);
    const shadow = this.add.graphics();
    flat(shadow, { x: 0, y: 0, w, d }, 0, 0x000000, 0.16 * alpha);
    container.add([shadow, img]);
    const at = (pt: { x: number; y: number }) => {
      const e = effectPoint(entry, pt, choice.flipX);
      return { x: centre.x + e.x, y: centre.y + e.y };
    };
    const fx = entry.effects ?? {};
    return {
      anchors: {
        chimney: fx.chimney ? at(fx.chimney) : undefined,
        orb: fx.orb ? at(fx.orb) : undefined,
        windows: fx.windows?.map(at),
        sparkles: fx.sparkles?.map(at),
        butterflies: fx.butterflies?.map(at),
        wheel: fx.wheel ? at(fx.wheel) : undefined,
        // Measured top of the painted pixels (art-meta.json) or the manifest reference.
        top: entry.top ? at(entry.top) : { x: centre.x, y: img.getTopCenter().y + 6 },
        sprite: true,
      },
      sprite: { img, key: choice.key, flipX: choice.flipX, entry },
      ground,
      visual: overhangs(entry.geometry) ? drawnVisualRect(entry.geometry, choice.flipX) : { x: 0, y: 0, w, d },
    };
  }

  /** Dashed diamond outline of a grid rectangle (used to show artwork overhang). */
  private dashedRect(g: Phaser.GameObjects.Graphics, r: GridRect, ox: number, oy: number, colour: number, alpha: number) {
    const pts = [isoPoint(ox + r.x, oy + r.y), isoPoint(ox + r.x + r.w, oy + r.y), isoPoint(ox + r.x + r.w, oy + r.y + r.d), isoPoint(ox + r.x, oy + r.y + r.d)];
    g.lineStyle(1.5, colour, alpha);
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.floor(len / 8));
      for (let k = 0; k < n; k += 2) {
        const t0 = k / n;
        const t1 = Math.min(1, (k + 1) / n);
        g.lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
      }
    }
  }

  /**
   * Finds what a tap at `world` hits: the front-most upright artwork (pixel-accurate), the
   * building on the tapped tile, and any ground layer under the finger.
   */
  private pick(world: { x: number; y: number }, tile: GridPos) {
    const hits: { upright?: string; tile?: string; ground?: string } = {};
    hits.tile = buildingAt(tile, this.store.state.buildings)?.id;
    const views = [...this.views.values()].filter((v) => v.container.visible).sort((a, b) => b.container.depth - a.container.depth);
    const alphaAt = (key: string, flipX: boolean, entry: AssetEntry, img: Phaser.GameObjects.Image) => {
      const m = img.getWorldTransformMatrix();
      const px = spritePixelAt(world, { x: m.tx, y: m.ty }, entry.geometry, flipX);
      return px ? (this.textures.getPixelAlpha(px.x, px.y, key) ?? 0) : 0;
    };
    for (const v of views) {
      const sp = v.parts.sprite;
      if (!hits.upright && sp && alphaAt(sp.key, sp.flipX, sp.entry, sp.img) > HIT_ALPHA) hits.upright = v.building.id;
      const gr = v.parts.ground;
      if (!hits.ground && gr && sp && alphaAt(gr.key, sp.flipX, sp.entry, gr.img) > HIT_ALPHA) hits.ground = v.building.id;
    }
    return hits;
  }

  /** Subtle per-building life: smoke, flickering windows, waving crops, wheels, orbs. */
  private animate(type: BuildingType, c: Phaser.GameObjects.Container, a: ArtAnchors & { sprite?: boolean }): (() => void)[] {
    const cleanups: (() => void)[] = [];
    const glow = (pt: { x: number; y: number }, tint: number, scale: number) => {
      const img = this.add.image(pt.x, pt.y, 'mote').setTint(tint).setScale(scale).setBlendMode(Phaser.BlendModes.ADD);
      c.add(img);
      this.tweens.add({ targets: img, alpha: { from: 0.45, to: 1 }, duration: 900 + Math.random() * 900, yoyo: true, repeat: -1 });
      return img;
    };
    a.windows?.forEach((w) => glow(w, 0xffb347, type === 'mageTower' ? 0.9 : 0.7));

    if (a.chimney) {
      const chimney = a.chimney;
      const smoke = smokeStyle(type);
      const timer = this.time.addEvent({
        delay: smoke.interval,
        loop: true,
        callback: () => {
          const s = this.add.image(chimney.x, chimney.y, 'mote').setTint(smoke.tint).setScale(smoke.scaleFrom).setAlpha(smoke.alpha);
          c.add(s);
          this.tweens.add({
            targets: s,
            x: chimney.x + smoke.drift + Math.random() * smoke.driftJitter,
            y: chimney.y - smoke.rise - Math.random() * smoke.riseJitter,
            scale: smoke.scaleTo,
            alpha: 0,
            duration: smoke.duration,
            onComplete: () => s.destroy(),
          });
        },
      });
      cleanups.push(() => timer.remove());
    }

    if (a.crops) {
      const crops = this.add.graphics();
      c.add(crops);
      const rows = a.crops.rows;
      const draw = (t: number) => {
        crops.clear();
        rows.forEach((row, r) =>
          row.forEach((pt, k) => {
            const sway = Math.sin(t / 650 + r * 0.6 + k * 0.4) * 1.6;
            crops.lineStyle(2, r % 2 ? 0xc79a32 : 0xd9b44a, 1);
            crops.lineBetween(pt.x - 3, pt.y, pt.x - 3 + sway, pt.y - 9);
            crops.lineBetween(pt.x + 3, pt.y + 1, pt.x + 3 + sway, pt.y - 8);
            crops.fillStyle(0xf2d27a, 1).fillCircle(pt.x - 3 + sway, pt.y - 10, 1.6);
          }),
        );
      };
      const timer = this.time.addEvent({ delay: 90, loop: true, callback: () => draw(this.time.now) });
      draw(this.time.now);
      cleanups.push(() => timer.remove());
    }

    if (a.wheel && a.sprite) {
      // Painted sawmills keep their own blade; add drifting sawdust instead of drawing one.
      const wheel = a.wheel;
      const timer = this.time.addEvent({
        delay: 420,
        loop: true,
        callback: () => {
          const s = this.add.image(wheel.x, wheel.y, 'mote').setTint(0xe8c48a).setScale(0.18).setAlpha(0.8);
          c.add(s);
          this.tweens.add({
            targets: s,
            x: wheel.x + (Math.random() - 0.5) * 16,
            y: wheel.y + 4 + Math.random() * 6,
            alpha: 0,
            duration: 900,
            onComplete: () => s.destroy(),
          });
        },
      });
      cleanups.push(() => timer.remove());
    } else if (a.wheel) {
      const wheel = this.add.graphics({ x: a.wheel.x, y: a.wheel.y });
      wheel.fillStyle(0xd7dbe4, 1).fillCircle(0, 0, 8);
      wheel.fillStyle(0x6b7280, 1).fillCircle(0, 0, 2.5);
      wheel.fillStyle(0xd7dbe4, 1);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        wheel.fillTriangle(Math.cos(ang) * 8, Math.sin(ang) * 8, Math.cos(ang + 0.35) * 10.5, Math.sin(ang + 0.35) * 10.5, Math.cos(ang + 0.6) * 8, Math.sin(ang + 0.6) * 8);
      }
      wheel.setScale(1, 0.85);
      c.add(wheel);
      this.tweens.add({ targets: wheel, angle: 360, duration: 1800, repeat: -1 });
    }

    if (a.orb && a.sprite) {
      // The painted crystal already glows: a soft breathing halo only, no bobbing light.
      const halo = glow(a.orb, 0x8f6bff, 1.5);
      halo.setAlpha(0.5);
      this.tweens.killTweensOf(halo);
      this.tweens.add({ targets: halo, alpha: { from: 0.25, to: 0.6 }, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (a.orb) {
      const halo = glow(a.orb, 0x8f6bff, 2.6);
      const orb = glow(a.orb, 0xe4dcff, 1.0);
      this.tweens.add({ targets: [orb, halo], y: a.orb.y - 8, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      for (let i = 0; i < 3; i++) {
        const rune = this.add.image(a.orb.x, a.orb.y, 'mote').setTint(0xc4b2ff).setScale(0.3).setBlendMode(Phaser.BlendModes.ADD);
        c.add(rune);
        const orbit = { t: (i / 3) * Math.PI * 2 };
        this.tweens.add({
          targets: orbit,
          t: orbit.t + Math.PI * 2,
          duration: 3200,
          repeat: -1,
          onUpdate: () => rune.setPosition(a.orb!.x + Math.cos(orbit.t) * 18, a.orb!.y + 30 + Math.sin(orbit.t) * 7),
        });
        cleanups.push(() => this.tweens.killTweensOf(orbit));
      }
    }
    const motion = this.environment?.quality.animate ?? true;
    const low = this.environment?.quality.tier === 'low';

    if (a.sparkles?.length) {
      // Crystals and potions: a soft glint on each, breathing out of step, and motes drifting
      // up from them, in the building's own magic colour (effectPalette.ts).
      const palette = sparklePalette(type);
      a.sparkles.forEach((p, i) => {
        const g = this.add.image(p.x, p.y, 'mote').setTint(palette.glow).setScale(0.55).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35);
        c.add(g);
        if (motion) this.tweens.add({ targets: g, alpha: { from: 0.15, to: 0.6 }, duration: 1300 + i * 270, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 350 });
      });
      if (motion) {
        const pts = a.sparkles;
        const timer = this.time.addEvent({
          delay: low ? 900 : 480,
          loop: true,
          callback: () => {
            const p = pts[Math.floor(Math.random() * pts.length)];
            const m = this.add
              .image(p.x + (Math.random() - 0.5) * 4, p.y, 'mote')
              .setTint(palette.motes[Math.floor(Math.random() * palette.motes.length)])
              .setScale(0.16 + Math.random() * 0.1)
              .setBlendMode(Phaser.BlendModes.ADD);
            c.add(m);
            this.tweens.add({
              targets: m,
              y: p.y - 14 - Math.random() * 12,
              x: m.x + (Math.random() - 0.5) * 8,
              alpha: { from: 0.95, to: 0 },
              duration: 1500 + Math.random() * 700,
              ease: 'Sine.easeOut',
              onComplete: () => m.destroy(),
            });
          },
        });
        cleanups.push(() => timer.remove());
      }
    }

    if (a.butterflies?.length && motion) {
      // A couple of butterflies drifting between the flowers and the field.
      const pts = a.butterflies;
      const count = low ? 1 : Math.min(3, pts.length);
      const tints = [0xfff4b0, 0xffffff, 0xcfe4ff];
      for (let i = 0; i < count; i++) {
        const start = pts[i % pts.length];
        const b = this.add.image(start.x, start.y - 6, 'butterfly').setTint(tints[i % tints.length]).setScale(0.22);
        c.add(b);
        const flap = this.tweens.add({ targets: b, scaleX: { from: 0.22, to: 0.06 }, duration: 110 + i * 15, yoyo: true, repeat: -1 });
        const hop = () => {
          if (!b.active) return;
          const to = pts[Math.floor(Math.random() * pts.length)];
          this.tweens.add({
            targets: b,
            x: to.x + (Math.random() - 0.5) * 10,
            y: to.y - 4 - Math.random() * 8,
            duration: 1800 + Math.random() * 1600,
            ease: 'Sine.easeInOut',
            delay: 300 + Math.random() * 900,
            onComplete: hop,
          });
        };
        hop();
        cleanups.push(() => {
          flap.remove();
          this.tweens.killTweensOf(b);
        });
      }
    }
    return cleanups;
  }

  private puff(x: number, y: number, tint: number) {
    for (let i = 0; i < 10; i++) {
      const m = this.add.image(x, y, 'mote').setTint(tint).setScale(0.5).setDepth(9_500);
      const ang = Math.random() * Math.PI * 2;
      this.tweens.add({
        targets: m,
        x: x + Math.cos(ang) * (20 + Math.random() * 20),
        y: y + Math.sin(ang) * 10 - 10,
        alpha: 0,
        scale: 1.1,
        duration: 600 + Math.random() * 300,
        onComplete: () => m.destroy(),
      });
    }
  }

  private syncGhost(snap: Snapshot) {
    const { mode, ghostValid } = snap;
    if (mode.kind !== 'placing' && mode.kind !== 'moving') {
      this.ghost?.container.destroy(true);
      this.ghost = undefined;
      // reveal a building hidden while it was being moved
      this.views.forEach((v) => this.setViewVisible(v, true));
      return;
    }
    this.views.forEach((v) => this.setViewVisible(v, !(mode.kind === 'moving' && v.building.id === mode.id)));

    const key = `${mode.type}:${mode.rotation}`;
    if (!this.ghost || this.ghost.key !== key) {
      this.ghost?.container.destroy(true);
      const container = this.add.container(0, 0);
      const base = this.add.graphics();
      const art = this.add.container(0, 0);
      const overlay = this.add.graphics();
      container.add([base, art, overlay]);
      const parts = this.addBuildingVisual(art, mode.type, mode.rotation, 0.75, 'container');
      const sprites = [parts.sprite?.img, parts.ground?.img].filter((i): i is Phaser.GameObjects.Image => !!i);
      this.tweens.add({ targets: art, y: -4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.ghost = { key, container, base, overlay, sprites, visual: parts.visual };
    }
    const { w, d } = footprintSize(mode.type, mode.rotation);
    const p = isoPoint(mode.pos.x, mode.pos.y);
    this.ghost.container.setPosition(p.x, p.y).setDepth(8_000);
    const base = this.ghost.base.clear();
    const colour = ghostValid ? 0x5cffa1 : 0xff5c74;
    // The solid diamond is the logical footprint: the only area that collides.
    flat(base, { x: 0, y: 0, w, d }, 0, colour, 0.35);
    base.lineStyle(2, colour, 0.95);
    base.strokePoints([isoPoint(0, 0), isoPoint(w, 0), isoPoint(w, d), isoPoint(0, d)], true);
    // A dashed outline shows decorative overhang, which never blocks placement.
    const v = this.ghost.visual;
    if (v.x !== 0 || v.y !== 0 || v.w !== w || v.d !== d) this.dashedRect(base, v, 0, 0, 0xffffff, 0.55);
    // Painted art can hide the diamond beneath it, so repeat the collision outline on top and
    // tint the preview red while the spot is blocked.
    const overlay = this.ghost.overlay.clear();
    overlay.lineStyle(2, colour, 0.9);
    overlay.strokePoints([isoPoint(0, 0), isoPoint(w, 0), isoPoint(w, d), isoPoint(0, d)], true);
    for (const img of this.ghost.sprites) {
      if (ghostValid) img.clearTint();
      else img.setTint(0xff8a8a);
    }
  }

  private setViewVisible(v: BuildingView, visible: boolean) {
    v.container.setVisible(visible);
    v.parts.ground?.img.setVisible(visible);
  }

  private makeSelectionMarker(): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    g.fillStyle(0x1a1030, 0.9).fillTriangle(-9, -14, 9, -14, 0, 0);
    g.fillStyle(0xffd56b, 1).fillTriangle(-6, -12, 6, -12, 0, -2);
    const glow = this.add.image(0, -8, 'mote').setTint(0xffd56b).setScale(1.6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
    const marker = this.add.container(0, 0, [glow, g]).setDepth(9_200).setVisible(false);
    this.tweens.add({ targets: g, y: -6, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return marker;
  }

  private syncSelection(snap: Snapshot) {
    this.selection.clear();
    this.marker.setVisible(false);
    if (snap.mode.kind !== 'selected') return;
    const id = snap.mode.id;
    const b = snap.state.buildings.find((x) => x.id === id);
    if (!b) return;
    const { w, d } = footprintSize(b.type, b.rotation);
    const corners = [isoPoint(b.x, b.y), isoPoint(b.x + w, b.y), isoPoint(b.x + w, b.y + d), isoPoint(b.x, b.y + d)];
    flat(this.selection, { x: b.x, y: b.y, w, d }, 0, 0xffd56b, 0.18);
    this.selection.lineStyle(6, 0xffd56b, 0.25).strokePoints(corners, true);
    this.selection.lineStyle(2, 0xfff0c2, 1).strokePoints(corners, true);
    // Drawn just under the building so the glow frames it without covering it.
    this.selection.setDepth(footprintDepth(b.x, b.y, w, d) - 0.01);
    const view = this.views.get(id);
    const v = view?.parts.visual;
    if (v && (v.x !== 0 || v.y !== 0 || v.w !== w || v.d !== d)) this.dashedRect(this.selection, v, b.x, b.y, 0xffd56b, 0.6);
    if (view) {
      this.marker.setPosition(view.container.x + view.anchors.top.x, view.container.y + view.anchors.top.y - 10).setVisible(true);
    }
  }

  // --- camera & input ----------------------------------------------------------------
  private applyZoom() {
    this.userZoom = Phaser.Math.Clamp(this.userZoom, MIN_ZOOM, maxZoomFor(this.dpr, this.art.any));
    this.cameras.main.setZoom(this.userZoom * this.dpr);
    this.clampCamera();
    this.updateLod();
  }

  private clampCamera() {
    const cam = this.cameras.main;
    const size = this.store.state.mapSize;
    const halfW = (size * TILE_W) / 2;
    const mid = cam.midPoint;
    const cx = Phaser.Math.Clamp(mid.x, -halfW, halfW);
    const cy = Phaser.Math.Clamp(mid.y, -40, size * TILE_H + 40);
    if (cx !== mid.x || cy !== mid.y) cam.centerOn(cx, cy);
  }

  /** Zoom keeping the world point under (sx, sy) fixed on screen. */
  private zoomAt(newZoom: number, sx: number, sy: number) {
    const cam = this.cameras.main;
    const before = cam.getWorldPoint(sx, sy);
    this.userZoom = newZoom;
    this.applyZoom();
    cam.preRender();
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
    this.clampCamera();
  }

  private tileAt(pointer: Phaser.Input.Pointer): GridPos {
    const w = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return worldToTile(w.x, w.y);
  }

  private ghostContains(tile: GridPos): GridPos | null {
    const mode = this.store.mode;
    if (mode.kind !== 'placing' && mode.kind !== 'moving') return null;
    const { w, d } = footprintSize(mode.type, mode.rotation as Rotation);
    const inside = tile.x >= mode.pos.x && tile.x < mode.pos.x + w && tile.y >= mode.pos.y && tile.y < mode.pos.y + d;
    return inside ? { x: tile.x - mode.pos.x, y: tile.y - mode.pos.y } : null;
  }

  private activePointers(): Phaser.Input.Pointer[] {
    return this.input.manager.pointers.filter((p) => p.isDown);
  }

  private setupInput() {
    const cam = this.cameras.main;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const down = this.activePointers();
      if (down.length >= 2) {
        const [a, b] = down;
        this.gesture = {
          kind: 'pinch',
          dist: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y),
          zoom: this.userZoom,
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
        return;
      }
      const offset = this.ghostContains(this.tileAt(pointer));
      if (offset) {
        this.gesture = { kind: 'ghost', offset };
        return;
      }
      this.gesture = { kind: 'pending', startX: pointer.x, startY: pointer.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const g = this.gesture;
      if (g.kind === 'pinch') {
        const [a, b] = this.activePointers();
        if (!a || !b) return;
        const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        // pan with the midpoint, zoom with the spread
        cam.scrollX -= (mid.x - g.mid.x) / cam.zoom;
        cam.scrollY -= (mid.y - g.mid.y) / cam.zoom;
        g.mid = mid;
        this.zoomAt(g.zoom * (dist / Math.max(1, g.dist)), mid.x, mid.y);
        return;
      }
      if (!pointer.isDown) return;
      if (g.kind === 'ghost') {
        const t = this.tileAt(pointer);
        this.store.moveGhost({ x: t.x - g.offset.x, y: t.y - g.offset.y });
        return;
      }
      if (g.kind === 'pending' || g.kind === 'pan') {
        const dx = pointer.x - g.startX;
        const dy = pointer.y - g.startY;
        if (g.kind === 'pending' && Math.hypot(dx, dy) < DRAG_THRESHOLD * this.dpr) return;
        g.kind = 'pan';
        cam.scrollX = g.scrollX - dx / cam.zoom;
        cam.scrollY = g.scrollY - dy / cam.zoom;
        this.clampCamera();
      }
    });

    const end = (pointer: Phaser.Input.Pointer) => {
      const g = this.gesture;
      if (g.kind === 'pending') {
        const tile = this.tileAt(pointer);
        const mode = this.store.mode.kind;
        if (mode === 'placing' || mode === 'moving') this.store.tapTile(tile);
        else this.store.tapBuilding(resolveTap(this.pick(this.cameras.main.getWorldPoint(pointer.x, pointer.y), tile)), tile);
      }
      // after a pinch, wait until all fingers lift before starting a new gesture
      this.gesture = this.activePointers().length > 0 && g.kind === 'pinch' ? g : { kind: 'none' };
      if (this.gesture.kind === 'pinch' && this.activePointers().length < 2) this.gesture = { kind: 'none' };
    };
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);

    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      this.zoomAt(this.userZoom * Math.exp(-dy * 0.0015), pointer.x, pointer.y);
    });

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') this.store.rotate();
      else if (e.key === 'Escape') this.store.cancel();
      else if (e.key === 'Enter') this.store.confirm();
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.applyZoom());
  }

  /** Extra lines for the ?perf overlay. */
  perfInfo(): string {
    const e = this.environment;
    return `quality ${e.quality.tier}${e.quality.animate ? '' : ' (still)'}\nprops ${e.stats.props} (painted types ${e.stats.paintedProps}) details ${e.stats.details}\nambient ${e.stats.ambient}`;
  }

  /** Called by the host when devicePixelRatio changes (e.g. moving between screens). */
  setDpr(dpr: number) {
    this.dpr = dpr;
    this.applyZoom();
  }

  /** Smoothly zooms by a factor around the screen centre (used by on-screen buttons). */
  zoomBy(factor: number) {
    this.zoomAt(this.userZoom * factor, this.scale.width / 2, this.scale.height / 2);
  }
}
