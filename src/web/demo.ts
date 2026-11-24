/**
 * In-memory interview for the browser demo on the project site. It drives the same engine the MCP server uses
 * (foldSession, nextQuestions, claritySummary, buildBrief) over the same verified data, but keeps the event log in
 * memory instead of on disk. No Node APIs.
 */
import { buildKnowledge, rawData, type Knowledge } from '../engine/data';
import { isBinary } from '../engine/ontology';
import { randomSeed } from '../engine/prng';
import {
  claritySummary, foldSession, topArchetypes, type Choice, type Question, type SessionEvent, type SessionState,
} from '../engine/session';
import { nextQuestions, type RenderedQuestion } from '../engine/selection';
import { buildBrief, renderBriefMarkdown, positionText, type Brief } from '../engine/brief';
import { rankAffinity } from '../engine/affinity';

export type DemoOption = { key: string; label: string; game?: string; year?: number; how?: string; pole: string; poleLabel: string };
export type DemoQuestion = {
  questionId: string;
  axis: string;
  axisLabel: string;
  module: string;
  moduleLabel: string;
  prompt: string;
  kind: string;
  binary: boolean;
  multi: boolean;
  keep?: number;
  comparison: boolean;
  options: DemoOption[];
  /** Belief over the axis before this question, A strong to B strong (binary axes only). */
  bins?: number[];
};
export type DemoSummary = {
  questionCount: number;
  clarity: number;
  stopRecommended: boolean;
  modules: { module: string; label: string; clarity: number; status: string }[];
  archetypes: { label: string; p: number }[];
  settled: string[];
  tensions: { id: string; severity: string; message: string; probe: string }[];
  comparables: string[];
};
export type DemoAnswerResult = {
  clarityBefore: number;
  clarityAfter: number;
  skippedModules: string[];
  unlockedModules: string[];
  newTensions: { severity: string; message: string; probe: string }[];
};

let cachedK: Knowledge | undefined;
/** Verified comparisons only, exactly as the server serves them by default. */
export function demoKnowledge(): Knowledge {
  cachedK ??= buildKnowledge(rawData(), { allowUnverified: false });
  return cachedK;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

export class VersusDemo {
  readonly id: string;
  private events: SessionEvent[];
  private pending = new Map<string, Question>();
  private issued = 0;

  constructor(
    private readonly k: Knowledge,
    opts: { title?: string; pitch?: string; seed?: number } = {},
  ) {
    this.id = `web-${Date.now().toString(36)}`;
    this.events = [{
      type: 'start', at: new Date().toISOString(), sessionId: this.id, seed: opts.seed ?? randomSeed(), title: opts.title, pitch: opts.pitch,
    }];
  }

  get state(): SessionState {
    return foldSession(this.k, this.events);
  }

  next(count = 1): DemoQuestion[] {
    const s = this.state;
    const qs = nextQuestions(this.k, s, { count, issued: this.issued });
    this.issued += qs.length;
    this.pending.clear();
    for (const q of qs) this.pending.set(q.questionId, q);
    return qs.map((q) => this.describe(q, s));
  }

  private describe(q: RenderedQuestion, s: SessionState): DemoQuestion {
    const a = this.k.axisById.get(q.axis);
    const mod = this.k.moduleById.get(q.module);
    const binary = a ? isBinary(a) : false;
    const st = s.axes.get(q.axis);
    return {
      questionId: q.questionId,
      axis: q.axis,
      axisLabel: a?.label ?? q.axis,
      module: q.module,
      moduleLabel: mod?.label ?? q.module,
      prompt: q.prompt,
      kind: a?.kind ?? 'bipolar',
      binary,
      multi: q.multi,
      keep: a?.keep,
      comparison: q.format === 'comparison',
      options: q.options.map((o) => ({
        key: o.key, label: o.label, game: o.game, year: o.year, how: o.how, pole: o.pole,
        poleLabel: o.pole === 'blend' ? 'Blend' : (a?.poles.find((p) => p.id === o.pole)?.label ?? o.pole),
      })),
      bins: binary && st?.dist ? st.dist.map(round) : undefined,
    };
  }

  answer(questionId: string, choice: Choice, selected?: string[]): DemoAnswerResult {
    const q = this.pending.get(questionId);
    if (!q) throw new Error(`unknown or already answered question ${questionId}`);
    const before = this.state;
    const bSum = claritySummary(this.k, before);
    const at = new Date().toISOString();
    if (choice === 'skip') this.events.push({ type: 'skip', at, question: q });
    else this.events.push({ type: 'answer', at, question: q, choice, selected });
    this.pending.delete(questionId);
    const after = this.state;
    const aSum = claritySummary(this.k, after);
    const was = new Map(bSum.modules.map((m) => [m.module, m.status]));
    const label = (id: string) => this.k.moduleById.get(id)?.label ?? id;
    const old = new Set(before.tensions.map((t) => t.id));
    return {
      clarityBefore: round(bSum.overall),
      clarityAfter: round(aSum.overall),
      skippedModules: aSum.modules.filter((m) => m.status === 'skipped' && was.get(m.module) !== 'skipped').map((m) => label(m.module)),
      unlockedModules: aSum.modules.filter((m) => m.status === 'active' && was.get(m.module) !== 'active').map((m) => label(m.module)),
      newTensions: after.tensions.filter((t) => !old.has(t.id)).map((t) => ({ severity: t.severity, message: t.message, probe: t.probe })),
    };
  }

  /** Removes the last answer or skip. Returns false when there is nothing to undo. */
  undo(): boolean {
    if (this.state.questionCount === 0) return false;
    this.events.push({ type: 'undo', at: new Date().toISOString() });
    this.pending.clear();
    return true;
  }

  summary(): DemoSummary {
    const s = this.state;
    const c = claritySummary(this.k, s);
    return {
      questionCount: s.questionCount,
      clarity: round(c.overall),
      stopRecommended: c.stop.recommended,
      modules: c.modules.map((m) => ({ module: m.module, label: this.k.moduleById.get(m.module)?.label ?? m.module, clarity: round(m.clarity), status: m.status })),
      archetypes: topArchetypes(this.k, s, 3).map((a) => ({ label: a.label, p: round(a.p) })),
      settled: [...s.axes.values()]
        .filter((a) => a.status === 'decided' && a.applicable !== false)
        .sort((x, y) => y.axis.importance - x.axis.importance)
        .slice(0, 8)
        .map((a) => `${a.axis.label}: ${positionText(a)}`),
      tensions: s.tensions.map((t) => ({ id: t.id, severity: t.severity, message: t.message, probe: t.probe })),
      comparables: rankAffinity(s.elo).slice(0, 5).map((e) => e.game),
    };
  }

  brief(): { brief: Brief; markdown: string } {
    const b = buildBrief(this.k, this.state);
    return { brief: b, markdown: renderBriefMarkdown(b) };
  }
}
