import type { GameStore } from '../core/store';
import { milestonesModule } from './milestones';
import type { GameModule } from './types';

/** Modules enabled in this build. Add quests, coaching, progression, etc. here. */
export const MODULES: GameModule[] = [milestonesModule];

export function installModules(store: GameStore, modules: GameModule[] = MODULES): () => void {
  const cleanups = modules.map((m) => m.install({ store }));
  return () => cleanups.forEach((c) => c());
}

export type { GameModule, ModuleContext } from './types';
