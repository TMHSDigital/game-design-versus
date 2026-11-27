import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { Knowledge } from '../engine/data';
import { CHOICES, TENSION_STANCES } from '../engine/session';
import * as svc from '../service';

const askOption = z.looseObject({ label: z.string(), description: z.string(), preview: z.string().optional() });
const QuestionOut = z.looseObject({
  questionId: z.string(),
  axis: z.string(),
  module: z.string(),
  format: z.enum(['comparison', 'poles']),
  comparisonId: z.string().optional(),
  prompt: z.string(),
  askUserQuestion: z.looseObject({ question: z.string(), header: z.string().max(12), multiSelect: z.boolean(), options: z.array(askOption).min(2).max(4) }),
  moreOptions: z.array(askOption).optional(),
  answerMap: z.record(z.string(), z.string()),
});
const Summary = z.looseObject({
  sessionId: z.string(),
  questionCount: z.number(),
  overallClarity: z.number(),
  stopRecommended: z.boolean(),
  stopReasons: z.array(z.string()),
  core: z.looseObject({ settled: z.number(), total: z.number() }),
  coreReady: z.boolean(),
  modules: z.array(z.looseObject({ module: z.string(), clarity: z.number(), status: z.string() })),
  topArchetypes: z.array(z.looseObject({ id: z.string(), label: z.string(), p: z.number() })),
  settled: z.array(z.string()),
  tensions: z.array(z.looseObject({ id: z.string(), severity: z.string(), message: z.string(), probe: z.string() })),
});

type Result = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

function ok(text: string, data: object): Result {
  return { content: [{ type: 'text', text }], structuredContent: JSON.parse(JSON.stringify(data)) as Record<string, unknown> };
}
function fail(e: unknown): Result {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[gdv] tool error: ${msg}`);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}
function guard<A>(fn: (a: A) => Result): (a: A) => Result {
  return (a: A) => {
    try {
      return fn(a);
    } catch (e) {
      return fail(e);
    }
  };
}

function summaryText(s: svc.SessionSummary): string {
  return [
    `Session ${s.sessionId}${s.title ? ` (${s.title})` : ''}: ${s.questionCount} questions, ${s.core.settled} of ${s.core.total} core decisions settled, overall clarity ${s.overallClarity}.`,
    `Closest archetypes: ${s.topArchetypes.map((a) => `${a.label} ${Math.round(a.p * 100)}%`).join(', ')}.`,
    s.settled.length ? `Settled: ${s.settled.slice(0, 6).join('; ')}.` : 'Nothing settled yet.',
    s.stopRecommended
      ? `Stop recommended: the brief is ready${s.stopReasons.length ? ` (${s.stopReasons.join('; ')})` : ''}. The user may keep going to refine details.`
      : `Keep going: ${s.stopReasons.join('; ')}.`,
  ].join('\n');
}

export function registerTools(server: McpServer, k: Knowledge): void {
  const sessionId = z.string().describe('Session id returned by versus_start');

  server.registerTool(
    'versus_start',
    {
      title: 'Start a design interview',
      description: 'Start a new this-or-that game design session. Returns a session summary. Record facts from the pitch with versus_set, then loop versus_next and versus_answer.',
      inputSchema: z.object({
        title: z.string().optional().describe('Working title of the game'),
        pitch: z.string().optional().describe('The user pitch in their own words'),
        knownGames: z.array(z.string()).optional().describe('Games the user knows well; comparisons featuring them are preferred'),
        seed: z.number().int().optional().describe('PRNG seed for reproducible question order'),
        constraints: z
          .object({
            platform: z.array(z.string()).optional().describe('frame.platform pole ids: pc, console, handheld, mobile, vr, web'),
            team: z.string().optional().describe('frame.team pole id: solo, small, medium, large'),
            timeline: z.string().optional().describe('frame.timeline pole id: jam, months, years, long'),
          })
          .optional(),
      }),
      outputSchema: Summary,
    },
    guard((a) => {
      const s = svc.startSession(k, a);
      return ok(summaryText(s), s);
    }),
  );

  server.registerTool(
    'versus_next',
    {
      title: 'Next questions',
      description: 'Get up to 4 next questions, each from a different module. Render each askUserQuestion object verbatim with AskUserQuestion, then map the chosen label through answerMap and call versus_answer. moreOptions lists answers that did not fit the 4-option limit (for example Blend of both); they still map through answerMap when the user types them. Unanswered questions from the previous versus_next call expire; questions from versus_ask stay answerable.',
      inputSchema: z.object({ sessionId, count: z.number().int().min(1).max(4).optional().describe('How many questions, 1 to 4') }),
      outputSchema: z.looseObject({ questions: z.array(QuestionOut), summary: Summary }),
      annotations: { readOnlyHint: false },
    },
    guard((a) => {
      const r = svc.next(k, a.sessionId, a.count ?? 1);
      const text = r.questions.length
        ? r.questions.map((q, i) => `${i + 1}. [${q.questionId}] ${q.prompt}\n${[...q.askUserQuestion.options, ...(q.moreOptions ?? [])].map((o) => `   - ${o.label}: ${o.description}`).join('\n')}`).join('\n')
        : 'No questions left. Call versus_brief.';
      return ok(text, r);
    }),
  );

  server.registerTool(
    'versus_answer',
    {
      title: 'Record answers',
      description: 'Record answers to questions from versus_next or versus_ask. choice a/b/c/d picks an option; blend, neither (with note for Other text), no_pref, na (not in my game), unsure (the user does not know the games or cannot judge yet; the topic returns later in plain words) or skip. lean 0-100 refines a binary answer (0 = first pole). For multiSelect questions pass selected option keys.',
      inputSchema: z.object({
        sessionId,
        answers: z
          .array(
            z.object({
              questionId: z.string(),
              choice: z.enum(CHOICES),
              lean: z.number().min(0).max(100).optional().describe('0 = strongly the first pole, 100 = strongly the second'),
              note: z.string().optional().describe('Free text, for example what the user typed under Other'),
              selected: z.array(z.string()).optional().describe('For multiSelect questions: option keys (a-d), pole ids or labels'),
            }),
          )
          .min(1),
      }),
      outputSchema: z.looseObject({
        recorded: z.number(),
        errors: z.array(z.string()),
        overallClarity: z.looseObject({ before: z.number(), after: z.number() }),
        moduleDeltas: z.array(z.looseObject({ module: z.string(), before: z.number(), after: z.number() })),
        unlockedModules: z.array(z.string()),
        skippedModules: z.array(z.string()),
        tensions: z.array(z.looseObject({ id: z.string(), severity: z.string(), message: z.string(), probe: z.string() })),
        followUpHints: z.array(z.string()),
        stopRecommended: z.boolean(),
        stopReasons: z.array(z.string()),
        core: z.looseObject({ settled: z.number(), total: z.number() }),
      }),
    },
    guard((a) => {
      const r = svc.answer(k, a.sessionId, a.answers);
      const lines = [`Recorded ${r.recorded} answer(s). Core decisions settled: ${r.core.settled} of ${r.core.total}. Clarity ${r.overallClarity.before} -> ${r.overallClarity.after}.`];
      if (r.unlockedModules.length) lines.push(`Unlocked: ${r.unlockedModules.join(', ')}.`);
      if (r.skippedModules.length) lines.push(`Skipped: ${r.skippedModules.join(', ')}.`);
      for (const t of r.tensions) lines.push(`Tension (${t.severity}): ${t.message} Probe: ${t.probe}`);
      for (const e of r.errors) lines.push(`Error: ${e}`);
      if (r.stopRecommended) lines.push(`Stop recommended: the brief is ready${r.stopReasons.length ? ` (${r.stopReasons.join('; ')})` : ''}. Offer to write it; the user may keep going.`);
      return ok(lines.join('\n'), r);
    }),
  );

  server.registerTool(
    'versus_ask',
    {
      title: 'Improvise a comparison',
      description: 'Register a comparison the agent improvised (marked unverified) on an existing axis or a new custom axis, and get a questionId to ask it. Use when the user explains a nuance the library does not cover.',
      inputSchema: z.object({
        sessionId,
        axis: z.string().optional().describe('Existing axis id, for example combat.sim'),
        customAxis: z.object({ id: z.string().describe('custom.<slug>'), label: z.string(), poleA: z.string(), poleB: z.string() }).optional(),
        options: z.array(z.object({ game: z.string(), how: z.string().describe('How this game handles this axis, 160 characters or fewer'), pole: z.string().optional().describe('A, B or blend. A custom axis also accepts its poleA or poleB text.'), year: z.number().int().optional() })).min(2).max(3),
      }),
      outputSchema: z.looseObject({ questionId: z.string(), question: QuestionOut }),
    },
    guard((a) => {
      const r = svc.ask(k, a.sessionId, a);
      return ok(`Registered ${r.questionId}: ${r.question.prompt}`, r);
    }),
  );

  server.registerTool(
    'versus_set',
    {
      title: 'Record a stated fact',
      description: 'Record something the user volunteered, without asking a question. value is a bin -2..2 (negative = first pole) or a pole id for binary axes, a pole id for categorical axes, or an array of pole ids for multi and rank axes.',
      inputSchema: z.object({
        sessionId,
        axis: z.string(),
        value: z.union([z.number(), z.string(), z.array(z.string())]),
        confidence: z.number().min(0).max(1).describe('How sure the user was, 0 to 1'),
        source: z.literal('user_statement').optional(),
      }),
      outputSchema: z.looseObject({ axis: z.string(), status: z.string(), position: z.string(), clarity: z.number(), summary: Summary }),
    },
    guard((a) => {
      const r = svc.setFact(k, a.sessionId, a);
      return ok(`${r.axis}: ${r.position} (${r.status}, clarity ${r.clarity}).`, r);
    }),
  );

  server.registerTool(
    'versus_revise',
    {
      title: 'Revise an earlier answer',
      description: 'Change what the user said about one axis, however many rounds ago, without undoing later rounds. Every earlier answer, set and constraint on that axis is taken back (the decision log keeps them, marked revised). With value (same forms as versus_set) the axis takes that position; without value it is open again and versus_next can ask it. Reports modules the change unlocked or skipped. versus_undo takes a revise back.',
      inputSchema: z.object({
        sessionId,
        axis: z.string().describe('Axis id, for example combat.sim; a custom.<slug> axis can only be reopened'),
        value: z.union([z.number(), z.string(), z.array(z.string())]).optional().describe('The new position, as in versus_set; omit to reopen the axis'),
        confidence: z.number().min(0).max(1).optional().describe('How sure the user is of the new position, 0 to 1. Default 0.9'),
      }),
      outputSchema: z.looseObject({ axis: z.string(), status: z.string(), position: z.string(), revised: z.number(), unlockedModules: z.array(z.string()), skippedModules: z.array(z.string()), summary: Summary }),
    },
    guard((a) => {
      const r = svc.revise(k, a.sessionId, a);
      const lines = [`${r.axis}: ${r.position} (${r.status}); ${r.revised} earlier ${r.revised === 1 ? 'entry' : 'entries'} marked revised.`];
      if (r.unlockedModules.length) lines.push(`Unlocked: ${r.unlockedModules.join(', ')}.`);
      if (r.skippedModules.length) lines.push(`Skipped: ${r.skippedModules.join(', ')}.`);
      return ok(lines.join('\n'), r);
    }),
  );

  server.registerTool(
    'versus_reply',
    {
      title: 'Record a tension probe reply',
      description: 'Record how the user answered the probe of an active tension (from versus_answer or the summary tensions). The brief shows the reply under that risk instead of the probe, and the tension is not raised again. stance: accepted (keep the risk), mitigated (keep it with a plan) or will_change (the design will change).',
      inputSchema: z.object({
        sessionId,
        tensionId: z.string().describe('Tension id, for example solo_team_mmo'),
        response: z.string().min(1).describe('The user reply in a sentence or two'),
        stance: z.enum(TENSION_STANCES).optional(),
      }),
      outputSchema: z.looseObject({ tensionId: z.string(), response: z.string(), stance: z.string().optional(), summary: Summary }),
    },
    guard((a) => {
      const r = svc.reply(k, a.sessionId, a);
      return ok(`Recorded the reply to ${r.tensionId}${r.stance ? ` (${r.stance})` : ''}.`, r);
    }),
  );

  server.registerTool(
    'versus_status',
    {
      title: 'Session status',
      description: 'Current clarity per module, settled decisions, tensions, top archetypes and comparable titles.',
      inputSchema: z.object({ sessionId }),
      outputSchema: Summary,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    guard((a) => {
      const r = svc.status(k, a.sessionId);
      return ok(summaryText(r), r);
    }),
  );

  server.registerTool(
    'versus_undo',
    {
      title: 'Undo last event',
      description: 'Undo the last answer, set or skip. Pass round: true to undo every answer of the last versus_answer call (the usual meaning of "go back"), or steps to undo several events. Returns how many events were undone. Pending questions are cleared; call versus_next again.',
      inputSchema: z.object({
        sessionId,
        round: z.boolean().optional().describe('Undo all answers recorded by the last versus_answer call'),
        steps: z.number().int().min(1).max(10).optional().describe('Undo this many events, 1 to 10 (ignored when round is true)'),
      }),
      outputSchema: Summary,
    },
    guard((a) => {
      const r = svc.undo(k, a.sessionId, { round: a.round, steps: a.steps });
      return ok(`Undone ${r.undone} ${r.undone === 1 ? 'event' : 'events'}. ${summaryText(r)}`, r);
    }),
  );

  server.registerTool(
    'versus_list',
    {
      title: 'List sessions',
      description: 'List saved design sessions, most recent first.',
      inputSchema: z.object({}),
      outputSchema: z.looseObject({ sessions: z.array(z.looseObject({ sessionId: z.string(), updatedAt: z.string(), questionCount: z.number(), overallClarity: z.number() })) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    guard(() => {
      const sessions = svc.list(k);
      return ok(sessions.length ? sessions.map((s) => `${s.sessionId} ${s.title ?? ''} (${s.questionCount} q, clarity ${s.overallClarity}, ${s.updatedAt})`).join('\n') : 'No sessions yet.', { sessions });
    }),
  );

  server.registerTool(
    'versus_import',
    {
      title: 'Import a session',
      description: 'Continue a session exported from the browser demo ("Download session (.json)") or another machine. Pass the file path (relative paths resolve against the server working directory) or the file contents as snapshot. The log is validated and replayed before it is saved under a new session id; then continue with versus_next.',
      inputSchema: z.object({
        path: z.string().optional().describe('Path to the exported .json file'),
        snapshot: z.union([z.string(), z.record(z.string(), z.unknown())]).optional().describe('The exported file contents, as an object or a JSON string'),
      }),
      outputSchema: Summary.extend({ importedFrom: z.string(), warnings: z.array(z.string()) }),
    },
    guard((a) => {
      const r = svc.importSession(k, a);
      return ok([`Imported ${r.importedFrom} as a new session.`, ...r.warnings.map((w) => `Warning: ${w}`), summaryText(r)].join('\n'), r);
    }),
  );

  server.registerTool(
    'versus_brief',
    {
      title: 'Generate the GDD seed brief',
      description: 'Generate the GDD seed brief as Markdown or JSON. With outPath, also write it to disk (relative paths resolve against the server working directory); an existing file is only replaced with overwrite: true.',
      inputSchema: z.object({
        sessionId,
        format: z.enum(['markdown', 'json']).optional().describe('Default markdown'),
        outPath: z.string().optional().describe('Optional file path to write, for example docs/design/my-game-brief.md'),
        overwrite: z.boolean().optional().describe('Replace outPath if it already exists. Default false: the call fails instead.'),
      }),
      outputSchema: z.looseObject({ brief: z.looseObject({ title: z.string(), pitch: z.string() }), markdown: z.string(), savedTo: z.string().optional() }),
      annotations: { idempotentHint: true },
    },
    guard((a) => {
      const format = a.format ?? 'markdown';
      const r = svc.brief(k, a.sessionId, format, a.outPath, a.overwrite);
      const text = (format === 'json' ? JSON.stringify(r.brief, null, 2) : r.markdown) + (r.savedTo ? `\n\nSaved to ${r.savedTo}` : '');
      return ok(text, r);
    }),
  );

  server.registerTool(
    'versus_catalog',
    {
      title: 'Browse the library',
      description: 'Browse axes and the comparison library by module, axis, game or free-text query.',
      inputSchema: z.object({
        module: z.string().optional(),
        axis: z.string().optional(),
        game: z.string().optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      outputSchema: z.looseObject({ axes: z.array(z.looseObject({ id: z.string() })), comparisons: z.array(z.looseObject({ id: z.string() })), totalComparisons: z.number() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    guard((a) => {
      const r = svc.catalog(k, a);
      const text = [
        `${r.axes.length} axes, ${r.comparisons.length} comparisons shown (library ${r.totalComparisons}).`,
        ...r.axes.slice(0, 40).map((x) => `- ${x.id} (${x.kind}): ${x.poles.map((p) => p.label).join(' | ')} [${x.comparisons}]`),
        ...r.comparisons.slice(0, 40).map((c) => `- ${c.id}: ${c.options.map((o) => `${o.game} (${o.pole})`).join(' vs ')}`),
      ].join('\n');
      return ok(text, r);
    }),
  );
}
