/**
 * The isometric city view. Reads everything from GameStore and only writes back through
 * its interaction methods, so the scene stays a thin rendering/input layer.
 */
import Phaser from 'phaser';
import { footprintSize } from '../core/grid';
import type { GameStore, Snapshot } from '../core/store';
import type { Building, BuildingType, GridPos, Rotation } from '../core/types';
import { box, drawBuilding, flat, makeGroundTextures, type ArtAnchors } from './art';
import { footprintDepth, isoPoint, TILE_H, TILE_W, worldToGridF, worldToTile } from './iso';

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.4;
const DRAG_THRESHOLD = 10;

interface BuildingView {
  building: Building;
  container: Phaser.GameObjects.Container;
  anchors: ArtAnchors;
  dispose: () => void;
}

export class CityScene extends Phaser.Scene {
  private store!: GameStore;
  private dpr = 1;
  private userZoom = 1;
  private views = new Map<string, BuildingView>();
  private ghost?: { key: string; container: Phaser.GameObjects.Container; base: Phaser.GameObjects.Graphics };
  private selection!: Phaser.GameObjects.Graphics;
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

  create() {
    makeGroundTextures(this, TILE_W, TILE_H);
    this.input.addPointer(1);
    this.drawIsland();
    this.spawnMotes();

    this.selection = this.add.graphics().setDepth(5_000);
    this.tweens.add({ targets: this.selection, alpha: { from: 1, to: 0.35 }, duration: 800, yoyo: true, repeat: -1 });

    const cam = this.cameras.main;
    const size = this.store.state.mapSize;
    const centre = isoPoint(size / 2, size / 2);
    cam.centerOn(centre.x, centre.y);
    this.userZoom = Math.min(1.2, Math.max(MIN_ZOOM, this.scale.width / this.dpr / (size * TILE_W * 0.42)));
    this.applyZoom();

    this.setupInput();
    this.unsubscribe = this.store.subscribe(() => this.sync());
    this.sync();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
  }

  update(_time: number, delta: number) {
    this.store.advance(delta);
    const cam = this.cameras.main;
    const g = worldToGridF(cam.midPoint.x, cam.midPoint.y);
    this.store.viewCenter = { x: Math.round(g.x), y: Math.round(g.y) };
  }

  // --- world -------------------------------------------------------------------------
  private drawIsland() {
    const size = this.store.state.mapSize;
    const cliff = this.add.graphics().setDepth(-2000);
    // Floating island: layered earth strata beneath the grass.
    box(cliff, { x: 0, y: 0, w: size, d: size }, -70, 70, 0x4a3426);
    box(cliff, { x: 0, y: 0, w: size, d: size }, -22, 22, 0x5d4330);
    // jagged roots/stalactites below
    for (let i = 0; i < size; i += 1.5) {
      const len = 30 + ((i * 37) % 50);
      const a = isoPoint(i, size, -70);
      const b = isoPoint(i + 1.5, size, -70);
      cliff.fillStyle(0x3a281d, 1).fillTriangle(a.x, a.y, b.x, b.y, (a.x + b.x) / 2, a.y + len);
      const c = isoPoint(size, i, -70);
      const d = isoPoint(size, i + 1.5, -70);
      cliff.fillStyle(0x2c1f17, 1).fillTriangle(c.x, c.y, d.x, d.y, (c.x + d.x) / 2, c.y + len * 0.9);
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = isoPoint(x, y);
        const v = (x * 7 + y * 13 + ((x * y) % 5)) % 4;
        this.add.image(p.x, p.y, `grass-${v}`).setOrigin(0.5, 0).setDepth(-1000);
      }
    }
    // faint ley-line grid glow along the map edge
    const rim = this.add.graphics().setDepth(-999);
    rim.lineStyle(2, 0x9d8cff, 0.35);
    const corners = [isoPoint(0, 0), isoPoint(size, 0), isoPoint(size, size), isoPoint(0, size)];
    rim.strokePoints(corners, true);
    this.tweens.add({ targets: rim, alpha: { from: 0.4, to: 1 }, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private spawnMotes() {
    const size = this.store.state.mapSize;
    for (let i = 0; i < 26; i++) {
      const p = isoPoint(Math.random() * size, Math.random() * size, 10 + Math.random() * 60);
      const tint = Math.random() > 0.5 ? 0xffe28a : 0xb7a4ff;
      const m = this.add.image(p.x, p.y, 'mote').setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
      m.setScale(0.25 + Math.random() * 0.35).setAlpha(0).setDepth(9_000);
      this.tweens.add({
        targets: m,
        x: p.x + (Math.random() - 0.5) * 80,
        y: p.y - 20 - Math.random() * 40,
        alpha: { from: 0, to: 0.9 },
        duration: 3000 + Math.random() * 4000,
        delay: Math.random() * 4000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  // --- sync with store ---------------------------------------------------------------
  private sync() {
    const snap = this.store.getSnapshot();
    const prev = this.lastSnapshot;
    this.lastSnapshot = snap;
    if (!prev || prev.state.buildings !== snap.state.buildings) this.syncBuildings(snap.state.buildings, prev);
    this.syncGhost(snap);
    this.syncSelection(snap);
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
    const g = this.add.graphics();
    container.add(g);
    const anchors = drawBuilding(g, b.type, b.rotation);
    const cleanups = this.animate(b.type, container, anchors);
    if (animateIn) {
      container.setScale(0.6, 0.2).setAlpha(0);
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' });
      this.puff(p.x + (w - d) * (TILE_W / 4), p.y + (w + d) * (TILE_H / 4), 0xf3e2b5);
    }
    return {
      building: b,
      container,
      anchors,
      dispose: () => {
        cleanups.forEach((c) => c());
        this.tweens.killTweensOf(container);
        container.destroy(true);
      },
    };
  }

  /** Subtle per-building life: smoke, flickering windows, waving crops, wheels, orbs. */
  private animate(type: BuildingType, c: Phaser.GameObjects.Container, a: ArtAnchors): (() => void)[] {
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
      const timer = this.time.addEvent({
        delay: 650,
        loop: true,
        callback: () => {
          const s = this.add.image(chimney.x, chimney.y, 'mote').setTint(0xcfc6d6).setScale(0.35).setAlpha(0.5);
          c.add(s);
          this.tweens.add({
            targets: s,
            x: chimney.x + 6 + Math.random() * 8,
            y: chimney.y - 26 - Math.random() * 10,
            scale: 0.9,
            alpha: 0,
            duration: 2200,
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

    if (a.wheel) {
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

    if (a.orb) {
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
      this.views.forEach((v) => v.container.setVisible(true));
      return;
    }
    this.views.forEach((v) => v.container.setVisible(!(mode.kind === 'moving' && v.building.id === mode.id)));

    const key = `${mode.type}:${mode.rotation}`;
    if (!this.ghost || this.ghost.key !== key) {
      this.ghost?.container.destroy(true);
      const container = this.add.container(0, 0);
      const base = this.add.graphics();
      const art = this.add.graphics();
      drawBuilding(art, mode.type, mode.rotation, 0.75);
      container.add([base, art]);
      this.tweens.add({ targets: art, y: -4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.ghost = { key, container, base };
    }
    const { w, d } = footprintSize(mode.type, mode.rotation);
    const p = isoPoint(mode.pos.x, mode.pos.y);
    this.ghost.container.setPosition(p.x, p.y).setDepth(8_000);
    const base = this.ghost.base.clear();
    const colour = ghostValid ? 0x5cffa1 : 0xff5c74;
    flat(base, { x: 0, y: 0, w, d }, 0, colour, 0.35);
    base.lineStyle(2, colour, 0.95);
    base.strokePoints([isoPoint(0, 0), isoPoint(w, 0), isoPoint(w, d), isoPoint(0, d)], true);
  }

  private syncSelection(snap: Snapshot) {
    this.selection.clear();
    if (snap.mode.kind !== 'selected') return;
    const id = snap.mode.id;
    const b = snap.state.buildings.find((x) => x.id === id);
    if (!b) return;
    const { w, d } = footprintSize(b.type, b.rotation);
    this.selection.lineStyle(3, 0xffd56b, 1);
    this.selection.strokePoints([isoPoint(b.x, b.y), isoPoint(b.x + w, b.y), isoPoint(b.x + w, b.y + d), isoPoint(b.x, b.y + d)], true);
    this.selection.setDepth(footprintDepth(b.x, b.y, w, d) - 0.01);
  }

  // --- camera & input ----------------------------------------------------------------
  private applyZoom() {
    this.userZoom = Phaser.Math.Clamp(this.userZoom, MIN_ZOOM, MAX_ZOOM);
    this.cameras.main.setZoom(this.userZoom * this.dpr);
    this.clampCamera();
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
      if (g.kind === 'pending') this.store.tapTile(this.tileAt(pointer));
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
