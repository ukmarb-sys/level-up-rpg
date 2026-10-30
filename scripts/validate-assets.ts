/**
 * Validates artwork in src/assets/art against the asset manifest.
 *   npm run validate:assets            # missing art is a warning (fallbacks exist)
 *   npm run validate:assets -- --strict  # missing required art is an error
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ArtMeta } from '../src/assets/meta';
import { validateArt, type ArtFile } from './lib/validate';

const root = fileURLToPath(new URL('..', import.meta.url));
const artDir = join(root, 'src', 'assets', 'art');

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (!/^(README\.md|art-meta\.json|\.gitkeep|\.DS_Store)$/.test(name)) out.push(p);
  }
  return out;
}

const strict = process.argv.includes('--strict');
const files: ArtFile[] = walk(artDir).map((p) => ({ path: relative(root, p).split('\\').join('/'), data: readFileSync(p) }));
const metaPath = join(artDir, 'art-meta.json');
let meta: ArtMeta = {};
try {
  meta = JSON.parse(readFileSync(metaPath, 'utf8')) as ArtMeta;
} catch (e) {
  console.log(`ERROR    src/assets/art/art-meta.json\n         Unreadable: ${(e as Error).message}`);
  process.exitCode = 1;
}
const report = validateArt(files, { strict, meta });

const label = { error: 'ERROR  ', warning: 'warning', info: 'info   ' } as const;
for (const i of report.issues) console.log(`${label[i.severity]}  ${i.file}\n         ${i.message}`);
console.log(
  `\n${files.length} file(s) checked, ${report.matched.length} matched the manifest.` +
    `\nMissing required: ${report.missingRequired.length}, missing optional: ${report.missingOptional.length}.`,
);
const errors = report.issues.filter((i) => i.severity === 'error').length;
console.log(errors ? `\n✖ ${errors} error(s)` : '\n✔ No errors');
process.exit(errors || process.exitCode ? 1 : 0);
