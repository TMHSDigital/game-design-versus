/**
 * Moving a session between the browser demo and the MCP server. Both keep the same SessionEvent log, so an export is
 * that log plus the question counter and a fingerprint of the library it was played against. No Node APIs: the demo
 * bundles this file too.
 */
import { z } from 'zod';
import type { Knowledge } from './data';
import { CHOICES, foldSession, SYSTEMS_CHECKLIST, TENSION_STANCES, type SessionEvent } from './session';

export const SESSION_EXPORT_FORMAT = 'game-design-versus/session';

export type SessionExport = {
  format: typeof SESSION_EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  /** Size of the library the session was played against; the importer warns when its own differs. */
  library: { axes: number; comparisons: number };
  events: SessionEvent[];
  issued: number;
};

export function buildSessionExport(k: Knowledge, events: SessionEvent[], issued: number): SessionExport {
  return {
    format: SESSION_EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(),
    library: { axes: k.axes.length, comparisons: k.comparisons.length }, events: [...events], issued,
  };
}

const value = z.union([z.number(), z.string(), z.array(z.string())]);
const option = z.looseObject({
  key: z.enum(['a', 'b', 'c', 'd']), pole: z.string(), label: z.string(),
  game: z.string().optional(), year: z.number().optional(), how: z.string().optional(),
});
const question = z.looseObject({
  questionId: z.string(), axis: z.string(), module: z.string(), format: z.enum(['comparison', 'poles']),
  comparisonId: z.string().optional(), multi: z.boolean(), options: z.array(option).min(1).max(25),
  customAxis: z.looseObject({ id: z.string(), label: z.string(), poleA: z.string(), poleB: z.string() }).optional(),
});
const batch = z.number().int().optional();
const event = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('start'), at: z.string(), sessionId: z.string(), seed: z.number(), title: z.string().optional(), pitch: z.string().optional(),
    knownGames: z.array(z.string()).optional(),
    constraints: z.looseObject({ platform: z.array(z.string()).optional(), team: z.string().optional(), timeline: z.string().optional() }).optional(),
  }),
  z.looseObject({
    type: z.literal('answer'), at: z.string(), question, choice: z.enum(CHOICES), lean: z.number().min(0).max(100).optional(),
    note: z.string().optional(), selected: z.array(z.string()).optional(), batch,
  }),
  z.looseObject({ type: z.literal('custom_answer'), at: z.string(), question, choice: z.enum(CHOICES), lean: z.number().min(0).max(100).optional(), note: z.string().optional(), batch }),
  z.looseObject({ type: z.literal('set'), at: z.string(), axis: z.string(), value, confidence: z.number().min(0).max(1), source: z.string() }),
  z.looseObject({ type: z.literal('skip'), at: z.string(), question, batch }),
  z.looseObject({ type: z.literal('tension_reply'), at: z.string(), tensionId: z.string(), response: z.string(), stance: z.enum(TENSION_STANCES).optional() }),
  z.looseObject({ type: z.literal('retract'), at: z.string(), axis: z.string(), value: value.optional(), confidence: z.number().min(0).max(1).optional() }),
  z.looseObject({ type: z.literal('undo'), at: z.string() }),
]);
/** An export file, or the bare `{ events, issued }` snapshot the demo keeps in the browser. */
const exportSchema = z.looseObject({
  format: z.literal(SESSION_EXPORT_FORMAT).optional(),
  version: z.literal(1).optional(),
  library: z.looseObject({ axes: z.number(), comparisons: z.number() }).optional(),
  events: z.array(event).min(1).max(5000),
  issued: z.number().int().min(0).optional(),
});

/**
 * Validates an exported session against this library: every event parses, the log starts with its only start event,
 * and it replays. Returns the events, the question counter to continue from, and warnings worth showing the user.
 */
export function parseSessionExport(k: Knowledge, raw: unknown): { events: SessionEvent[]; issued: number; warnings: string[] } {
  const r = exportSchema.safeParse(raw);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new Error(`not a game-design-versus session: ${issue ? `${issue.path.join('.') || 'file'}: ${issue.message}` : 'invalid'}`);
  }
  const events = r.data.events as SessionEvent[];
  if (events[0]?.type !== 'start' || events.slice(1).some((e) => e.type === 'start')) {
    throw new Error('not a game-design-versus session: the log must begin with its only start event');
  }
  try {
    foldSession(k, events);
  } catch (e) {
    throw new Error(`the session does not replay: ${(e as Error).message}`, { cause: e });
  }
  const warnings: string[] = [];
  const lib = r.data.library;
  if (lib && (lib.axes !== k.axes.length || lib.comparisons !== k.comparisons.length)) {
    warnings.push(`exported with a library of ${lib.axes} axes and ${lib.comparisons} comparisons; this server has ${k.axes.length} and ${k.comparisons.length}. Answered questions replay from their own options.`);
  }
  const unknown = new Set<string>();
  for (const e of events) {
    const axis = 'question' in e ? e.question.axis : 'axis' in e ? e.axis : undefined;
    if (!axis || axis === SYSTEMS_CHECKLIST || axis.startsWith('custom.') || k.axisById.has(axis)) continue;
    unknown.add(axis);
  }
  if (unknown.size) warnings.push(`axes this server does not know are ignored: ${[...unknown].join(', ')}`);
  const asked = events.filter((e) => e.type === 'answer' || e.type === 'custom_answer' || e.type === 'skip').length;
  return { events, issued: Math.max(r.data.issued ?? 0, asked), warnings };
}
