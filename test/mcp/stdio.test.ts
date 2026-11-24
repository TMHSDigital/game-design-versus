import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bundle = fileURLToPath(new URL('../../plugins/game-design-versus/server/index.js', import.meta.url));
const home = mkdtempSync(join(tmpdir(), 'gdv-mcp-'));
let client: Client;

type ToolResult = { structuredContent?: Record<string, unknown>; isError?: boolean; content: { type: string; text?: string }[] };
async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as unknown as ToolResult;
}

/** Minimal JSON Schema check: required keys present and top-level types match. */
function conforms(schema: Record<string, unknown> | undefined, value: Record<string, unknown> | undefined): string[] {
  if (!schema || !value) return ['missing schema or value'];
  const errs: string[] = [];
  const props = (schema.properties ?? {}) as Record<string, { type?: string }>;
  for (const r of (schema.required ?? []) as string[]) if (!(r in value)) errs.push(`missing ${r}`);
  for (const [key, p] of Object.entries(props)) {
    if (!(key in value) || !p.type) continue;
    const v = value[key];
    const t = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'number' ? (Number.isInteger(v) && p.type === 'integer' ? 'integer' : 'number') : typeof v;
    if (p.type !== t && !(p.type === 'number' && t === 'integer')) errs.push(`${key}: expected ${p.type}, got ${t}`);
  }
  return errs;
}

beforeAll(async () => {
  if (!existsSync(bundle)) throw new Error('bundle missing: run npm run build first');
  client = new Client({ name: 'gdv-test', version: '0.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bundle],
    env: { ...getDefaultEnvironment(), GDV_HOME: home, GDV_DETERMINISTIC: '1' },
    stderr: 'pipe',
  });
  await client.connect(transport);
});

afterAll(async () => {
  await client?.close();
  rmSync(home, { recursive: true, force: true });
});

describe('MCP over stdio (built bundle)', () => {
  it('lists every tool with input and output schemas', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['versus_answer', 'versus_ask', 'versus_brief', 'versus_catalog', 'versus_list', 'versus_next', 'versus_set', 'versus_start', 'versus_status', 'versus_undo']);
    for (const t of tools) {
      expect(t.inputSchema).toBeDefined();
      expect(t.outputSchema).toBeDefined();
    }
    const start = tools.find((t) => t.name === 'versus_start');
    expect(JSON.stringify(start?.inputSchema)).toContain('Games the user knows well');
    expect(tools.find((t) => t.name === 'versus_status')?.annotations?.readOnlyHint).toBe(true);
  });

  it('runs a short session end to end', async () => {
    const { tools } = await client.listTools();
    const schema = (n: string) => tools.find((t) => t.name === n)?.outputSchema as Record<string, unknown>;

    const started = await call('versus_start', { title: 'Test Game', pitch: 'A physics sword fighter', seed: 3, constraints: { platform: ['pc'], team: 'small' } });
    expect(started.isError).toBeFalsy();
    expect(conforms(schema('versus_start'), started.structuredContent)).toEqual([]);
    const sessionId = started.structuredContent?.sessionId as string;
    expect(existsSync(join(home, 'sessions', `${sessionId}.json`))).toBe(true);

    const set = await call('versus_set', { sessionId, axis: 'genre.family', value: ['action', 'fighting'], confidence: 0.9, source: 'user_statement' });
    expect(set.isError).toBeFalsy();
    expect(conforms(schema('versus_set'), set.structuredContent)).toEqual([]);

    for (let round = 0; round < 3; round++) {
      const nx = await call('versus_next', { sessionId, count: 3 });
      expect(nx.isError).toBeFalsy();
      expect(conforms(schema('versus_next'), nx.structuredContent)).toEqual([]);
      const qs = nx.structuredContent?.questions as { questionId: string; askUserQuestion: { header: string; options: unknown[]; multiSelect: boolean } }[];
      expect(qs.length).toBeGreaterThan(0);
      for (const q of qs) {
        expect(q.askUserQuestion.header.length).toBeLessThanOrEqual(12);
        expect(q.askUserQuestion.options.length).toBeLessThanOrEqual(4);
      }
      const ans = await call('versus_answer', { sessionId, answers: qs.map((q) => (q.askUserQuestion.multiSelect ? { questionId: q.questionId, choice: 'neither', selected: ['a'] } : { questionId: q.questionId, choice: 'a' })) });
      expect(ans.isError).toBeFalsy();
      expect(conforms(schema('versus_answer'), ans.structuredContent)).toEqual([]);
      expect(ans.structuredContent?.recorded).toBe(qs.length);
    }

    const asked = await call('versus_ask', { sessionId, customAxis: { id: 'custom.limb_loss', label: 'Limb loss', poleA: 'Cosmetic', poleB: 'Mechanical' }, options: [{ game: 'Half Sword', how: 'Limbs can be lost' }, { game: 'Skyrim', how: 'No dismemberment' }] });
    expect(asked.isError).toBeFalsy();
    const qid = asked.structuredContent?.questionId as string;
    expect((await call('versus_answer', { sessionId, answers: [{ questionId: qid, choice: 'a' }] })).isError).toBeFalsy();

    const st = await call('versus_status', { sessionId });
    expect(conforms(schema('versus_status'), st.structuredContent)).toEqual([]);
    const before = st.structuredContent?.questionCount as number;
    const un = await call('versus_undo', { sessionId });
    expect(un.structuredContent?.questionCount).toBe(before - 1);

    const out = join(home, 'out', 'brief.md');
    const br = await call('versus_brief', { sessionId, format: 'markdown', outPath: out });
    expect(br.isError).toBeFalsy();
    expect(conforms(schema('versus_brief'), br.structuredContent)).toEqual([]);
    expect(readFileSync(out, 'utf8')).toContain('# Test Game');

    const ls = await call('versus_list', {});
    expect((ls.structuredContent?.sessions as unknown[]).length).toBe(1);
    const cat = await call('versus_catalog', { module: 'combat' });
    expect(cat.isError).toBeFalsy();
  });

  it('serves resources and prompts', async () => {
    const r = await client.readResource({ uri: 'gdv://ontology' });
    expect(JSON.parse((r.contents[0] as { text: string }).text).axes.length).toBeGreaterThan(100);
    const ax = await client.readResource({ uri: 'gdv://axes/combat.sim' });
    expect((ax.contents[0] as { text: string }).text).toContain('Physics-simulated');
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(['versus', 'versus-brief', 'versus-resume']);
    const p = await client.getPrompt({ name: 'versus', arguments: { pitch: 'a cozy farm' } });
    expect(JSON.stringify(p.messages)).toContain('versus_start');
  });

  it('reports errors as tool errors, not crashes', async () => {
    const bad = await call('versus_status', { sessionId: 'gdv-does-not-exist' });
    expect(bad.isError).toBe(true);
  });
});
