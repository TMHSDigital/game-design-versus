import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { Knowledge } from './engine/data';
import { isBinary, type Axis } from './engine/ontology';
import { randomSeed } from './engine/prng';
import { ENGINE } from './engine/config';
import {
  claritySummary, effectiveEvents, evidenceFromValue, foldSession, SYSTEMS_CHECKLIST, topArchetypes, type Choice, type Constraints, type CustomAxis, type Question, type QuestionOption,
  type SessionEvent, type SessionState, type OptionKey, type TensionStance,
} from './engine/session';
import { nextQuestions, renderQuestion, type RenderedQuestion } from './engine/selection';
import { buildBrief, renderBriefMarkdown, positionText, settledDecisions, type Brief } from './engine/brief';
import { archiveSession, loadSession, newSessionId, saveSession, listSessions, type SessionFile } from './store/fs-store';
import { rankAffinity } from './engine/affinity';
import { parseSessionExport } from './engine/transfer';

const now = () => new Date().toISOString();

/** Custom axes only know poles A, B and blend. Text equal to poleA or poleB maps to A or B. */
function customOptionPole(custom: CustomAxis, raw: string | undefined, index: number): string {
  const pole = raw ?? (['A', 'B', 'blend'][index] as string);
  if (pole === 'A' || pole === 'B' || pole === 'blend') return pole;
  if (pole === custom.poleA) return 'A';
  if (pole === custom.poleB) return 'B';
  throw new Error(`unknown pole ${pole} for ${custom.id}`);
}

export type SessionSummary = {
  sessionId: string;
  title?: string;
  questionCount: number;
  overallClarity: number;
  stopRecommended: boolean;
  stopReasons: string[];
  /** Core decisions (importance-3 axes that apply) settled so far; a steadier progress measure than clarity. */
  core: { settled: number; total: number };
  /** Frame, gates and core are settled: the brief has its foundations. */
  coreReady: boolean;
  modules: { module: string; clarity: number; status: string; open: number; decided: number }[];
  topArchetypes: { id: string; label: string; p: number }[];
  settled: string[];
  /** Active tensions; `response` is set once the user answered the probe (versus_reply). */
  tensions: { id: string; severity: string; message: string; probe: string; response?: string; stance?: string }[];
  pending: string[];
};

function round(x: number) {
  return Math.round(x * 1000) / 1000;
}

export function summarize(k: Knowledge, f: SessionFile, state?: SessionState): SessionSummary {
  const s = state ?? foldSession(k, f.events);
  const c = claritySummary(k, s);
  const settled = settledDecisions(s, 12);
  return {
    sessionId: f.id,
    title: s.title,
    questionCount: s.questionCount,
    overallClarity: round(c.overall),
    stopRecommended: c.stop.recommended,
    stopReasons: c.stop.reasons,
    core: c.core,
    coreReady: c.coreReady,
    modules: c.modules.map((m) => ({ ...m, clarity: round(m.clarity) })),
    topArchetypes: topArchetypes(k, s, 3).map((a) => ({ id: a.id, label: a.label, p: round(a.p) })),
    settled,
    tensions: s.tensions.map((t) => {
      const reply = s.tensionReplies.get(t.id);
      return { id: t.id, severity: t.severity, message: t.message, probe: t.probe, ...(reply ? { response: reply.response, stance: reply.stance } : {}) };
    }),
    pending: Object.keys(f.pending),
  };
}

export function startSession(
  k: Knowledge,
  input: { title?: string; pitch?: string; knownGames?: string[]; seed?: number; constraints?: Constraints },
): SessionSummary {
  const id = newSessionId();
  const constraints = sanitizeConstraints(k, input.constraints);
  const start: SessionEvent = {
    type: 'start', at: now(), sessionId: id, seed: input.seed ?? randomSeed(), title: input.title, pitch: input.pitch,
    knownGames: input.knownGames, constraints,
  };
  const f: SessionFile = { schemaVersion: 1, id, createdAt: start.at, updatedAt: start.at, events: [start], pending: {}, issued: 0 };
  saveSession(f);
  return summarize(k, f);
}

function sanitizeConstraints(k: Knowledge, c?: Constraints): Constraints | undefined {
  if (!c) return undefined;
  const has = (axis: string, pole: string) => k.axisById.get(axis)?.poles.some((p) => p.id === pole) ?? false;
  const out: Constraints = {};
  if (c.platform?.length) {
    const bad = c.platform.filter((p) => !has('frame.platform', p));
    if (bad.length) throw new Error(`unknown platform(s): ${bad.join(', ')}; use ${poleList(k, 'frame.platform')}`);
    out.platform = c.platform;
  }
  if (c.team) {
    if (!has('frame.team', c.team)) throw new Error(`unknown team: ${c.team}; use ${poleList(k, 'frame.team')}`);
    out.team = c.team;
  }
  if (c.timeline) {
    if (!has('frame.timeline', c.timeline)) throw new Error(`unknown timeline: ${c.timeline}; use ${poleList(k, 'frame.timeline')}`);
    out.timeline = c.timeline;
  }
  return out;
}

function poleList(k: Knowledge, axis: string): string {
  return (k.axisById.get(axis)?.poles ?? []).map((p) => p.id).join(', ');
}

export function next(k: Knowledge, sessionId: string, count = 1): { questions: RenderedQuestion[]; summary: SessionSummary } {
  const f = loadSession(sessionId);
  const s = foldSession(k, f.events);
  const qs = nextQuestions(k, s, { count, issued: f.issued });
  f.issued += qs.length;
  // A new batch replaces the previous one, but improvised versus_ask questions stay answerable.
  f.pending = Object.fromEntries(Object.entries(f.pending).filter(([, q]) => q.improvised));
  for (const q of qs) f.pending[q.questionId] = stripRender(q);
  saveSession(f);
  return { questions: qs, summary: summarize(k, f, s) };
}

function stripRender(q: RenderedQuestion): Question {
  const { questionId, axis, module, format, comparisonId, multi, page, pages, options, customAxis, improvised, phase } = q;
  return { questionId, axis, module, format, comparisonId, multi, page, pages, options, customAxis, improvised, phase };
}

export type AnswerInput = { questionId: string; choice: Choice; lean?: number; note?: string; selected?: string[] };

export function answer(k: Knowledge, sessionId: string, answers: AnswerInput[]) {
  const f = loadSession(sessionId);
  const before = foldSession(k, f.events);
  const beforeSum = claritySummary(k, before);
  const errors: string[] = [];
  // Events written by one versus_answer call share a batch id, so versus_undo can take back the whole round.
  const batch = 1 + Math.max(0, ...f.events.map((e) => ('batch' in e && e.batch) || 0));
  for (const a of answers) {
    const q = f.pending[a.questionId];
    if (!q) {
      errors.push(`unknown or already answered questionId ${a.questionId}`);
      continue;
    }
    if (['a', 'b', 'c', 'd'].includes(a.choice) && !q.options.some((o) => o.key === a.choice)) {
      errors.push(`${a.questionId}: choice ${a.choice} is not an option`);
      continue;
    }
    const axis = q.customAxis ? undefined : k.axisById.get(q.axis);
    const kind = q.axis === SYSTEMS_CHECKLIST ? 'a multi-select checklist' : axis && !isBinary(axis) ? axis.kind : undefined;
    if (kind && (a.choice === 'blend' || a.lean !== undefined)) {
      errors.push(`${a.questionId}: ${a.choice === 'blend' ? 'blend' : 'lean'} only applies to two-pole axes; ${q.axis} is ${kind}`);
      continue;
    }
    if (a.selected?.length) {
      if (!q.multi) {
        errors.push(`${a.questionId}: selected only applies to multi-select questions; use choice instead`);
        continue;
      }
      const unknown = a.selected.filter((x) => !q.options.some((o) => o.key === x || o.pole === x || o.label === x));
      if (unknown.length) {
        errors.push(`${a.questionId}: selected ${unknown.join(', ')} ${unknown.length === 1 ? 'matches' : 'match'} no option; use option keys ${q.options.map((o) => o.key).join(', ')}`);
        continue;
      }
    }
    const at = now();
    if (a.choice === 'skip') f.events.push({ type: 'skip', at, question: q, batch });
    else if (q.customAxis) f.events.push({ type: 'custom_answer', at, question: q, choice: a.choice, lean: a.lean, note: a.note, batch });
    else f.events.push({ type: 'answer', at, question: q, choice: a.choice, lean: a.lean, note: a.note, selected: a.selected, batch });
    delete f.pending[a.questionId];
  }
  saveSession(f);
  const after = foldSession(k, f.events);
  const afterSum = claritySummary(k, after);
  const beforeMods = new Map(beforeSum.modules.map((m) => [m.module, m]));
  const deltas = afterSum.modules
    .map((m) => ({ module: m.module, before: round(beforeMods.get(m.module)?.clarity ?? 0), after: round(m.clarity) }))
    .filter((d) => d.before !== d.after);
  const { unlocked, skipped } = moduleChanges(beforeSum, afterSum);
  const oldT = new Set(before.tensions.map((t) => t.id));
  // A tension the user already answered is not raised again, even if it stopped firing and came back.
  const newTensions = after.tensions.filter((t) => !oldT.has(t.id) && !after.tensionReplies.has(t.id)).map((t) => ({ id: t.id, severity: t.severity, message: t.message, probe: t.probe }));
  const followUpHints: string[] = [];
  for (const a of answers) {
    if (a.choice === 'neither' && a.note) followUpHints.push(`The user described their own approach for ${a.questionId}: consider versus_ask with a customAxis or versus_set to capture "${a.note.slice(0, 80)}".`);
    if (a.choice === 'blend') followUpHints.push(`${a.questionId}: a blend was chosen; a follow-up with lean 0-100 can pin it down.`);
  }
  for (const t of newTensions) followUpHints.push(`Tension (${t.severity}): ${t.probe}`);
  return {
    recorded: answers.length - errors.length,
    errors,
    overallClarity: { before: round(beforeSum.overall), after: round(afterSum.overall) },
    moduleDeltas: deltas,
    unlockedModules: unlocked,
    skippedModules: skipped,
    tensions: newTensions,
    followUpHints,
    stopRecommended: afterSum.stop.recommended,
    stopReasons: afterSum.stop.reasons,
    core: afterSum.core,
  };
}

/** Modules an event batch unlocked (became active) or skipped (gated out). */
function moduleChanges(before: ReturnType<typeof claritySummary>, after: ReturnType<typeof claritySummary>) {
  const was = new Map(before.modules.map((m) => [m.module, m.status]));
  return {
    unlocked: after.modules.filter((m) => m.status === 'active' && was.get(m.module) !== 'active').map((m) => m.module),
    skipped: after.modules.filter((m) => m.status === 'skipped' && was.get(m.module) !== 'skipped').map((m) => m.module),
  };
}

export function ask(
  k: Knowledge,
  sessionId: string,
  input: { axis?: string; customAxis?: CustomAxis; options: { game: string; how: string; pole?: string; year?: number }[] },
): { questionId: string; question: RenderedQuestion } {
  const f = loadSession(sessionId);
  if (!input.axis && !input.customAxis) throw new Error('pass axis or customAxis');
  if (input.options.length < 2 || input.options.length > 3) throw new Error('options must have 2 or 3 entries');
  const keys: OptionKey[] = ['a', 'b', 'c'];
  let axis: Pick<Axis, 'kind' | 'label' | 'header' | 'questionTemplate' | 'poles'>;
  let module = 'custom';
  let custom: CustomAxis | undefined;
  let options: QuestionOption[];
  if (input.customAxis) {
    const def = input.customAxis;
    custom = def;
    if (!/^custom\.[a-z0-9_-]+$/.test(def.id)) throw new Error('customAxis.id must look like custom.<slug>');
    axis = {
      kind: 'bipolar', label: def.label, header: def.label.slice(0, 12), questionTemplate: `${def.label}: {a} or {b}?`,
      poles: [{ id: 'A', label: def.poleA, summary: def.poleA }, { id: 'B', label: def.poleB, summary: def.poleB }],
    };
    options = input.options.map((o, i) => ({ key: keys[i] as OptionKey, pole: customOptionPole(def, o.pole, i), label: o.game, game: o.game, how: o.how.slice(0, 160), year: o.year }));
  } else {
    const a = k.axisById.get(input.axis as string);
    if (!a) throw new Error(`unknown axis ${input.axis}`);
    axis = a;
    module = a.module;
    const defaults = isBinary(a) ? [a.poles[0]?.id, a.poles[1]?.id, 'blend'] : a.poles.map((p) => p.id);
    options = input.options.map((o, i) => {
      const pole = o.pole ?? (defaults[i] as string);
      if (!(pole === 'blend' && isBinary(a)) && !a.poles.some((p) => p.id === pole)) throw new Error(`unknown pole ${pole} for ${a.id}`);
      return { key: keys[i] as OptionKey, pole, label: o.game, game: o.game, how: o.how.slice(0, 160), year: o.year };
    });
  }
  f.issued += 1;
  const q: Question = {
    questionId: `${f.id}:q${f.issued}`, axis: custom?.id ?? (input.axis as string), module, format: 'comparison', multi: false,
    options, customAxis: custom, improvised: true,
  };
  f.pending[q.questionId] = q;
  saveSession(f);
  return { questionId: q.questionId, question: renderQuestion(q, axis) };
}

export function setFact(
  k: Knowledge,
  sessionId: string,
  input: { axis: string; value: number | string | string[]; confidence: number; source?: string },
) {
  const a = k.axisById.get(input.axis);
  if (!a) throw new Error(`unknown axis ${input.axis}`);
  if (!evidenceFromValue(a, input.value, input.confidence)) {
    throw new Error(`value ${JSON.stringify(input.value)} does not fit ${a.id} (${a.kind}; poles ${a.poles.map((p) => p.id).join(', ')}${isBinary(a) ? ', or a bin -2..2, or blend' : ''})`);
  }
  const f = loadSession(sessionId);
  f.events.push({ type: 'set', at: now(), axis: a.id, value: input.value, confidence: input.confidence, source: input.source ?? 'user_statement' });
  const s = foldSession(k, f.events);
  const st = s.axes.get(a.id);
  if (!st) throw new Error(`axis ${a.id} has no state`);
  saveSession(f);
  return { axis: a.id, status: st.status, position: positionText(st), clarity: round(st.clarity), summary: summarize(k, f, s) };
}

/**
 * Replaces what the user said about one axis, however many rounds ago, without undoing later rounds. With a value the
 * axis takes that position as if stated fresh; without one it is open again and versus_next can ask it.
 */
export function revise(k: Knowledge, sessionId: string, input: { axis: string; value?: number | string | string[]; confidence?: number }) {
  const f = loadSession(sessionId);
  const before = foldSession(k, f.events);
  const a = k.axisById.get(input.axis);
  const isCustom = !a && before.custom.has(input.axis);
  if (!a && !isCustom) throw new Error(`unknown axis ${input.axis}`);
  if (input.value !== undefined) {
    if (!a) throw new Error(`${input.axis} is a custom axis; revise it without a value and ask it again with versus_ask`);
    if (!evidenceFromValue(a, input.value, input.confidence ?? ENGINE.reviseConfidence)) {
      throw new Error(`value ${JSON.stringify(input.value)} does not fit ${a.id} (${a.kind}; poles ${a.poles.map((p) => p.id).join(', ')}${isBinary(a) ? ', or a bin -2..2, or blend' : ''})`);
    }
  } else if (a) {
    const st = before.axes.get(a.id);
    const recorded = before.log.some((l) => l.axis === a.id && !l.revised) || (st !== undefined && (st.status !== 'open' || st.evidenceCount > 0));
    if (!recorded) throw new Error(`nothing is recorded on ${a.id} yet`);
  }
  const beforeSum = claritySummary(k, before);
  f.events.push({ type: 'retract', at: now(), axis: input.axis, value: input.value, confidence: input.value === undefined ? undefined : input.confidence });
  const after = foldSession(k, f.events);
  saveSession(f);
  const { unlocked, skipped } = moduleChanges(beforeSum, claritySummary(k, after));
  const st = a ? after.axes.get(a.id) : undefined;
  return {
    axis: input.axis,
    status: st?.status ?? 'open',
    position: st ? positionText(st) : 'Undecided',
    revised: before.log.filter((l) => l.axis === input.axis && !l.revised).length,
    unlockedModules: unlocked,
    skippedModules: skipped,
    summary: summarize(k, f, after),
  };
}

/** Records the user's reply to the probe of an active tension; the brief shows it under that risk. */
export function reply(k: Knowledge, sessionId: string, input: { tensionId: string; response: string; stance?: TensionStance }) {
  const response = input.response.trim();
  if (!response) throw new Error('response must not be empty');
  const f = loadSession(sessionId);
  const before = foldSession(k, f.events);
  if (!before.tensions.some((t) => t.id === input.tensionId)) {
    const active = before.tensions.map((t) => t.id);
    throw new Error(`tension ${input.tensionId} is not active; ${active.length ? `active tensions: ${active.join(', ')}` : 'no tensions are active'}`);
  }
  f.events.push({ type: 'tension_reply', at: now(), tensionId: input.tensionId, response, stance: input.stance });
  saveSession(f);
  return { tensionId: input.tensionId, response, stance: input.stance, summary: summarize(k, f) };
}

export function status(k: Knowledge, sessionId: string) {
  const f = loadSession(sessionId);
  const s = foldSession(k, f.events);
  const sum = summarize(k, f, s);
  return { ...sum, comparables: rankAffinity(s.elo).slice(0, 5).map((e) => ({ game: e.game, score: Math.round(e.score) })), flags: s.flags };
}

/** Undoes the last event, the last `steps` events, or (round) every answer of the last versus_answer call. */
export function undo(k: Knowledge, sessionId: string, opts: { steps?: number; round?: boolean } = {}) {
  const f = loadSession(sessionId);
  const eff = effectiveEvents(f.events);
  const undoable = eff.length - 1; // the start event stays
  if (undoable <= 0) throw new Error('nothing to undo');
  let n = Math.max(1, Math.floor(opts.steps ?? 1));
  if (opts.round) {
    const last = eff[eff.length - 1]!;
    const batch = 'batch' in last ? last.batch : undefined;
    n = 1;
    if (batch !== undefined) {
      while (n < undoable) {
        const e = eff[eff.length - 1 - n]!;
        if (!('batch' in e) || e.batch !== batch) break;
        n++;
      }
    }
  }
  n = Math.min(n, undoable);
  const at = now();
  for (let i = 0; i < n; i++) f.events.push({ type: 'undo', at });
  f.pending = {};
  saveSession(f);
  return { ...summarize(k, f), undone: n };
}

/**
 * Continues a session exported from the browser demo (or another machine) under a new session id. The file is
 * validated and replayed before anything is saved.
 */
export function importSession(k: Knowledge, input: { snapshot?: unknown; path?: string }) {
  if ((input.snapshot === undefined) === (input.path === undefined)) throw new Error('pass either snapshot or path');
  let raw = input.snapshot;
  if (input.path !== undefined) {
    const p = isAbsolute(input.path) ? input.path : resolve(process.cwd(), input.path);
    try {
      raw = readFileSync(p, 'utf8');
    } catch (e) {
      throw new Error(`cannot read ${p}: ${(e as Error).message}`, { cause: e });
    }
  }
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch (e) {
      throw new Error(`not a game-design-versus session: invalid JSON (${(e as Error).message})`, { cause: e });
    }
  }
  const parsed = parseSessionExport(k, raw);
  const [start, ...rest] = parsed.events;
  if (start?.type !== 'start') throw new Error('not a game-design-versus session');
  const id = newSessionId();
  const at = now();
  const f: SessionFile = { schemaVersion: 1, id, createdAt: at, updatedAt: at, events: [{ ...start, sessionId: id }, ...rest], pending: {}, issued: parsed.issued };
  saveSession(f);
  return { ...summarize(k, f), importedFrom: start.sessionId, warnings: parsed.warnings };
}

/** Saved sessions, most recent first. Only the sessions returned are replayed; `total` counts every match. */
export function list(k: Knowledge, input: { limit?: number; query?: string } = {}) {
  const q = input.query?.trim().toLowerCase();
  const titleOf = (f: SessionFile) => {
    const s = f.events[0];
    return s?.type === 'start' ? s.title : undefined;
  };
  const matches = listSessions().filter((f) => !q || `${f.id} ${titleOf(f) ?? ''}`.toLowerCase().includes(q));
  const sessions = matches.slice(0, input.limit ?? 20).map((f) => {
    try {
      const s = foldSession(k, f.events);
      return { sessionId: f.id, title: s.title, updatedAt: f.updatedAt, questionCount: s.questionCount, overallClarity: round(claritySummary(k, s).overall) };
    } catch {
      return { sessionId: f.id, title: titleOf(f), updatedAt: f.updatedAt, questionCount: 0, overallClarity: 0 };
    }
  });
  return { sessions, total: matches.length };
}

/** Moves a session out of versus_list into GDV_HOME/archive (recoverable by moving the file back). */
export function archive(sessionId: string) {
  const f = loadSession(sessionId);
  const s = f.events[0];
  return { sessionId, title: s?.type === 'start' ? s.title : undefined, archivedTo: archiveSession(sessionId) };
}

export function brief(
  k: Knowledge, sessionId: string, format: 'markdown' | 'json', outPath?: string, overwrite = false,
): { brief: Brief; markdown: string; savedTo?: string } {
  const f = loadSession(sessionId);
  const s = foldSession(k, f.events);
  const b = buildBrief(k, s);
  const md = renderBriefMarkdown(b);
  let savedTo: string | undefined;
  if (outPath) {
    savedTo = isAbsolute(outPath) ? outPath : resolve(process.cwd(), outPath);
    mkdirSync(dirname(savedTo), { recursive: true });
    try {
      writeFileSync(savedTo, format === 'json' ? JSON.stringify(b, null, 2) + '\n' : md, { encoding: 'utf8', flag: overwrite ? 'w' : 'wx' });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`${savedTo} already exists; pass overwrite: true to replace it`, { cause: e });
      throw e;
    }
  }
  return { brief: b, markdown: md, savedTo };
}

export function catalog(k: Knowledge, input: { module?: string; axis?: string; game?: string; query?: string; limit?: number }) {
  const limit = input.limit ?? 50;
  const q = input.query?.toLowerCase();
  const g = input.game?.toLowerCase();
  const axes = k.axes
    .filter((a) => (!input.module || a.module === input.module) && (!input.axis || a.id === input.axis))
    .filter((a) => !q || `${a.id} ${a.label} ${a.poles.map((p) => p.label).join(' ')}`.toLowerCase().includes(q))
    .map((a) => ({ id: a.id, module: a.module, label: a.label, kind: a.kind, importance: a.importance, poles: a.poles.map((p) => ({ id: p.id, label: p.label })), comparisons: (k.comparisonsByAxis.get(a.id) ?? []).length }));
  const comparisons = k.comparisons
    .filter((c) => (!input.axis || c.axis === input.axis) && (!input.module || k.axisById.get(c.axis)?.module === input.module))
    .filter((c) => !g || c.options.some((o) => o.game.toLowerCase().includes(g)))
    .filter((c) => !q || `${c.id} ${c.options.map((o) => `${o.game} ${o.how}`).join(' ')}`.toLowerCase().includes(q))
    .slice(0, limit)
    .map((c) => ({ id: c.id, axis: c.axis, options: c.options, verification: c.verification.status }));
  return { axes: input.game ? [] : axes.slice(0, limit), comparisons, totalComparisons: k.comparisons.length };
}
