import type { BuildingType, ResourceType, Resources } from './types';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  /** Short form for tight UI such as "Needs Alchemist" (defaults to `name`). */
  shortName?: string;
  description: string;
  /** Footprint in tiles at rotation 0: width along x, depth along y. */
  width: number;
  depth: number;
  cost: Resources;
  /** Resources produced per minute while standing. */
  produces: Partial<Resources>;
  /** Main tint used by the renderer and UI accents. */
  color: number;
  /** Place in the progression (1 = available from the start). */
  tier: number;
  /** Building types that must already stand before this one can be built. */
  requires?: BuildingType[];
  /** At most this many may stand at once. */
  limit?: number;
  /** Production bonuses while standing: +fraction for one resource, or for 'all'. Bonuses add up. */
  boosts?: Partial<Record<ResourceType | 'all', number>>;
  /**
   * Offered only when its painted artwork exists. The four starter buildings ship procedural
   * fallbacks; later buildings are never shown as geometric placeholders.
   */
  needsArt?: boolean;
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
    tier: 1,
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
    tier: 1,
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
    tier: 1,
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
    tier: 1,
  },
  blacksmith: {
    type: 'blacksmith',
    name: 'Blacksmith',
    description: 'A roaring forge for picks and chisels. Your quarrymen finally bring back stone.',
    width: 2,
    depth: 1,
    cost: { wood: 60, stone: 20, magic: 0 },
    produces: { stone: 3 },
    color: 0x5b5e66,
    tier: 2,
    requires: ['sawmill'],
    needsArt: true,
  },
  tavern: {
    type: 'tavern',
    name: 'Tavern',
    description: 'Warm bread, cold ale and old songs. Cheered villagers work harder: +10% to all production.',
    width: 2,
    depth: 2,
    cost: { wood: 80, stone: 30, magic: 0 },
    produces: {},
    color: 0xa0522d,
    tier: 2,
    requires: ['cottage', 'farm'],
    limit: 1,
    boosts: { all: 0.1 },
    needsArt: true,
  },
  marketplace: {
    type: 'marketplace',
    name: 'Marketplace',
    description: 'Striped awnings and travelling merchants trading timber and cut stone.',
    width: 3,
    depth: 2,
    cost: { wood: 120, stone: 60, magic: 0 },
    produces: { wood: 2, stone: 2 },
    color: 0xc8963e,
    tier: 3,
    requires: ['tavern'],
    needsArt: true,
  },
  alchemist: {
    type: 'alchemist',
    name: "Alchemist's Workshop",
    shortName: 'Alchemist',
    description: 'Bubbling alembics distil raw magic from moonwheat and crystal dust.',
    width: 2,
    depth: 2,
    cost: { wood: 60, stone: 50, magic: 40 },
    produces: { magic: 4 },
    color: 0x3fa37a,
    tier: 3,
    requires: ['mageTower'],
    needsArt: true,
  },
  temple: {
    type: 'temple',
    name: 'Ancient Temple',
    shortName: 'Temple',
    description: 'A rediscovered sanctuary on the ley lines: +25% magic production.',
    width: 3,
    depth: 3,
    cost: { wood: 0, stone: 180, magic: 120 },
    produces: {},
    color: 0xd8cfae,
    tier: 4,
    requires: ['alchemist'],
    limit: 1,
    boosts: { magic: 0.25 },
    needsArt: true,
  },
  castle: {
    type: 'castle',
    name: 'Castle Keep',
    shortName: 'Keep',
    description: 'The seat of your realm. Its banners rally every guild: +15% to all production.',
    width: 4,
    depth: 4,
    cost: { wood: 300, stone: 300, magic: 150 },
    produces: {},
    color: 0x8f8a80,
    tier: 5,
    requires: ['marketplace', 'temple', 'blacksmith'],
    limit: 1,
    boosts: { all: 0.15 },
    needsArt: true,
  },
};

/** Every building type, in progression order (build menu order). */
export const BUILDING_ORDER: BuildingType[] = [
  'cottage',
  'farm',
  'sawmill',
  'mageTower',
  'blacksmith',
  'tavern',
  'marketplace',
  'alchemist',
  'temple',
  'castle',
];

/** The four buildings of the original prototype, which ship procedural fallback art. */
export const STARTER_BUILDINGS: BuildingType[] = BUILDING_ORDER.filter((t) => !BUILDINGS[t].needsArt);

export type Availability =
  | { ok: true }
  | { ok: false; reason: 'locked'; missing: BuildingType[] }
  | { ok: false; reason: 'limit-reached'; limit: number };

/**
 * Rule overrides. Only Developer Test Mode sets these (see testMode.ts); normal play always uses
 * the defaults, so prerequisites are enforced.
 */
export interface RuleOptions {
  /** Skip building prerequisites (limits, costs and collision still apply). */
  ignoreRequirements?: boolean;
}

/** Whether a new building of this type may be started, given what already stands. */
export function availability(type: BuildingType, standing: { type: BuildingType }[], rules: RuleOptions = {}): Availability {
  const def = BUILDINGS[type];
  const missing = rules.ignoreRequirements ? [] : (def.requires ?? []).filter((r) => !standing.some((b) => b.type === r));
  if (missing.length) return { ok: false, reason: 'locked', missing };
  if (def.limit !== undefined && standing.filter((b) => b.type === type).length >= def.limit) {
    return { ok: false, reason: 'limit-reached', limit: def.limit };
  }
  return { ok: true };
}

export const STARTING_RESOURCES: Resources = { wood: 200, stone: 150, magic: 50 };

/** Fraction of a building's cost returned when it is demolished. */
export const DEMOLISH_REFUND = 0.5;

export const MAP_SIZE = 20;

export interface CatalogEntry {
  type: BuildingType;
  availability: Availability;
}

/**
 * What the build menu offers, in progression order. Painted-only buildings appear once their
 * artwork exists (`hasArt`); until then they're hidden rather than shown as placeholders.
 * Locked and limit-reached entries stay visible so players can see what comes next.
 */
export function buildCatalog(standing: { type: BuildingType }[], hasArt: (type: BuildingType) => boolean): CatalogEntry[] {
  return BUILDING_ORDER.filter((t) => !BUILDINGS[t].needsArt || hasArt(t)).map((type) => ({
    type,
    availability: availability(type, standing),
  }));
}

/** What a catalog card shows about a building right now. */
export type CatalogStatus = 'available' | 'locked' | 'insufficient' | 'built' | 'max' | 'awaiting-art';

export interface CatalogCard {
  type: BuildingType;
  status: CatalogStatus;
  /** Whether tapping the card starts placing it. */
  placeable: boolean;
  /** Prerequisites with whether each already stands (empty for buildings without any). */
  requires: { type: BuildingType; met: boolean }[];
  /** Prerequisites still missing (empty unless locked). */
  missing: BuildingType[];
  /** How much more of each resource is needed (only resources that fall short). */
  shortfall: Partial<Resources>;
  /** Short status label for the card. */
  label: string;
  /** Full explanation, shown when a card that can't be placed is tapped. */
  detail: string;
}

const LABELS: Record<CatalogStatus, string> = {
  available: 'Available',
  locked: 'Locked',
  insufficient: 'Insufficient resources',
  built: 'Built',
  max: 'Maximum reached',
  'awaiting-art': 'Artwork coming soon',
};

const listNames = (types: BuildingType[]) => {
  const names = types.map((t) => BUILDINGS[t].name);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/**
 * The status of one building for the catalog, in priority order: artwork pending (painted-only
 * buildings without their painting can't be placed, even in test mode), built / maximum reached,
 * locked (missing prerequisites), insufficient resources, available.
 */
export function catalogCard(
  type: BuildingType,
  state: { buildings: { type: BuildingType }[]; resources: Resources },
  hasArt: (type: BuildingType) => boolean,
  rules: RuleOptions = {},
): CatalogCard {
  const def = BUILDINGS[type];
  const requires = (def.requires ?? []).map((r) => ({ type: r, met: state.buildings.some((b) => b.type === r) }));
  const shortfall: Partial<Resources> = {};
  for (const r of ['wood', 'stone', 'magic'] as const) {
    if (state.resources[r] < def.cost[r]) shortfall[r] = def.cost[r] - state.resources[r];
  }
  const base = { type, requires, missing: [] as BuildingType[], shortfall };
  const card = (status: CatalogStatus, detail: string, extra: Partial<CatalogCard> = {}): CatalogCard => ({
    ...base,
    status,
    placeable: status === 'available',
    label: LABELS[status],
    detail,
    ...extra,
  });
  if (def.needsArt && !hasArt(type)) {
    return card('awaiting-art', `${def.name} is waiting for its painted artwork. It becomes buildable as soon as the painting arrives.`);
  }
  const avail = availability(type, state.buildings, rules);
  if (!avail.ok && avail.reason === 'limit-reached') {
    return avail.limit === 1
      ? card('built', `Your realm already has its ${def.name}. Only one is allowed per realm.`)
      : card('max', `Your realm already has the maximum of ${avail.limit} ${def.name} buildings.`);
  }
  if (!avail.ok) {
    const met = requires.filter((r) => r.met).map((r) => r.type);
    return card(
      'locked',
      `Build ${listNames(avail.missing)} first.${met.length ? ` (${listNames(met)} already ${met.length === 1 ? 'stands' : 'stand'}.)` : ''}`,
      { missing: avail.missing },
    );
  }
  const short = (Object.keys(shortfall) as (keyof Resources)[]).map((r) => `${shortfall[r]} more ${r}`);
  if (short.length) return card('insufficient', `You need ${short.join(', ')}.`);
  return card('available', `Tap to place ${def.name}.`);
}

/** Every building definition, in progression order, as catalog cards. */
export function catalogCards(
  state: { buildings: { type: BuildingType }[]; resources: Resources },
  hasArt: (type: BuildingType) => boolean,
  rules: RuleOptions = {},
): CatalogCard[] {
  return BUILDING_ORDER.map((t) => catalogCard(t, state, hasArt, rules));
}
