/**
 * Example module: celebrates the first time each building type is raised.
 * A seed for the future progression/rewards systems.
 */
import { BUILDINGS } from '../core/buildings';
import type { GameModule } from './types';

const LINES: Record<string, string> = {
  cottage: 'The first hearth is lit. Your realm has a heart.',
  farm: 'Moonwheat sways. Your people will not go hungry.',
  sawmill: 'The saws sing. Timber will flow.',
  mageTower: 'The ley lines answer. Magic stirs in your realm.',
};

export const milestonesModule: GameModule = {
  id: 'milestones',
  install({ store }) {
    return store.events.on('building:placed', ({ building }) => {
      const count = store.state.buildings.filter((b) => b.type === building.type).length;
      if (count === 1) store.toast(LINES[building.type] ?? `First ${BUILDINGS[building.type].name}!`);
    });
  },
};
