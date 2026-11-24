import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'plugins/game-design-versus/server/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
  minify: false,
  sourcemap: false,
  logLevel: 'warning',
});
console.error('built plugins/game-design-versus/server/index.js');
