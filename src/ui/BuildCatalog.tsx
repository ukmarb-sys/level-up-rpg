import { useEffect, useState } from 'react';
import { BUILDINGS, catalogCards, type CatalogCard, type RuleOptions } from '../core/buildings';
import { RESOURCE_TYPES } from '../core/resources';
import type { Building, BuildingType, Resources } from '../core/types';
import { artUrl } from '../assets/artUrls';
import { buildingKey } from '../assets/manifest';
import { BuildingIcon, Glyph, ResourceIcon } from './icons';

interface Props {
  resources: Resources;
  buildings: Building[];
  rules: RuleOptions;
  onPick: (type: BuildingType) => void;
}

/** A building can be placed once its painted r0 sprite is bundled (r1-r3 fall back to it). */
export const hasPaintedArt = (type: BuildingType) => artUrl(buildingKey(type, 0)) !== undefined;

/**
 * The building catalog: a "Build" button that opens a scrollable two-column sheet listing all
 * ten buildings with their costs, prerequisites and status. Available cards start the normal
 * placement workflow; any other card explains exactly what is missing.
 */
export function BuildCatalog({ resources, buildings, rules, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<CatalogCard | null>(null);
  const cards = catalogCards({ buildings, resources }, hasPaintedArt, rules);
  const availableCount = cards.filter((c) => c.placeable).length;
  // keep the explanation in sync with live resources / buildings
  const shownInfo = info ? cards.find((c) => c.type === info.type) ?? null : null;

  useEffect(() => {
    if (!open) setInfo(null);
  }, [open]);

  if (!open) {
    return (
      <nav className="catalog-bar" aria-label="Build menu">
        <button className="catalog-bar__open" onClick={() => setOpen(true)} aria-expanded={false} aria-controls="building-catalog">
          <span>Build</span>
          <span className="catalog-bar__count" aria-label={`${availableCount} available`}>
            {availableCount}
          </span>
          <Glyph name="chevronUp" size={18} />
        </button>
      </nav>
    );
  }

  const tap = (card: CatalogCard) => {
    if (card.placeable) {
      setOpen(false);
      onPick(card.type);
    } else setInfo(card);
  };

  return (
    <section className="catalog" id="building-catalog" aria-label="Building catalog">
      <header className="catalog__head">
        <h2>Buildings</h2>
        <span className="catalog__summary">
          {availableCount} of {cards.length} available
        </span>
        <button className="catalog__close" onClick={() => setOpen(false)} aria-label="Close building catalog">
          <Glyph name="close" size={18} />
        </button>
      </header>
      {shownInfo && (
        <div className={`catalog__info catalog__info--${shownInfo.status}`} role="status" aria-live="polite">
          <strong>
            {BUILDINGS[shownInfo.type].name}: {shownInfo.label}
          </strong>
          <span>{shownInfo.detail}</span>
          <button onClick={() => setInfo(null)} aria-label="Dismiss">
            <Glyph name="close" size={14} />
          </button>
        </div>
      )}
      <div className="catalog__grid">
        {cards.map((card) => (
          <CatalogCardView key={card.type} card={card} resources={resources} bypass={!!rules.ignoreRequirements} onTap={() => tap(card)} />
        ))}
      </div>
    </section>
  );
}

function CatalogCardView({ card, resources, bypass, onTap }: { card: CatalogCard; resources: Resources; bypass: boolean; onTap: () => void }) {
  const def = BUILDINGS[card.type];
  const painted = card.status !== 'awaiting-art';
  return (
    <button
      className={`cat-card cat-card--${card.status}`}
      data-type={card.type}
      data-status={card.status}
      onClick={onTap}
      aria-disabled={!card.placeable}
      aria-label={`${def.name}, ${def.width} by ${def.depth} tiles, ${card.label}. ${card.placeable ? '' : card.detail}`}
    >
      <span className="cat-card__art" aria-hidden>
        {painted ? (
          <BuildingIcon type={card.type} size={56} />
        ) : (
          <span className="cat-card__pending">
            <Glyph name="lock" size={16} />
            <small>Art soon</small>
          </span>
        )}
      </span>
      <span className="cat-card__body">
        <span className="cat-card__name">{def.name}</span>
        <span className="cat-card__size">
          {def.width}×{def.depth} · tier {def.tier}
        </span>
      </span>
      <span className="cat-card__cost">
        {RESOURCE_TYPES.filter((r) => def.cost[r] > 0).map((r) => (
          <span key={r} className={resources[r] < def.cost[r] ? 'short' : ''}>
            <ResourceIcon type={r} size={12} />
            {def.cost[r]}
          </span>
        ))}
      </span>
      <span className="cat-card__req">
        {card.requires.length === 0
          ? 'No prerequisites'
          : card.requires.map((r, i) => (
              <span key={r.type} className={r.met ? 'met' : 'unmet'}>
                {i > 0 ? ', ' : 'Needs '}
                {BUILDINGS[r.type].shortName ?? BUILDINGS[r.type].name}
                {r.met ? ' ✓' : ''}
              </span>
            ))}
        {bypass && card.requires.some((r) => !r.met) && <span className="bypassed"> (skipped in test mode)</span>}
      </span>
      <span className={`cat-card__status cat-card__status--${card.status}`}>
        {card.status === 'locked' && <Glyph name="lock" size={10} />}
        {card.label}
      </span>
    </button>
  );
}
