import { useSyncExternalStore } from 'react';
import type { GameStore, Snapshot } from '../core/store';

export function useSnapshot(store: GameStore): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
