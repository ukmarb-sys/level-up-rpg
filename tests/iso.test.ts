import { describe, expect, it } from 'vitest';
import { isoPoint, TILE_H, TILE_W, worldToTile } from '../src/game/iso';

describe('isometric projection', () => {
  it('projects grid corners to a 2:1 diamond', () => {
    expect(isoPoint(0, 0)).toEqual({ x: 0, y: 0 });
    expect(isoPoint(1, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
    expect(isoPoint(0, 1)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
    expect(isoPoint(1, 1, 10)).toEqual({ x: 0, y: TILE_H - 10 });
  });

  it('maps tile centres back to the same tile', () => {
    for (let x = 0; x < 20; x += 3)
      for (let y = 0; y < 20; y += 4) {
        const c = isoPoint(x + 0.5, y + 0.5);
        expect(worldToTile(c.x, c.y)).toEqual({ x, y });
      }
  });
});
