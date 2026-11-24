// Builds the GitHub Pages site into _site/: copies site/ and bundles the browser demo (the real engine plus the
// verified comparison library). Numbers on the page are filled in from src/data at build time, so they cannot drift.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const out = '_site';
// Empty the folder instead of deleting it, so a preview server running inside it keeps working on Windows.
mkdirSync(out, { recursive: true });
for (const entry of readdirSync(out)) rmSync(join(out, entry), { recursive: true, force: true });

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const ontology = readJson('src/data/axes.json');
const archetypes = readJson('src/data/archetypes.json');
const tensions = readJson('src/data/tensions.json');
const cmpDir = 'src/data/comparisons';
const comparisons = readdirSync(cmpDir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => readJson(join(cmpDir, f)));
const verified = comparisons.filter((c) => c.verification?.status === 'verified');
// Same normalization as gameKey in src/engine/coverage.ts.
const games = new Set(verified.flatMap((c) => c.options.map((o) => o.game.toLowerCase().replace(/[^a-z0-9()]+/g, ' ').trim())));
const pkg = readJson('package.json');
const list = (x) => (Array.isArray(x) ? x : (x.archetypes ?? x.tensions ?? []));

const facts = {
  version: pkg.version,
  axes: ontology.axes.length,
  modules: ontology.modules.length,
  comparisons: verified.length,
  written: comparisons.length,
  games: games.size,
  archetypes: list(archetypes).length,
  tensions: list(tensions).length,
};

for (const entry of readdirSync('site')) {
  const src = join('site', entry);
  if (entry.endsWith('.ts')) continue;
  if (entry.endsWith('.html') || entry.endsWith('.xml') || entry.endsWith('.txt')) {
    const html = readFileSync(src, 'utf8').replace(/\{\{(\w+)\}\}/g, (m, key) => {
      if (!(key in facts)) throw new Error(`${src}: unknown placeholder ${m}`);
      return String(facts[key]);
    });
    writeFileSync(join(out, entry), html);
  } else {
    cpSync(src, join(out, entry), { recursive: statSync(src).isDirectory() });
  }
}

if (readdirSync('site').includes('app.ts')) {
  await build({
    entryPoints: ['site/app.ts'],
    outdir: out,
    // The demo (engine plus library) is a separate chunk that loads on demand.
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    minify: true,
    charset: 'ascii',
    legalComments: 'none',
    define: {
      'process.env.GDV_DETERMINISTIC': 'undefined',
      'process.env.GDV_ALLOW_UNVERIFIED': 'undefined',
    },
    logLevel: 'warning',
  });
}
writeFileSync(join(out, '.nojekyll'), '');
console.log(`built ${out}: ${JSON.stringify(facts)}`);
