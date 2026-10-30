/**
 * A tiny typed event bus. Gameplay modules (quests, coaching, progression, weekly
 * rewards, mysteries) subscribe here instead of reaching into the scene or the UI.
 */
import type { Building, FailureReason, GameState } from './types';

export interface GameEvents {
  'state:changed': { state: GameState };
  'building:placed': { building: Building };
  'building:moved': { building: Building };
  'building:demolished': { building: Building };
  'action:failed': { reason: FailureReason };
  'game:saved': { at: number };
  'game:loaded': { state: GameState };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = GameEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    this.handlers.get(event)?.forEach((h) => (h as Handler<E[K]>)(payload));
  }

  clear(): void {
    this.handlers.clear();
  }
}
