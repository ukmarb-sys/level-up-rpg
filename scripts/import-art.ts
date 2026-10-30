/**
 * Imports raw artwork into src/assets/art as a spec-exact, validated sprite.
 *
 *   npm run art:import -- <input.png> --as cottage_r0
 *   npm run art:import -- <input.png> --as farm_r1 --fill 0.9 --offset-y 6
 *   npm run art:import -- <texture.png> --as grass_0            (square texture → iso tile)
 *   npm run art:import -- --measure cottage_r0                  (re-measure an aligned file)
 *   npm run art:import -- --measure cottage_r0 --effect chimney=204,180
 *
 * Options:
 *   --as NAME           target: cottage_r0..mageTower_r3, grass_0..3, tree_pine, ... (or full manifest path)
 *   --fill F            fraction of the footprint width the art spans (default 0.96)
 *   --offset-y PX       move the art down (+) or up (-) after aligning its lowest point
 *   --mirror / --no-mirror   force or forbid horizontal mirroring (default: auto-detect)
 *   --key auto|on|off   background removal (default auto)
 *   --tile square|diamond   terrain source type (default auto)
 *   --effect NAME=X,Y   set an effect point in output px (chimney, orb, wheel, window); NAME=none disables
 *   --visual WxD        the art paints a WxD-tile area centred on the logical footprint (e.g. 2x2
 *                       for a 1x1 cottage with a half-tile garden all round); logical footprint unchanged
 *   --visual U0,V0,U1,V1   asymmetric visual footprint in the building's local tile frame
 *   --ground FILE       ground layer (garden/path/shadow) exported at the same size as the input
 *   --height PX         canvas height (multiple of 32); default grows automatically for tall art
 *   --no-auto-height    shrink tall art to the default canvas instead of growing it
 *   --keep-islands      keep small detached pieces (sparks, motes) instead of removing them as specks
 *   --dry-run           report only; write nothing
 * Writes: src/assets/art/<path>.png, src/assets/art/art-meta.json, art-previews/<name>.preview.png
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logicalBounds, type LocalBounds, type Pt } from '../src/assets/geometry';
import { ASSET_MANIFEST, GROUND_SUFFIX, type AssetEntry } from '../src/assets/manifest';
import { applyMeta } from '../src/assets/meta';
import type { ArtMeta, ArtMetaEntry } from '../src/assets/meta';
import { decodeImage } from './lib/image';
import { importObject, importTerrain, measureObject, renderPreview, type ImportResult } from './lib/import';
import { encodeRgba } from './lib/png';
import { validateArt, type ArtFile } from './lib/validate';

const root = fileURLToPath(new URL('..', import.meta.url));
const artDir = join(root, 'src', 'assets', 'art');
const metaPath = join(artDir, 'art-meta.json');
const previewDir = join(root, 'art-previews');

function fail(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

export function findEntry(name: string): AssetEntry | undefined {
  const clean = name.replace(/\.(png|webp)$/i, '');
  return ASSET_MANIFEST.find((e) => e.file === clean || e.file.split('/').pop() === clean);
}

function parseArgs(argv: string[]) {
  const opts = {
    input: undefined as string | undefined,
    as: undefined as string | undefined,
    measure: undefined as string | undefined,
    fill: undefined as number | undefined,
    offsetY: undefined as number | undefined,
    mirror: 'auto' as 'auto' | boolean,
    key: 'auto' as 'auto' | 'on' | 'off',
    tile: 'auto' as 'auto' | 'square' | 'diamond',
    effects: {} as Record<string, Pt | null> & { windows?: Pt[] },
    dryRun: false,
    keepIslands: false,
    visual: undefined as string | undefined,
    ground: undefined as string | undefined,
    height: undefined as number | undefined,
    autoHeight: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? fail(`Missing value for ${a}`);
    if (a === '--as') opts.as = next();
    else if (a === '--measure') opts.measure = next();
    else if (a === '--fill') opts.fill = Number(next());
    else if (a === '--offset-y') opts.offsetY = Number(next());
    else if (a === '--mirror') opts.mirror = true;
    else if (a === '--no-mirror') opts.mirror = false;
    else if (a === '--key') opts.key = next() as typeof opts.key;
    else if (a === '--tile') opts.tile = next() as typeof opts.tile;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--keep-islands') opts.keepIslands = true;
    else if (a === '--visual') opts.visual = next();
    else if (a === '--ground') opts.ground = next();
    else if (a === '--height') opts.height = Number(next());
    else if (a === '--no-auto-height') opts.autoHeight = false;
    else if (a === '--effect') {
      const m = /^(chimney|orb|wheel|window|windows)=(none|(-?\d+),(-?\d+))$/.exec(next());
      if (!m) fail('Use --effect chimney=X,Y | orb=X,Y | wheel=X,Y | window=X,Y | NAME=none');
      const point = m[2] === 'none' ? null : { x: Number(m[3]), y: Number(m[4]) };
      if (m[1].startsWith('window')) opts.effects.windows = point ? [...(opts.effects.windows ?? []), point] : [];
      else opts.effects[m[1]] = point;
    } else if (a.startsWith('--')) fail(`Unknown option ${a}`);
    else opts.input = a;
  }
  if (opts.fill !== undefined && !(opts.fill > 0.3 && opts.fill <= 1.2)) fail('--fill must be between 0.3 and 1.2');
  return opts;
}

/**
 * Parses --visual: "WxD" (centred on the logical footprint) or "U0,V0,U1,V1" (local tiles).
 * Sizes are in the building's own r0 frame (width x depth), whichever rotation is imported.
 */
export function parseVisual(spec: string, entry: AssetEntry): LocalBounds {
  if (!entry.building) throw new Error('--visual only applies to building sprites');
  const L = logicalBounds(entry.building.type);
  const size = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(spec);
  if (size) {
    const vw = Number(size[1]);
    const vd = Number(size[2]);
    const du = (vw - L.u1) / 2;
    const dv = (vd - L.v1) / 2;
    return { u0: -du, v0: -dv, u1: L.u1 + du, v1: L.v1 + dv };
  }
  const nums = spec.split(',').map(Number);
  if (nums.length === 4 && nums.every(Number.isFinite)) return { u0: nums[0], v0: nums[1], u1: nums[2], v1: nums[3] };
  throw new Error(`--visual must be WxD (e.g. 2x2) or U0,V0,U1,V1 (e.g. -0.5,-0.5,1.5,1.5); got "${spec}"`);
}

function readMeta(): ArtMeta {
  return existsSync(metaPath) ? (JSON.parse(readFileSync(metaPath, 'utf8')) as ArtMeta) : {};
}

function writeMeta(meta: ArtMeta) {
  const sorted = Object.fromEntries(Object.keys(meta).sort().map((k) => [k, meta[k]]));
  writeFileSync(metaPath, `${JSON.stringify(sorted, null, 2)}\n`);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(png|webp)$/i.test(n) ? [p] : [];
  });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const target = opts.measure ?? opts.as;
  if (!target) fail('Specify --as NAME (with an input file) or --measure NAME. See the header of scripts/import-art.ts.');
  const entry = findEntry(target);
  if (!entry) fail(`"${target}" is not in the asset manifest. Examples: cottage_r0, farm_r1, grass_0, tree_pine`);
  const outPath = join(artDir, `${entry.file}.png`);
  const meta = readMeta();
  let result: ImportResult;
  let measuredGround: ImportResult['ground'];

  if (opts.measure) {
    if (!existsSync(outPath)) fail(`${relative(root, outPath)} does not exist`);
    if (entry.kind === 'terrain') fail('Terrain tiles have no top/effect points to measure');
    if (opts.visual || opts.height || opts.ground) fail('--visual/--height/--ground need a fresh import, not --measure');
    const img = decodeImage(readFileSync(outPath));
    const m = measureObject(img, applyMeta(entry, meta));
    const prev = meta[entry.file] ?? {};
    const effects = { ...(prev.effects ?? {}) };
    if (entry.effects?.windows) effects.windows = m.windows;
    if (entry.effects && 'orb' in entry.effects && m.orb) effects.orb = m.orb;
    Object.assign(effects, opts.effects);
    const existingGround = join(artDir, `${entry.file}${GROUND_SUFFIX}.png`);
    const groundImg = existsSync(existingGround) ? decodeImage(readFileSync(existingGround)) : undefined;
    result = { raster: img, meta: { ...prev, top: m.top, effects }, notes: [`Measured top at (${m.top.x}, ${m.top.y})`], warnings: [], manual: [] };
    measuredGround = groundImg;
  } else {
    if (!opts.input) fail('Give the input PNG path');
    const src = decodeImage(readFileSync(opts.input));
    if (!src.hasAlpha) console.log('ℹ Input has no alpha channel; trying to remove a flat background');
    if (entry.kind === 'terrain') {
      result = importTerrain(src, entry, { mode: opts.tile, key: opts.key });
    } else {
      let visual: LocalBounds | undefined;
      try {
        visual = opts.visual ? parseVisual(opts.visual, entry) : undefined;
      } catch (e) {
        fail((e as Error).message);
      }
      const ground = opts.ground ? decodeImage(readFileSync(opts.ground)) : undefined;
      result = importObject(src, entry, {
        visual,
        ground,
        height: opts.height,
        autoHeight: opts.autoHeight,
        fill: opts.fill,
        offsetY: opts.offsetY,
        mirror: opts.mirror,
        key: opts.key,
        keepIslands: opts.keepIslands,
        effects: opts.effects,
      });
      if (result.meta) result.meta.import = { source: basename(opts.input), ...result.meta.import };
    }
  }

  const eff = result.meta ? applyMeta(entry, { [entry.file]: result.meta }) : entry;
  const eg = eff.geometry;
  const vis = eg.visual.w !== eg.footprint.w || eg.visual.d !== eg.footprint.d || eg.visual.x || eg.visual.y ? `, visual ${eg.visual.w}x${eg.visual.d}` : '';
  console.log(`\n${entry.file}  (${eg.canvas.width}x${eg.canvas.height}, logical footprint ${eg.footprint.w}x${eg.footprint.d}${vis})`);
  for (const n of result.notes) console.log(`  • ${n}`);
  for (const w of result.warnings) console.log(`  ⚠ ${w}`);
  if (result.meta?.top) console.log(`  • Top (selection marker): (${result.meta.top.x}, ${result.meta.top.y})`);
  if (opts.dryRun) return console.log('\n(dry run — nothing written)');

  const png = encodeRgba(result.raster.width, result.raster.height, result.raster.data);
  mkdirSync(dirname(outPath), { recursive: true });
  if (!opts.measure) writeFileSync(outPath, png);
  const groundPath = join(artDir, `${entry.file}${GROUND_SUFFIX}.png`);
  if (result.ground) {
    writeFileSync(groundPath, encodeRgba(result.ground.width, result.ground.height, result.ground.data));
    console.log(`  Wrote ${relative(root, groundPath)}`);
  } else if (!opts.measure && existsSync(groundPath)) {
    console.log(`  ⚠ ${relative(root, groundPath)} is from an earlier import and was left unchanged; re-import with --ground or delete it`);
  }
  if (result.meta) {
    meta[entry.file] = result.meta as ArtMetaEntry;
    writeMeta(meta);
  }
  mkdirSync(previewDir, { recursive: true });
  const preview = renderPreview(result.raster, entry, result.meta, result.ground ?? measuredGround);
  const previewPath = join(previewDir, `${entry.file.split('/').pop()}.preview.png`);
  writeFileSync(previewPath, encodeRgba(preview.width, preview.height, preview.data));
  console.log(`\n  Wrote ${relative(root, outPath)}${result.meta ? ' and art-meta.json' : ''}`);
  console.log(`  Preview: ${relative(root, previewPath)}  (green = visual footprint, orange = logical footprint, cyan = anchor, yellow = top, magenta = effects)`);
  if (result.manual.length) {
    console.log(`  ✋ Place by hand (look at the preview, then re-run with --measure ${target} --effect NAME=X,Y): ${result.manual.join(', ')}`);
  }

  const files: ArtFile[] = walk(artDir).map((p) => ({ path: relative(root, p).split('\\').join('/'), data: readFileSync(p) }));
  const report = validateArt(files, { meta: readMeta() });
  const mine = report.issues.filter((i) => i.file.includes(entry.file));
  if (mine.length === 0) console.log('  ✔ Validation passed');
  for (const i of mine) console.log(`  ${i.severity === 'error' ? '✖' : '⚠'} ${i.message}`);
  if (mine.some((i) => i.severity === 'error')) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
