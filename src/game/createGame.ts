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

  return {
    zoomBy: (f) => scene()?.zoomBy(f),
    destroy: () => {
      observer.disconnect();
      game.destroy(true);
    },
  };
}
