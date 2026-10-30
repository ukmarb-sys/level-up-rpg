/** Generates the reference tables embedded in docs/ASSET_SPEC.md (kept in sync by a test). */
import { ASSET_MANIFEST, type AssetEntry } from '../../src/assets/manifest';
import { diamondCorners } from '../../src/assets/spec';

const pt = (p?: { x: number; y: number } | null) => (p ? `(${p.x}, ${p.y})` : '—');

function row(e: AssetEntry) {
  const g = e.geometry;
  const c = diamondCorners(g);
  return `| \`${e.file}.png\` | ${e.required ? '**yes**' : 'no'} | ${g.footprint.w}×${g.footprint.d} | ${g.canvas.width} × ${g.canvas.height} | ${pt(g.anchor)} | ${pt(c.left)} | ${pt(c.right)} | ${pt(c.bottom)} |`;
}

export function assetTables(): string {
  const head =
    '| File (`src/assets/art/…`) | Required | Footprint (w×d) | Canvas (px) | Anchor | Left corner | Right corner | Front corner |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- |';
  const section = (kind: AssetEntry['kind']) => [head, ...ASSET_MANIFEST.filter((e) => e.kind === kind).map(row)].join('\n');
  const fxHead = '| File | Top (marker) | Chimney | Orb | Saw blade | Windows |\n| --- | --- | --- | --- | --- | --- |';
  const fx = ASSET_MANIFEST.filter((e) => e.kind === 'building').map((e) => {
    const f = e.effects ?? {};
    return `| \`${e.file.split('/').pop()}\` | ${pt(e.top)} | ${pt(f.chimney)} | ${pt(f.orb)} | ${pt(f.wheel)} | ${(f.windows ?? []).map(pt).join(' ') || '—'} |`;
  });
  return [
    '### Buildings',
    '',
    section('building'),
    '',
    '### Terrain',
    '',
    section('terrain'),
    '',
    '### Props',
    '',
    section('prop'),
    '',
    '### Reference top and effect points (source px)',
    '',
    fxHead,
    ...fx,
  ].join('\n');
}
