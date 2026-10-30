/** Core domain types. Kept free of Phaser/React so they can be unit-tested and reused. */

export type ResourceType = 'wood' | 'stone' | 'magic';

export type Resources = Record<ResourceType, number>;

export type BuildingType = 'cottage' | 'farm' | 'sawmill' | 'mageTower';

/** Quarter turns clockwise. Odd rotations swap a footprint's width and depth. */
export type Rotation = 0 | 1 | 2 | 3;

export interface GridPos {
  x: number;
  y: number;
}

export interface Building {
  id: string;
  type: BuildingType;
  x: number;
  y: number;
  rotation: Rotation;
  /** Epoch ms when the building was placed; useful for future progression systems. */
  builtAt: number;
}

export interface GameState {
  /** Bumped whenever the persisted shape changes; see save.ts migrations. */
  version: number;
  mapSize: number;
  resources: Resources;
  buildings: Building[];
  /** Fractional production carried between ticks so slow producers still pay out. */
  productionCarry: Resources;
  nextId: number;
  createdAt: number;
  updatedAt: number;
}

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: FailureReason };

export type FailureReason =
  | 'out-of-bounds'
  | 'collision'
  | 'insufficient-resources'
  | 'not-found';
