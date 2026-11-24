import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const outfile = 'plugins/game-design-versus/server/index.js';
await build({
  entryPoints: ['src/index.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
  // Escape every non-ASCII character in strings, identifiers and regexes.
  charset: 'ascii',
  minify: false,
  sourcemap: false,
  logLevel: 'warning',
});
// With charset ascii, any remaining non-ASCII text can only sit in comments that esbuild preserved from
// dependencies. Replace it so the artifact is pure ASCII (and free of em dashes).
const src = readFileSync(outfile, 'utf8');
writeFileSync(outfile, src.replace(/[^\x00-\x7f]/g, '-').replace(/\r\n/g, '\n'));
console.error(`built ${outfile}`);
