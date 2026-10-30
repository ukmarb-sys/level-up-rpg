import type { BuildingType, Resources } from './types';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  description: string;
  /** Footprint in tiles at rotation 0: width along x, depth along y. */
  width: number;
  depth: number;
  cost: Resources;
  /** Resources produced per minute while standing. */
  produces: Partial<Resources>;
  /** Main tint used by the renderer and UI accents. */
  color: number;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  cottage: {
    type: 'cottage',
    name: 'Cottage',
    description: 'A snug home with a smoking chimney. Shelters your first villagers.',
    width: 1,
    depth: 1,
    cost: { wood: 20, stone: 10, magic: 0 },
    produces: {},
    color: 0xb5653b,
  },
  farm: {
    type: 'farm',
    name: 'Farm',
    description: 'Golden fields of moonwheat. Rotate it to fit your streets.',
    width: 2,
    depth: 3,
    cost: { wood: 30, stone: 0, magic: 0 },
    produces: {},
    color: 0xd9b44a,
  },
  sawmill: {
    type: 'sawmill',
    name: 'Sawmill',
    description: 'Turns the old forest into timber. Produces wood over time.',
    width: 2,
    depth: 1,
    cost: { wood: 40, stone: 20, magic: 0 },
    produces: { wood: 6 },
    color: 0x8a5a33,
  },
  mageTower: {
    type: 'mageTower',
    name: 'Mage Tower',
    description: 'An arcane spire that draws magic from the ley lines.',
    width: 2,
    depth: 2,
    cost: { wood: 50, stone: 80, magic: 30 },
    produces: { magic: 3 },
    color: 0x7b5cff,
  },
};

export const BUILDING_ORDER: BuildingType[] = ['cottage', 'farm', 'sawmill', 'mageTower'];

export const STARTING_RESOURCES: Resources = { wood: 200, stone: 150, magic: 50 };

/** Fraction of a building's cost returned when it is demolished. */
export const DEMOLISH_REFUND = 0.5;

export const MAP_SIZE = 20;
