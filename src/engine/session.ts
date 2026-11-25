import { ENGINE } from './config';
import type { Knowledge } from './data';
import { applicability, computeFlags, type AxisStatus, type AxisView, type Flags, type GateContext, type Tri } from './gating';
import { BLEND_POLE, isBinary, type Axis, type Lean, type Tension } from './ontology';
import {
  argmax, binPosterior, catPosterior, leanLik, leanOf, leanPercent, likForAnswer, multiPosterior, normalize,
  statedBinLik, uniform, type PoleDist,
} from './posterior';
import { binPrior, catPrior, multiPrior, rankArchetypes, uniformArchetypes, updateArchetypes, type Evidence } from './archetypes';
import { axisClarity, weightedClarity } from './clarity';
import { eloUpdate, type EloTable } from './affinity';
import { evaluateTensions } from './tensions';

export const CHOICES = ['a', 'b', 'c', 'd', 'blend', 'neither', 'no_pref', 'na', 'skip', 'unsure'] as const;
export type Choice = (typeof CHOICES)[number];
export type OptionKey = 'a' | 'b' | 'c' | 'd';

export type QuestionOption = { key: OptionKey; pole: string; label: string; game?: string; year?: number; how?: string };
export type CustomAxis = { id: string; label: string; poleA: string; poleB: string };
export type Question = {
  questionId: string;
  axis: string;
  module: string;
  format: 'comparison' | 'poles';
  comparisonId?: string;
  multi: boolean;
  page?: number;
  pages?: number;
  options: QuestionOption[];
  customAxis?: CustomAxis;
  improvised?: boolean;
  /**
   * Interview phase when the question was issued: 0 frame and gates, 1 an unsettled core axis, 2 refinement
   * (secondary detail, or confirming a core axis the engine already infers). Phase 2 answers count toward the
   * detail allowance of the stop rule. Missing on older sessions; isDetailAxis stands in.
   */
  phase?: 0 | 1 | 2;
};

export type Constraints = { platform?: string[]; team?: string; timeline?: string };
export type SessionEvent =
  | { type: 'start'; at: string; sessionId: string; seed: number; title?: string; pitch?: string; knownGames?: string[]; constraints?: Constraints }
  | { type: 'answer'; at: string; question: Question; choice: Choice; lean?: number; note?: string; selected?: string[] }
  | { type: 'custom_answer'; at: string; question: Question; choice: Choice; lean?: number; note?: string }
  | { type: 'set'; at: string; axis: string; value: number | string | string[]; confidence: number; source: string }
  | { type: 'skip'; at: string; question: Question }
  | { type: 'undo'; at: string };

export type AxisState = {
  axis: Axis;
  status: AxisStatus;
  /** False when gating rules out the axis; undefined while it depends on unanswered gates. */
  applicable: Tri;
  dist?: number[];
  poleDist?: PoleDist;
  inclusion?: PoleDist;
  lean?: Lean;
  leanPct?: number;
  selected?: string[];
  clarity: number;
  importanceMult: number;
  notes: string[];
  source?: 'answer' | 'user_statement' | 'constraint';
  ref?: { comparisonId?: string; chosen?: { game: string; how?: string }; rejected: { game: string; how?: string }[] };
  pagesSeen: number;
  seenPoles: string[];
  excludedPoles: string[];
  ranked: string[];
  lastSkip?: number;
  /** How often the user answered "Not sure / don't know these games" on this axis, and when last. */
  unsureCount: number;
  lastUnsure?: number;
  /** The user stayed unsure even in plain words: not asked again, does not block the stop rule. */
  deferred: boolean;
  evidenceCount: number;
};

/**
 * The systems checklist: one multi-select question over up to 4 presence gates ("which of these are in your
 * game?"). Each option's pole is a gate axis id. Checked means present, unchecked means none.
 */
export const SYSTEMS_CHECKLIST = 'systems.checklist';

/** Gates that ask whether a system exists at all (first pole "none"); these can share the checklist. */
export function isPresenceGate(a: Axis): boolean {
  return a.kind === 'gate' && a.poles[0]?.id === 'none';
}

/** Evidence for a checked presence gate: anything but none or nearly none. */
const PRESENT_LIK = [0.02, 0.2, 1, 1, 1];

/** Core axes (importance 3) are settled before secondary detail is asked. */
export function isCoreAxis(a: Axis): boolean {
  return a.importance === 3;
}

/** Secondary detail: below core importance and not a gate. */
export function isDetailAxis(a: Axis): boolean {
  return a.importance < 3 && a.kind !== 'gate';
}

/** Frame axes that must be answered before the brief is ready: tier 0 and core importance. */
export function isFrameCore(a: Axis): boolean {
  return a.tier === 0 && a.importance === 3;
}

export type CustomAxisState = {
  def: CustomAxis;
  status: AxisStatus;
  dist: number[];
  lean?: Lean;
  notes: string[];
  ref?: AxisState['ref'];
};

export type LogEntry = { at: string; kind: SessionEvent['type']; axis?: string; question?: string; answer: string; note?: string };

export type SessionState = {
  id: string;
  seed: number;
  title?: string;
  pitch?: string;
  knownGames: string[];
  constraints: Constraints;
  createdAt: string;
  effective: SessionEvent[];
  axes: Map<string, AxisState>;
  custom: Map<string, CustomAxisState>;
  archetypePost: number[];
  flags: Flags;
  elo: EloTable;
  log: LogEntry[];
  history: { axis: string; module: string; games: string[] }[];
  usedComparisons: Set<string>;
  /** Games shown in questions the user answered "Not sure / don't know these games". */
  unknownGames: string[];
  questionCount: number;
  /** Questions answered on secondary detail axes (isDetailAxis), for the stop rule. */
  detailCount: number;
  tensions: Tension[];
};

/** SPEC: undo pops the last non-undo event; folding the remaining events is the state. */
export function effectiveEvents(events: SessionEvent[]): SessionEvent[] {
  const stack: SessionEvent[] = [];
  for (const e of events) {
    if (e.type === 'undo') {
      if (stack.length > 1) stack.pop(); // never pop the start event
    } else stack.push(e);
  }
  return stack;
}

type Raw = {
  binLiks: number[][];
  evidenceOnly: number[][];
  catLiks: PoleDist[];
  multiObs: { pole: string; selected: boolean }[];
  rankPoints: Record<string, number>;
  status: AxisStatus;
  importanceMult: number;
  notes: string[];
  source?: AxisState['source'];
  ref?: AxisState['ref'];
  pagesSeen: number;
  seen: Set<string>;
  excluded: Set<string>;
  lastSkip?: number;
  unsureCount: number;
  lastUnsure?: number;
  evidenceCount: number;
};

function newRaw(): Raw {
  return {
    binLiks: [], evidenceOnly: [], catLiks: [], multiObs: [], rankPoints: {}, status: 'open', importanceMult: 1,
    notes: [], pagesSeen: 0, seen: new Set(), excluded: new Set(), unsureCount: 0, evidenceCount: 0,
  };
}

function optionFor(q: Question, choice: Choice): QuestionOption | undefined {
  return q.options.find((o) => o.key === choice);
}

/** Poles picked on a multi-select question: selected keys, poles or labels, plus a single a-d choice. */
function pickedPoles(q: Question, choice: Choice, selected: string[] | undefined): Set<string> {
  const picked = new Set(
    (selected ?? []).map((s) => q.options.find((o) => o.key === s || o.pole === s || o.label === s)?.pole).filter((x): x is string => !!x),
  );
  const single = optionFor(q, choice);
  if (single) picked.add(single.pole);
  return picked;
}

/** Converts a stated value for an axis into evidence. Returns undefined when the value does not fit. */
export function evidenceFromValue(axis: Axis, value: number | string | string[], confidence: number): Evidence | undefined {
  if (isBinary(axis)) {
    let bin: number | undefined;
    if (typeof value === 'number') bin = Math.max(-2, Math.min(2, Math.round(value)));
    else if (typeof value === 'string') {
      if (value === axis.poles[0]?.id) bin = -2;
      else if (value === axis.poles[1]?.id) bin = 2;
      else if (value === BLEND_POLE || value === 'center') bin = 0;
    }
    return bin === undefined ? undefined : { axis: axis.id, kind: 'bin', lik: statedBinLik(bin, confidence) };
  }
  const vals = Array.isArray(value) ? value : [String(value)];
  if (vals.some((v) => !axis.poles.some((p) => p.id === v))) return undefined;
  if (axis.kind === 'categorical') {
    const c = Math.max(0.05, Math.min(1, confidence));
    return { axis: axis.id, kind: 'cat', lik: Object.fromEntries(axis.poles.map((p) => [p.id, p.id === vals[0] ? 1 : 1 - c * 0.95])) };
  }
  return { axis: axis.id, kind: 'multi', obs: axis.poles.map((p) => ({ pole: p.id, selected: vals.includes(p.id) })) };
}

export function foldSession(k: Knowledge, events: SessionEvent[]): SessionState {
  const eff = effectiveEvents(events);
  const start = eff[0];
  if (!start || start.type !== 'start') throw new Error('session must begin with a start event');
  const raws = new Map<string, Raw>();
  const raw = (id: string) => {
    let r = raws.get(id);
    if (!r) raws.set(id, (r = newRaw()));
    return r;
  };
  const custom = new Map<string, CustomAxisState & { liks: number[][] }>();
  const evidence: Evidence[] = [];
  const elo: EloTable = {};
  const log: LogEntry[] = [];
  const history: SessionState['history'] = [];
  const used = new Set<string>();
  const unknownGames: string[] = [];
  let questionCount = 0;
  let detailCount = 0;

  // Constraints from versus_start become stated facts.
  const cons = start.constraints ?? {};
  const constraintSets: { axis: string; value: string | string[] }[] = [];
  if (cons.platform?.length) constraintSets.push({ axis: 'frame.platform', value: cons.platform });
  if (cons.team) constraintSets.push({ axis: 'frame.team', value: cons.team });
  if (cons.timeline) constraintSets.push({ axis: 'frame.timeline', value: cons.timeline });
  for (const c of constraintSets) {
    const a = k.axisById.get(c.axis);
    const ev = a && evidenceFromValue(a, c.value, 1);
    if (!a || !ev) continue;
    applyEvidence(raw(a.id), a, ev, evidence);
    const r = raw(a.id);
    r.status = 'decided';
    r.source = 'constraint';
    if (ev.kind === 'multi') r.pagesSeen = ENGINE.maxMultiPages;
    log.push({ at: start.at, kind: 'set', axis: a.id, answer: `constraint: ${JSON.stringify(c.value)}` });
  }

  for (const e of eff.slice(1)) {
    if (e.type === 'set') {
      const a = k.axisById.get(e.axis);
      if (!a) continue;
      const ev = evidenceFromValue(a, e.value, e.confidence);
      if (!ev) continue;
      const r = raw(a.id);
      applyEvidence(r, a, ev, evidence);
      if (e.confidence >= 0.5) {
        r.status = 'decided';
        if (ev.kind === 'multi') r.pagesSeen = ENGINE.maxMultiPages;
      }
      r.source = 'user_statement';
      log.push({ at: e.at, kind: 'set', axis: a.id, answer: `${JSON.stringify(e.value)} (confidence ${e.confidence})` });
      continue;
    }
    if (e.type === 'skip') {
      history.push({ axis: e.question.axis, module: e.question.module, games: gamesOf(e.question) });
      if (e.question.comparisonId) used.add(e.question.comparisonId);
      raw(e.question.axis).lastSkip = questionCount;
      log.push({ at: e.at, kind: 'skip', axis: e.question.axis, question: e.question.questionId, answer: 'skipped' });
      continue;
    }
    if (e.type === 'custom_answer') {
      const q = e.question;
      const def = q.customAxis;
      if (!def) continue;
      const c = custom.get(def.id) ?? { def, status: 'open' as AxisStatus, dist: uniform(5), notes: [], liks: [] };
      custom.set(def.id, c);
      questionCount++;
      applyBinaryChoice(q, 'A', e.choice, e.lean, e.note, c, (lik) => c.liks.push(lik), elo);
      history.push({ axis: q.axis, module: q.module, games: gamesOf(q) });
      log.push({ at: e.at, kind: e.type, axis: q.axis, question: q.questionId, answer: describeChoice(q, e.choice, e.lean), note: e.note });
      continue;
    }
    if (e.type !== 'answer') continue;
    const q = e.question;
    if (q.axis === SYSTEMS_CHECKLIST) {
      questionCount++;
      history.push({ axis: q.axis, module: q.module, games: [] });
      log.push({ at: e.at, kind: e.type, axis: q.axis, question: q.questionId, answer: describeChoice(q, e.choice, undefined, e.selected), note: e.note });
      const picked = pickedPoles(q, e.choice, e.selected);
      // Only a selection, "None of these" (neither) or "Not in my game" (na) says which systems exist.
      if (!picked.size && e.choice !== 'neither' && e.choice !== 'na') {
        for (const o of q.options) raw(o.pole).lastSkip = questionCount;
        continue;
      }
      for (const o of q.options) {
        const g = k.axisById.get(o.pole);
        if (!g) continue;
        const r = raw(g.id);
        applyEvidence(r, g, { axis: g.id, kind: 'bin', lik: picked.has(o.pole) ? [...PRESENT_LIK] : likForAnswer('A') }, evidence);
        r.status = 'decided';
        r.source = 'answer';
      }
      if (e.note) for (const o of q.options) raw(o.pole).notes.push(e.note);
      continue;
    }
    const a = k.axisById.get(q.axis);
    if (!a) continue;
    const r = raw(a.id);
    questionCount++;
    if (q.phase !== undefined ? q.phase === 2 : isDetailAxis(a)) detailCount++;
    history.push({ axis: q.axis, module: q.module, games: gamesOf(q) });
    if (q.comparisonId) used.add(q.comparisonId);
    log.push({ at: e.at, kind: e.type, axis: q.axis, question: q.questionId, answer: describeChoice(q, e.choice, e.lean, e.selected), note: e.note });
    if (e.choice === 'skip') {
      r.lastSkip = questionCount;
      continue;
    }
    if (e.choice === 'unsure') {
      // No evidence about the design: the user does not know the games or cannot judge yet.
      r.unsureCount++;
      r.lastUnsure = questionCount;
      if (r.unsureCount >= ENGINE.unsureDeferAfter) r.importanceMult = Math.min(r.importanceMult, ENGINE.noPrefImportance);
      for (const g of gamesOf(q)) if (!unknownGames.includes(g)) unknownGames.push(g);
      if (e.note) r.notes.push(e.note);
      continue;
    }
    if (e.choice === 'na') {
      r.status = 'na';
      if (e.note) r.notes.push(e.note);
      continue;
    }
    if (e.choice === 'no_pref') {
      r.status = 'flexible';
      r.importanceMult = ENGINE.noPrefImportance;
      if (e.note) r.notes.push(e.note);
      continue;
    }
    if (isBinary(a)) {
      applyBinaryChoice(q, a.poles[0]?.id ?? '', e.choice, e.lean, e.note, r, (lik) => {
        r.binLiks.push(lik);
        r.evidenceOnly.push(lik);
        r.evidenceCount++;
        evidence.push({ axis: a.id, kind: 'bin', lik });
      }, elo);
      if (r.status === 'decided') r.source = 'answer';
      continue;
    }
    for (const o of q.options) r.seen.add(o.pole);
    if (a.kind === 'categorical') {
      const opt = optionFor(q, e.choice);
      if (opt) {
        const lik: PoleDist = Object.fromEntries(a.poles.map((p) => [p.id, p.id === opt.pole ? 1 : q.options.some((o) => o.pole === p.id) ? 0.05 : 0.15]));
        applyEvidence(r, a, { axis: a.id, kind: 'cat', lik }, evidence);
        r.status = 'decided';
        r.source = 'answer';
        r.ref = refFor(q, opt);
        eloFromChoice(q, opt, elo);
      } else if (e.choice === 'neither') {
        for (const o of q.options) r.excluded.add(o.pole);
        const lik: PoleDist = Object.fromEntries(a.poles.map((p) => [p.id, q.options.some((o) => o.pole === p.id) ? 0.1 : 1]));
        applyEvidence(r, a, { axis: a.id, kind: 'cat', lik }, evidence);
        if (e.note) r.notes.push(e.note);
        const remaining = a.poles.filter((p) => !r.excluded.has(p.id) && !p.noExemplar);
        if (remaining.length === 0 || (e.note && e.note.trim())) r.status = 'flexible';
      }
      continue;
    }
    // multi and rank pages
    const picked = pickedPoles(q, e.choice, e.selected);
    const obs = q.options.map((o) => ({ pole: o.pole, selected: picked.has(o.pole) }));
    applyEvidence(r, a, { axis: a.id, kind: 'multi', obs }, evidence);
    let rank = Object.keys(r.rankPoints).length;
    for (const o of q.options) if (picked.has(o.pole)) r.rankPoints[o.pole] = 100 - rank++;
    if (e.note) r.notes.push(e.note);
    r.pagesSeen++;
    const unseen = a.poles.filter((p) => !r.seen.has(p.id));
    // Pages are ordered most-likely first, so a second page is only worth asking when the user took
    // everything on the first page (more may apply) or, for rank axes, picked fewer than `keep`.
    const takenAll = picked.size === q.options.length;
    const rankShort = a.kind === 'rank' && Object.keys(r.rankPoints).length < (a.keep ?? 3);
    const lastPage = r.pagesSeen >= ENGINE.maxMultiPages || unseen.length === 0;
    if (Object.keys(r.rankPoints).length === 0) {
      // Nothing picked yet: "None of these" means "not on this page", so the next page is still worth asking.
      // Nothing picked on any page is no answer at all, not a decision.
      if (lastPage) r.status = 'flexible';
    } else if (lastPage || (!takenAll && !rankShort)) r.status = 'decided';
    r.source = 'answer';
  }

  const archetypePost = updateArchetypes(k, uniformArchetypes(k), evidence);
  const axes = new Map<string, AxisState>();
  for (const a of k.axes) {
    const r = raws.get(a.id) ?? newRaw();
    const st: AxisState = {
      axis: a, status: r.status, applicable: undefined, clarity: 0, importanceMult: r.importanceMult, notes: r.notes,
      source: r.source, ref: r.ref, pagesSeen: r.pagesSeen, seenPoles: [...r.seen], excludedPoles: [...r.excluded],
      ranked: Object.entries(r.rankPoints).sort((x, y) => y[1] - x[1]).map(([p]) => p), lastSkip: r.lastSkip,
      unsureCount: r.unsureCount, lastUnsure: r.lastUnsure, deferred: r.status === 'open' && r.unsureCount >= ENGINE.unsureDeferAfter,
      evidenceCount: r.evidenceCount,
    };
    if (isBinary(a)) {
      st.dist = binPosterior(binPrior(k, a.id, archetypePost), r.binLiks);
      // The user's own answers decide the position; the archetype prior only fills open axes.
      const pos = r.evidenceOnly.length && st.status === 'decided' ? binPosterior(uniform(5), r.evidenceOnly) : st.dist;
      st.lean = leanOf(pos);
      st.leanPct = leanPercent(pos);
    } else if (a.kind === 'categorical') {
      st.poleDist = catPosterior(catPrior(k, a, archetypePost), r.catLiks);
      st.selected = [argmax(st.poleDist) as string];
    } else {
      st.inclusion = multiPosterior(multiPrior(k, a, archetypePost), r.multiObs);
      const sel = a.poles.filter((p) => (st.inclusion?.[p.id] ?? 0) > 0.5 + ENGINE.multiSelectMargin).map((p) => p.id);
      // "No preference" is not a choice of poles: a flexible multi or rank axis selects nothing, so it sets no flags.
      if (st.status === 'flexible') st.selected = [];
      else if (a.kind === 'rank') {
        const ordered = [...st.ranked, ...sel.filter((p) => !st.ranked.includes(p))];
        const byProb = a.poles.map((p) => p.id).sort((x, y) => (st.inclusion?.[y] ?? 0) - (st.inclusion?.[x] ?? 0));
        for (const p of byProb) if (!ordered.includes(p)) ordered.push(p);
        st.selected = ordered.slice(0, a.keep ?? 3);
      } else st.selected = sel;
    }
    axes.set(a.id, st);
  }

  const view = (id: string): AxisView | undefined => {
    const s = axes.get(id);
    if (!s) return undefined;
    return { status: s.status, lean: s.lean, poles: s.selected };
  };
  const flags = computeFlags(k, view);
  const ctx: GateContext = { flags, axis: view };
  for (const s of axes.values()) {
    s.applicable = applicability(k, s.axis, ctx);
    s.clarity = clarityOf(s);
  }

  // Elo for categorical and binary references was applied during the fold; custom axes finalize here.
  const customOut = new Map<string, CustomAxisState>();
  for (const [id, c] of custom) {
    const dist = binPosterior(uniform(5), c.liks);
    customOut.set(id, { def: c.def, status: c.status, dist, lean: c.liks.length ? leanOf(dist) : undefined, notes: c.notes, ref: c.ref });
  }

  return {
    id: start.sessionId, seed: start.seed, title: start.title, pitch: start.pitch, knownGames: start.knownGames ?? [],
    constraints: cons, createdAt: start.at, effective: eff, axes, custom: customOut, archetypePost, flags, elo, log,
    history, usedComparisons: used, unknownGames, questionCount, detailCount, tensions: evaluateTensions(k, ctx),
  };
}

function applyEvidence(r: Raw, a: Axis, ev: Evidence, all: Evidence[]): void {
  all.push(ev);
  r.evidenceCount++;
  if (ev.kind === 'bin') {
    r.binLiks.push(ev.lik);
    r.evidenceOnly.push(ev.lik);
  } else if (ev.kind === 'cat') r.catLiks.push(ev.lik);
  else r.multiObs.push(...ev.obs);
  void a;
}

function applyBinaryChoice(
  q: Question, poleAId: string, choice: Choice, lean: number | undefined, note: string | undefined,
  target: { status: AxisStatus; notes: string[]; ref?: AxisState['ref'] }, push: (lik: number[]) => void, elo: EloTable,
): void {
  if (choice === 'skip' || choice === 'unsure') return;
  if (choice === 'na') {
    target.status = 'na';
    return;
  }
  if (choice === 'no_pref') {
    target.status = 'flexible';
    return;
  }
  if (choice === 'neither') {
    if (note) target.notes.push(note);
    if (target.status !== 'decided') target.status = 'flexible';
    return;
  }
  let lik: number[];
  const opt = optionFor(q, choice);
  if (lean !== undefined) lik = leanLik(lean);
  else if (choice === 'blend' || opt?.pole === BLEND_POLE) lik = likForAnswer('blend');
  else if (opt) lik = likForAnswer(opt.pole === poleAId ? 'A' : 'B');
  else return;
  push(lik);
  target.status = 'decided';
  if (note) target.notes.push(note);
  if (opt && opt.pole !== BLEND_POLE && choice !== 'blend') {
    target.ref = refFor(q, opt);
    eloFromChoice(q, opt, elo);
  } else {
    eloUpdate(elo, q.options.map((o) => o.game).filter((g): g is string => !!g), [], true);
  }
}

function refFor(q: Question, opt: QuestionOption): AxisState['ref'] {
  return {
    comparisonId: q.comparisonId,
    chosen: opt.game ? { game: opt.game, how: opt.how } : undefined,
    rejected: q.options.filter((o) => o.key !== opt.key && o.game && o.pole !== opt.pole).map((o) => ({ game: o.game as string, how: o.how })),
  };
}

function eloFromChoice(q: Question, opt: QuestionOption, elo: EloTable): void {
  if (!opt.game) return;
  const losers = q.options.filter((o) => o.key !== opt.key && o.game && o.pole !== opt.pole).map((o) => o.game as string);
  const winners = q.options.filter((o) => o.game && o.pole === opt.pole).map((o) => o.game as string);
  eloUpdate(elo, winners, losers);
}

function gamesOf(q: Question): string[] {
  return q.options.map((o) => o.game).filter((g): g is string => !!g);
}

function describeChoice(q: Question, choice: Choice, lean?: number, selected?: string[]): string {
  if (selected?.length) {
    const labels = selected.map((s) => q.options.find((o) => o.key === s || o.pole === s || o.label === s)?.label ?? s);
    return `selected: ${labels.join(', ')}`;
  }
  const opt = optionFor(q, choice);
  if (!opt && q.multi && choice === 'neither') return 'none of these';
  const base = opt ? opt.label : choice === 'unsure' ? 'not sure' : choice;
  return lean !== undefined ? `${base} (lean ${lean})` : base;
}

function clarityOf(s: AxisState): number {
  if (s.dist) return axisClarity({ status: s.status, dist: s.dist });
  if (s.poleDist) return axisClarity({ status: s.status, dist: Object.values(s.poleDist) });
  return axisClarity({ status: s.status, bernoulli: Object.values(s.inclusion ?? {}) });
}

/** Axes that count toward clarity: applicable (definitely), not na. */
export function countedAxes(state: SessionState): AxisState[] {
  return [...state.axes.values()].filter((s) => s.applicable === true && s.status !== 'na');
}

export function weightOf(s: AxisState): number {
  return s.axis.importance * s.importanceMult;
}

export type ClaritySummary = {
  overall: number;
  modules: { module: string; clarity: number; status: 'active' | 'skipped' | 'pending'; open: number; decided: number }[];
  stop: { recommended: boolean; reasons: string[] };
  /** Core decisions (importance-3 axes that apply): how many are settled, decided or set aside. */
  core: { settled: number; total: number };
  /** True once frame, gates and core are settled: the brief has its foundations. */
  coreReady: boolean;
  questionCount: number;
};

export function claritySummary(k: Knowledge, state: SessionState): ClaritySummary {
  const counted = countedAxes(state);
  const overall = weightedClarity(counted.map((s) => ({ clarity: s.clarity, weight: weightOf(s) })));
  const modules = k.modules.map((m) => {
    const all = [...state.axes.values()].filter((s) => s.axis.module === m.id);
    const live = all.filter((s) => s.applicable === true && s.status !== 'na');
    const skipped = all.every((s) => s.applicable === false || s.status === 'na');
    const pending = !skipped && live.length === 0;
    return {
      module: m.id,
      clarity: weightedClarity(live.map((s) => ({ clarity: s.clarity, weight: weightOf(s) }))),
      status: skipped ? ('skipped' as const) : pending ? ('pending' as const) : ('active' as const),
      open: live.filter((s) => s.status === 'open').length,
      decided: live.filter((s) => s.status === 'decided').length,
    };
  });
  const reasons: string[] = [];
  const unresolvedFrame = [...state.axes.values()].filter((s) => isFrameCore(s.axis) && s.status === 'open' && s.applicable !== false && !s.deferred);
  const unresolvedGates = [...state.axes.values()].filter((s) => isGateLike(s) && s.applicable !== false && s.status === 'open' && gateStillOpen(state, s));
  const core = counted.filter((s) => isCoreAxis(s.axis));
  const weakCore = core.filter((s) => !s.deferred && s.clarity < ENGINE.stopCore);
  if (unresolvedFrame.length) reasons.push(`${unresolvedFrame.length} frame axes open`);
  if (unresolvedGates.length) reasons.push(`${unresolvedGates.length} gates open`);
  if (weakCore.length) reasons.push(`${weakCore.length} core axes below ${ENGINE.stopCore}`);
  const coreReady = reasons.length === 0;
  // Once the core is settled, secondary detail gets a bounded share; what is left becomes open questions.
  if (overall < ENGINE.stopOverall && state.detailCount < ENGINE.detailQuestions) {
    reasons.push(`overall clarity ${overall.toFixed(2)} < ${ENGINE.stopOverall} and ${state.detailCount} of ${ENGINE.detailQuestions} detail questions asked`);
  }
  const hitMax = state.questionCount >= ENGINE.maxQuestions;
  const foundations = !unresolvedFrame.length && !unresolvedGates.length;
  if (!hitMax && reasons.length && foundations && state.questionCount >= ENGINE.softQuestions) {
    const left = weakCore.length ? `; ${weakCore.length} core ${weakCore.length === 1 ? 'question stays' : 'questions stay'} open in the brief` : '';
    return {
      overall, modules,
      stop: { recommended: true, reasons: [`reached the recommended length of ${ENGINE.softQuestions} questions${left}`] },
      core: { settled: core.length - weakCore.length, total: core.length }, coreReady, questionCount: state.questionCount,
    };
  }
  return {
    overall,
    modules,
    stop: { recommended: hitMax || reasons.length === 0, reasons: hitMax ? [`reached ${ENGINE.maxQuestions} questions`] : reasons },
    core: { settled: core.length - weakCore.length, total: core.length },
    coreReady,
    questionCount: state.questionCount,
  };
}

/** Gate axes plus any axis that sets flags. */
export function isGateLike(s: AxisState): boolean {
  return s.axis.kind === 'gate' || (s.axis.sets?.length ?? 0) > 0;
}

/** A gate-like axis matters while at least one flag it sets is still undetermined. */
export function gateStillOpen(state: SessionState, s: AxisState): boolean {
  const flags = [...new Set((s.axis.sets ?? []).map((x) => x.flag))];
  return flags.some((f) => state.flags[f] === undefined);
}

export function topArchetypes(k: Knowledge, state: SessionState, n = 5) {
  return rankArchetypes(k, state.archetypePost).slice(0, n);
}

export { normalize };
