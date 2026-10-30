/**
 * Extension point for future gameplay systems: real-life quests, AI coaching,
 * character progression, weekly rewards and ancient mysteries.
 *
 * A module receives the shared GameStore, subscribes to events on `store.events`,
 * and returns a cleanup function. Modules must not touch Phaser or React directly,
 * which keeps them testable and lets them run headless (e.g. on a server later).
 */
import type { GameStore } from '../core/store';

export interface GameModule {
  id: string;
  install(ctx: ModuleContext): () => void;
}

export interface ModuleContext {
  store: GameStore;
}
