/**
 * Boots Phaser inside a DOM element. The canvas is rendered at device pixel ratio
 * (capped at 2 for battery/perf) and scaled back down via CSS so art stays crisp on phones.
 */
import Phaser from 'phaser';
import type { GameStore } from '../core/store';
import { CityScene } from './CityScene';

export interface GameHandle {
  zoomBy(factor: number): void;
  destroy(): void;
}

const currentDpr = () => Math.min(2, Math.max(1, window.devicePixelRatio || 1));

export function createGame(parent: HTMLElement, store: GameStore): GameHandle {
  let dpr = currentDpr();
  const size = () => ({ w: Math.max(1, parent.clientWidth), h: Math.max(1, parent.clientHeight) });
  const { w, h } = size();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: w * dpr,
    height: h * dpr,
    transparent: true,
    antialias: true,
    banner: false,
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
    input: { activePointers: 3, touch: { capture: true } },
    disableContextMenu: true,
    // Mipmaps for power-of-two textures (grass, environment atlases): smooth when zoomed out.
    render: { mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
  });
  game.scene.add('city', CityScene, true, { store, dpr });

  const scene = () => game.scene.getScene('city') as CityScene | null;

  const resize = () => {
    const nextDpr = currentDpr();
    const { w: cw, h: ch } = size();
    if (nextDpr !== dpr) {
      dpr = nextDpr;
      game.scale.setZoom(1 / dpr);
      scene()?.setDpr(dpr);
    }
    game.scale.resize(cw * dpr, ch * dpr);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(parent);
  const stopPerf = new URLSearchParams(location.search).has('perf') ? perfOverlay(game, parent) : undefined;

  return {
    zoomBy: (f) => scene()?.zoomBy(f),
    destroy: () => {
      observer.disconnect();
      stopPerf?.();
      game.destroy(true);
    },
  };
}

/**
 * Opt-in performance overlay (append ?perf to the URL): FPS, WebGL draw calls and vertices per
 * frame, display objects and the environment quality tier — for checking real Android phones.
 */
function perfOverlay(game: Phaser.Game, parent: HTMLElement): () => void {
  const el = document.createElement('div');
  el.style.cssText =
    'position:absolute;left:8px;top:64px;z-index:40;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.65);color:#c8ffd0;font:11px/1.35 ui-monospace,monospace;pointer-events:none;white-space:pre';
  parent.appendChild(el);
  let draws = 0;
  let verts = 0;
  let frames = 0;
  let unwrap: (() => void) | undefined;
  const wrap = () => {
    const gl = (game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl;
    if (!gl || unwrap) return;
    const de = gl.drawElements.bind(gl);
    const da = gl.drawArrays.bind(gl);
    gl.drawElements = (m, c, t, o) => {
      draws++;
      verts += c;
      de(m, c, t, o);
    };
    gl.drawArrays = (m, f, c) => {
      draws++;
      verts += c;
      da(m, f, c);
    };
    unwrap = () => {
      gl.drawElements = de;
      gl.drawArrays = da;
    };
  };
  const onPost = () => frames++;
  game.events.on(Phaser.Core.Events.POST_RENDER, onPost);
  const timer = setInterval(() => {
    wrap();
    const scene = game.scene.getScene('city') as Phaser.Scene & { perfInfo?: () => string };
    const f = Math.max(1, frames);
    el.textContent =
      `fps ${game.loop.actualFps.toFixed(0)}\n` +
      `draws/frame ${(draws / f).toFixed(0)}\n` +
      `verts/frame ${Math.round(verts / f)}\n` +
      `objects ${scene?.children?.length ?? 0}\n` +
      (scene?.perfInfo?.() ?? '');
    draws = verts = frames = 0;
  }, 500);
  return () => {
    clearInterval(timer);
    game.events.off(Phaser.Core.Events.POST_RENDER, onPost);
    unwrap?.();
    el.remove();
  };
}
