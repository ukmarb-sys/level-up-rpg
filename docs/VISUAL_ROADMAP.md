# Visual roadmap

Goal: a cohesive, premium hand-painted fantasy city builder on mobile. Everything should match
the painted cottage. **Quality over quantity:** nothing ships as code-drawn placeholder art.

Exact canvas sizes, anchors, prompts and import commands are in [ART_BRIEFS.md](ART_BRIEFS.md)
and [ASSET_SPEC.md](ASSET_SPEC.md) (the source of truth).

## Done

- [x] Painted cottage + garden ground layer (1×1, visual overhang)
- [x] Six painted trees in one shared atlas
- [x] Painted farm, sawmill and mage tower (r0) with living effects
- [x] Painted Blacksmith (r0), in PR #11
- [x] Art-gated catalog: the Tavern, Marketplace, Alchemist, Temple and Castle Keep rules are
  ready and appear automatically when their art lands
- [x] Ambient life: fireflies, spores, glows, butterflies, crystal sparkles, chimney smoke,
  window glows and cloud shadows

## Next: art-only drops (no code changes needed)

Each is an `art:import` plus effect points, `art:webp`, a validation run and a reproducibility
test. Paint the long side of non-square footprints along the **front-left** edge (r0) so no
mirroring is needed.

| Priority | Asset | Footprint and canvas | Unlocks or improves |
| --- | --- | --- | --- |
| 1 | `tavern_r0` | 2×2, 576 × 640 | the Tavern building (+10% production) |
| 1 | `alchemist_r0` | 2×2, 576 × 640 | the Alchemist's Workshop |
| 2 | `marketplace_r0` | 3×2, 704 × 512 | the Marketplace |
| 2 | `temple_r0` | 3×3, 832 × 768 | the Ancient Temple |
| 3 | `castle_r0` | 4×4, 1088 × 1280 | the Castle Keep (end goal) |
| 3 | `terrain/grass_0…3` | 256 × 128 (or seamless squares) | painted ground |
| 4 | `_r1`, `_r2`, `_r3` for every building | same canvas as r0 | true side and back views (no mirrored lighting) |
| 4 | re-export the oak, enchanted, fir and spruce trees with side margin | 320 × H | removes the truncated edges |
| 5 | the remaining props: fern, glowing mushroom, glowing bloom, rocks, ruin pillar, standing stone, crystal cluster | see ASSET_SPEC §6 | a fully painted forest edge |

## Later: art plus small code features

| Feature | Art needed | Code needed |
| --- | --- | --- |
| Cobbled paths | 16 iso path tiles | path tool or auto-paths between doors |
| Decorations | flower beds, fences, lanterns, benches, carts (1×1) | a "decorate" build category (non-blocking) |
| Villagers | 4 characters × 4 directions × 4-frame walk | walking agents between buildings |
| Painted island cliff | a seamless strip of earth, roots and rock | swap the vector cliff for a sprite strip |
| Forge sparks / embers | none | a warm-tinted variant of the `sparkles` effect for the blacksmith |

## Principles

- Match the cottage: warm top-left light, rich painterly texture, 2:1 isometric, the same
  scale (one tile ≈ one cottage).
- One building per image, transparent background, 16 px margin, no baked smoke (the game
  animates it).
- Keep Android performance in check: measure with `?perf` after each visual change (baseline
  about 24–26 draw calls per frame) and pack many small sprites into atlases.
