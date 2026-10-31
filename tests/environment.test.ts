import { describe, expect, it } from 'vitest';
import { PROPS, PROP_ORDER } from '../src/assets/manifest';
import { isoPoint, worldToGridF } from '../src/game/iso';
import { isInsideGrid, layoutProps, PROP_SIZE, ringDepth, SCENERY_RING } from '../src/game/props';
import {
  ambientPlan,
  DETAIL_HEIGHT,
  groundTone,
  layoutGroundDetails,
  qualityFor,
  TONES,
} from '../src/game/environment/layout';

const SIZE = 20;
const props = layoutProps(SIZE);

/** How deep (in tiles) the ground point under a screen position lies inside the grid; <= 0 = outside. */
function penetration(wx: number, wy: number) {
  const g = worldToGridF(wx, wy);
  return Math.min(g.x, g.y, SIZE - g.x, SIZE - g.y);
}

/** Deepest grid penetration of a prop's silhouette rectangle. */
function silhouettePenetration(p: (typeof props)[number]) {
  const base = isoPoint(p.x + 0.5 + p.ox, p.y + 0.5 + p.oy);
  const { hw, h } = PROP_SIZE[p.type];
  let worst = -Infinity;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const wx = base.x + (i / 10 - 0.5) * 2 * hw * p.scale;
      const wy = base.y - (j / 10) * h * p.scale;
      worst = Math.max(worst, penetration(wx, wy));
    }
  }
  return worst;
}

describe('perimeter scenery', () => {
  it('fills a 3-tile ring densely and never places anything on the buildable grid', () => {
    expect(SCENERY_RING).toBe(3);
    expect(props.length).toBeGreaterThan(150);
    for (const p of props) expect(isInsideGrid(p.x, p.y, SIZE)).toBe(false);
  });

  it('keeps every tall prop from covering any buildable tile, as seen on screen', () => {
    for (const p of props.filter((q) => PROPS[q.type].tall)) {
      expect(silhouettePenetration(p), `${p.type} at ${p.x},${p.y}`).toBeLessThanOrEqual(0.02);
    }
  });

  it('keeps low front-edge props to a sliver over the outermost row', () => {
    for (const p of props.filter((q) => !PROPS[q.type].tall)) {
      expect(silhouettePenetration(p), `${p.type} at ${p.x},${p.y}`).toBeLessThanOrEqual(0.4);
    }
  });

  it('puts only low props on the front edges (towards the camera and the build menu)', () => {
    for (const p of props) if (p.x >= 0 && p.y >= 0) expect(PROPS[p.type].tall, `${p.type} at ${p.x},${p.y}`).toBe(false);
  });

  it('builds a varied, layered forest: evergreens, mystical trees, rocks, glowing plants and ruins', () => {
    const counts = Object.fromEntries(PROP_ORDER.map((t) => [t, props.filter((p) => p.type === t).length]));
    for (const t of PROP_ORDER) expect(counts[t], t).toBeGreaterThan(0);
    const evergreens = counts.treePine + counts.treeSpruce + counts.treeFir;
    const mystical = counts.treeMystic + counts.treeEnchanted;
    expect(evergreens).toBeGreaterThan(mystical); // fairytale forest first, mystery as accent
    expect(props.filter((p) => ringDepth(p.x, p.y, SIZE) >= 2 && (p.x < 0 || p.y < 0)).length).toBeGreaterThan(80);
  });

  it('is deterministic', () => {
    expect(layoutProps(SIZE)).toEqual(props);
  });
});

describe('ground details', () => {
  const details = layoutGroundDetails(SIZE, SCENERY_RING);
  it('keeps the buildable area readable: sparse and flat inside the grid', () => {
    const inside = details.filter((d) => isInsideGrid(Math.floor(d.gx), Math.floor(d.gy), SIZE));
    expect(inside.length / (SIZE * SIZE)).toBeLessThan(0.45);
    for (const d of inside) expect(DETAIL_HEIGHT[d.kind]).toBeLessThanOrEqual(6);
  });

  it('is denser in the forest ring and thins with the quality tier', () => {
    const ring = details.length - details.filter((d) => isInsideGrid(Math.floor(d.gx), Math.floor(d.gy), SIZE)).length;
    expect(ring).toBeGreaterThan(200);
    expect(layoutGroundDetails(SIZE, SCENERY_RING, 0.5).length).toBeLessThan(details.length * 0.7);
    expect(layoutGroundDetails(SIZE, SCENERY_RING)).toEqual(details);
  });
});

describe('ground tone', () => {
  it('stays bright and calm inside the grid and darkens into forest floor outside', () => {
    let min = 255;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) min = Math.min(min, ...groundTone(x + 0.5, y + 0.5, SIZE));
    expect(min).toBeGreaterThan(170);
    expect(groundTone(-2.5, 5.5, SIZE)[1]).toBeLessThan(TONES.forestFloor[1] + 1);
    expect(groundTone(-0.5, 5.5, SIZE)[1]).toBeGreaterThan(groundTone(-2.5, 5.5, SIZE)[1]);
  });

  it('varies smoothly everywhere, including across the grid edge (no seams or staircases)', () => {
    for (let y = -SCENERY_RING; y < SIZE + SCENERY_RING; y += 0.25) {
      for (let x = -SCENERY_RING; x < SIZE + SCENERY_RING - 0.25; x += 0.25) {
        const a = groundTone(x, y, SIZE);
        const b = groundTone(x + 0.25, y, SIZE);
        for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k])).toBeLessThan(26);
      }
    }
  });
});

describe('quality tiers and ambient life', () => {
  it('uses a low tier on modest Android phones and Data Saver', () => {
    expect(qualityFor({ cores: 8, memoryGb: 8 }).tier).toBe('high');
    expect(qualityFor({ cores: 4, memoryGb: 8 }).tier).toBe('low');
    expect(qualityFor({ cores: 8, memoryGb: 2 }).tier).toBe('low');
    expect(qualityFor({ cores: 8, saveData: true }).tier).toBe('low');
    expect(qualityFor({}).tier).toBe('high');
  });

  it('stops ambient motion for prefers-reduced-motion', () => {
    const q = qualityFor({ cores: 8, reducedMotion: true });
    expect(q.animate).toBe(false);
    expect(q.fireflies + q.spores).toBe(0);
  });

  it('keeps ambient life restrained and near the edges, with glows on magical props', () => {
    const q = qualityFor({ cores: 8 });
    const plan = ambientPlan(SIZE, props, q);
    expect(plan.fireflies).toHaveLength(16);
    expect(plan.spores.length).toBeLessThanOrEqual(12);
    for (const f of plan.fireflies) {
      const edge = Math.min(f.gx, f.gy, SIZE - f.gx, SIZE - f.gy);
      expect(edge, `${f.gx},${f.gy}`).toBeLessThanOrEqual(1.5);
    }
    expect(plan.glows.length).toBeGreaterThan(10);
    expect(ambientPlan(SIZE, props, q)).toEqual(plan);
  });
});
