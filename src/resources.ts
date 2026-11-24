import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/server';
import type { Knowledge } from './engine/data';
import { loadSession, listSessions } from './store/fs-store';
import { foldSession } from './engine/session';
import { buildBrief, renderBriefMarkdown } from './engine/brief';
import { summarize } from './service';

function json(uri: URL, data: unknown) {
  return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
}
function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export function registerResources(server: McpServer, k: Knowledge): void {
  server.registerResource(
    'ontology',
    'gdv://ontology',
    { title: 'Design ontology', description: 'Every module and axis with poles, gating and importance.', mimeType: 'application/json' },
    async (uri) => json(uri, k.ontology),
  );

  server.registerResource(
    'axis',
    new ResourceTemplate('gdv://axes/{axisId}', {
      list: async () => ({ resources: k.axes.map((a) => ({ uri: `gdv://axes/${a.id}`, name: a.id, title: a.label, mimeType: 'application/json' })) }),
      complete: { axisId: (v) => k.axes.map((a) => a.id).filter((id) => id.startsWith(v)) },
    }),
    { title: 'Axis', description: 'One axis definition.', mimeType: 'application/json' },
    async (uri, vars) => {
      const a = k.axisById.get(one(vars.axisId));
      if (!a) throw new Error(`unknown axis ${one(vars.axisId)}`);
      return json(uri, a);
    },
  );

  server.registerResource(
    'comparisons',
    new ResourceTemplate('gdv://comparisons/{axisId}', {
      list: undefined,
      complete: { axisId: (v) => k.axes.map((a) => a.id).filter((id) => id.startsWith(v)) },
    }),
    { title: 'Comparisons for an axis', description: 'Served comparisons for one axis.', mimeType: 'application/json' },
    async (uri, vars) => json(uri, k.comparisonsByAxis.get(one(vars.axisId)) ?? []),
  );

  server.registerResource(
    'session',
    new ResourceTemplate('gdv://sessions/{sessionId}', {
      list: async () => ({ resources: listSessions().map((f) => ({ uri: `gdv://sessions/${f.id}`, name: f.id, mimeType: 'application/json' })) }),
    }),
    { title: 'Session', description: 'Session summary plus the raw event log.', mimeType: 'application/json' },
    async (uri, vars) => {
      const f = loadSession(one(vars.sessionId));
      return json(uri, { summary: summarize(k, f), events: f.events });
    },
  );

  server.registerResource(
    'session-brief',
    new ResourceTemplate('gdv://sessions/{sessionId}/brief', { list: undefined }),
    { title: 'Session brief', description: 'The GDD seed brief in Markdown.', mimeType: 'text/markdown' },
    async (uri, vars) => {
      const f = loadSession(one(vars.sessionId));
      const md = renderBriefMarkdown(buildBrief(k, foldSession(k, f.events)));
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: md }] };
    },
  );
}
