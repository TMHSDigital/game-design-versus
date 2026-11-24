import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { buildServer, SERVER_NAME, SERVER_VERSION } from './server';
import { knowledge } from './engine/data';

// stdout belongs to the protocol. Log only to stderr.
const k = knowledge();
if (k.loadErrors.length) console.error(`[gdv] ${k.loadErrors.length} invalid comparisons were skipped`);
console.error(`[gdv] ${SERVER_NAME} ${SERVER_VERSION}: ${k.axes.length} axes, ${k.comparisons.length} comparisons served`);
await serveStdio(buildServer, { onerror: (e) => console.error(`[gdv] ${e.message}`) });
