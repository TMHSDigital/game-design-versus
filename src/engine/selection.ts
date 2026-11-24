import { ENGINE, isDeterministic } from './config';
import type { Knowledge } from './data';
import { gateIndex } from './gating';
import { BLEND_POLE, isBinary, type Axis, type Comparison, type Flag } from './ontology';
import { binaryEntropy, entropy, likForAnswer, normalize, type PoleDist } from './posterior';
import { evidenceLikelihood, type Evidence } from './archetypes';
import { hashSeed, mulberry32, pickIndex } from './prng';
import { gateStillOpen, isGateLike, type AxisState, type Question, type QuestionOption, type SessionState, type OptionKey } from './session';
import { gameKey } from './coverage';

const KEYS: OptionKey[] = ['a', 'b', 'c', 'd'];

export type AskUserQuestion = {
  question: string;
  header: string;
  multiSelect: boolean;
  options: { label: string; description: string; preview?: string }[];
};
export type RenderedQuestion = Question & {
  prompt: string;
  askUserQuestion: AskUserQuestion;
  /** Maps each AskUserQuestion option label to the choice to send to versus_answer. */
  answerMap: Record<string, string>;
  score: number;
};

type Candidate = { axis: AxisState; comparison?: Comparison; options: QuestionOption[]; format: Question['format']; page?: number; pages?: number; score: number; priority: boolean };

/** Answer model over bins: P(answer | bin) for A, B, blend, normalized per bin. */
function answerModel(): number[][] {
  const cols = [likForAnswer('A'), likForAnswer('B'), likForAnswer('blend')];
  return [0, 1, 2, 3, 4].map((b) => normalize(cols.map((c) => c[b] as number)));
}
const MODEL = answerModel();

/** EIG for a binary axis: H(p) - sum_a P(a) H(p | a). */
export function eigBinary(p: number[]): number {
  const h = entropy(p);
  let exp = 0;
  for (let a = 0; a < 3; a++) {
    const joint = p.map((x, b) => x * ((MODEL[b] as number[])[a] as number));
    const pa = joint.reduce((s, x) => s + x, 0);
    if (pa > 0) exp += pa * entropy(normalize(joint));
  }
  return Math.max(0, h - exp);
}

/** EIG for a categorical page showing some poles: outcomes are each shown pole or none of these. */
export function eigCategorical(p: PoleDist, shown: string[]): number {
  const ids = Object.keys(p);
  const vec = ids.map((i) => p[i] ?? 0);
  const h = entropy(vec);
  let exp = 0;
  const outcomes: ((id: string) => number)[] = [
    ...shown.map((s) => (id: string) => (id === s ? 1 : shown.includes(id) ? 0.05 : 0.15)),
    (id: string) => (shown.includes(id) ? 0.1 : 1),
  ];
  // Predictive probability of each outcome under a near-noiseless respondent.
  const pShown = shown.reduce((s, id) => s + (p[id] ?? 0), 0);
  const probs = [...shown.map((s) => p[s] ?? 0), Math.max(0, 1 - pShown)];
  outcomes.forEach((lik, i) => {
    const pa = probs[i] as number;
    if (pa <= 0) return;
    exp += pa * entropy(normalize(ids.map((id) => (p[id] ?? 0) * lik(id))));
  });
  return Math.max(0, h - exp);
}

/** EIG for a multi page: mean per-pole Bernoulli information with 0.9 accuracy. */
export function eigMulti(inclusion: PoleDist, shown: string[], acc = 0.9): number {
  if (!shown.length) return 0;
  let total = 0;
  for (const s of shown) {
    const q = inclusion[s] ?? 0.5;
    const pYes = q * acc + (1 - q) * (1 - acc);
    const postYes = (q * acc) / pYes;
    const postNo = (q * (1 - acc)) / (1 - pYes);
    total += binaryEntropy(q) - (pYes * binaryEntropy(postYes) + (1 - pYes) * binaryEntropy(postNo));
  }
  return total / shown.length;
}

/** EIG over the archetype posterior for a set of possible evidence outcomes with predictive weights. */
function eigArchetype(k: Knowledge, post: number[], outcomes: Evidence[]): number {
  const h = entropy(post);
  const liks = outcomes.map((e) => k.archetypes.map((a) => evidenceLikelihood(k, a, e)));
  const pa = liks.map((l) => l.reduce((s, x, i) => s + x * (post[i] ?? 0), 0));
  const z = pa.reduce((s, x) => s + x, 0);
  if (z <= 0) return 0;
  let exp = 0;
  liks.forEach((l, j) => {
    const w = (pa[j] as number) / z;
    if (w > 0) exp += w * entropy(normalize(post.map((p, i) => p * (l[i] ?? 0))));
  });
  return Math.max(0, h - exp);
}

function binaryOutcomes(axis: string): Evidence[] {
  return [likForAnswer('A'), likForAnswer('B'), likForAnswer('blend')].map((lik) => ({ axis, kind: 'bin' as const, lik }));
}

function catOutcomes(a: Axis, shown: string[]): Evidence[] {
  return [
    ...shown.map((s) => ({ axis: a.id, kind: 'cat' as const, lik: Object.fromEntries(a.poles.map((p) => [p.id, p.id === s ? 1 : shown.includes(p.id) ? 0.05 : 0.15])) })),
    { axis: a.id, kind: 'cat' as const, lik: Object.fromEntries(a.poles.map((p) => [p.id, shown.includes(p.id) ? 0.1 : 1])) },
  ];
}

let gateIdxCache: { k: Knowledge; idx: ReturnType<typeof gateIndex> } | undefined;
function gateIdx(k: Knowledge) {
  if (gateIdxCache?.k !== k) gateIdxCache = { k, idx: gateIndex(k) };
  return gateIdxCache.idx;
}

function gateBonus(k: Knowledge, state: SessionState, s: AxisState): number {
  if (!isGateLike(s)) return 0;
  const { setsFlags, controlled } = gateIdx(k);
  let n = 0;
  for (const f of setsFlags.get(s.axis.id) ?? []) if (state.flags[f as Flag] === undefined) n += controlled.get(f as Flag) ?? 0;
  return ENGINE.gateBonusPerAxis * n;
}

function familiarity(state: SessionState, c: Comparison | undefined): number {
  if (!c) return 0;
  const genres = state.axes.get('genre.family')?.status === 'decided' ? (state.axes.get('genre.family')?.selected ?? []) : [];
  const platforms = state.axes.get('frame.platform')?.status === 'decided' ? (state.axes.get('frame.platform')?.selected ?? []) : [];
  const known = new Set(state.knownGames.map(gameKey));
  const hit =
    c.tags.genres.some((g) => genres.includes(g)) ||
    c.tags.platforms.some((p) => platforms.includes(p)) ||
    c.options.some((o) => known.has(gameKey(o.game)));
  return hit ? ENGINE.familiarityBonus : 0;
}

function repetition(state: SessionState, module: string, games: string[]): number {
  let pen = 0;
  const recent = state.history.slice(-ENGINE.recentGameWindow);
  const recentGames = new Set(recent.flatMap((h) => h.games.map(gameKey)));
  if (games.some((g) => recentGames.has(gameKey(g)))) pen += ENGINE.recentGamePenalty;
  const last2 = state.history.slice(-2);
  if (last2.length === 2 && last2.every((h) => h.module === module)) pen += ENGINE.sameModulePenalty;
  return pen;
}

function poleOptions(a: Axis, poles: string[]): QuestionOption[] {
  return poles.map((id, i) => {
    const p = a.poles.find((x) => x.id === id);
    return { key: KEYS[i] as OptionKey, pole: id, label: p?.label ?? id, how: p?.summary };
  });
}

function comparisonOptions(c: Comparison): QuestionOption[] {
  return c.options.map((o, i) => ({ key: KEYS[i] as OptionKey, pole: o.pole, label: o.game, game: o.game, year: o.year, how: o.how }));
}

/** Builds every candidate question for the current state. */
export function candidates(k: Knowledge, state: SessionState): Candidate[] {
  const out: Candidate[] = [];
  const post = state.archetypePost;
  const anyPriority = [...state.axes.values()].some((s) => isPriority(state, s) && isAskable(state, s));
  for (const s of state.axes.values()) {
    if (!isAskable(state, s)) continue;
    const a = s.axis;
    const priority = isPriority(state, s);
    if (anyPriority && !priority) continue;
    const imp = a.importance * s.importanceMult;
    const bonus = gateBonus(k, state, s);
    if (isBinary(a)) {
      const eig = eigBinary(s.dist ?? []);
      const ea = eigArchetype(k, post, binaryOutcomes(a.id));
      const base = imp * eig + ENGINE.archetypeEigWeight * ea + bonus;
      const comps = (k.comparisonsByAxis.get(a.id) ?? []).filter((c) => !state.usedComparisons.has(c.id));
      if (comps.length) {
        for (const c of comps) {
          const games = c.options.map((o) => o.game);
          out.push({ axis: s, comparison: c, options: comparisonOptions(c), format: 'comparison', priority, score: base + familiarity(state, c) - repetition(state, a.module, games) });
        }
      } else {
        out.push({ axis: s, options: poleOptions(a, a.poles.map((p) => p.id)), format: 'poles', priority, score: base - repetition(state, a.module, []) });
      }
      continue;
    }
    if (a.kind === 'categorical') {
      const dist = s.poleDist ?? {};
      const remaining = a.poles.filter((p) => !s.excludedPoles.includes(p.id) && !p.noExemplar);
      const comps = (k.comparisonsByAxis.get(a.id) ?? []).filter(
        (c) => !state.usedComparisons.has(c.id) && c.options.every((o) => !s.excludedPoles.includes(o.pole)),
      );
      for (const c of comps) {
        const shown = c.options.map((o) => o.pole);
        const score = imp * eigCategorical(dist, shown) + ENGINE.archetypeEigWeight * eigArchetype(k, post, catOutcomes(a, shown)) + bonus + familiarity(state, c) - repetition(state, a.module, c.options.map((o) => o.game));
        out.push({ axis: s, comparison: c, options: comparisonOptions(c), format: 'comparison', priority, score });
      }
      // Pole page: most probable remaining poles first. 3 poles plus "None of these" while more remain.
      const ordered = [...a.poles.filter((p) => !s.excludedPoles.includes(p.id))].sort((x, y) => (dist[y.id] ?? 0) - (dist[x.id] ?? 0));
      const size = ordered.length <= ENGINE.pageSize ? ENGINE.pageSize : ENGINE.pageSize - 1;
      const shown = ordered.slice(0, size).map((p) => p.id);
      if (shown.length && remaining.length) {
        const pages = Math.ceil(a.poles.length / (ENGINE.pageSize - 1));
        const page = Math.floor(s.excludedPoles.length / (ENGINE.pageSize - 1)) + 1;
        const score = imp * eigCategorical(dist, shown) + ENGINE.archetypeEigWeight * eigArchetype(k, post, catOutcomes(a, shown)) + bonus - repetition(state, a.module, []);
        // Prefer pole pages slightly less than real comparisons so the library gets used.
        out.push({ axis: s, options: poleOptions(a, shown), format: 'poles', page, pages, priority, score: score - 0.01 });
      }
      continue;
    }
    // multi and rank: page of the most likely unseen poles.
    const inc = s.inclusion ?? {};
    const unseen = a.poles.filter((p) => !s.seenPoles.includes(p.id)).sort((x, y) => (inc[y.id] ?? 0.5) - (inc[x.id] ?? 0.5) || 0);
    const shown = unseen.slice(0, ENGINE.pageSize).map((p) => p.id);
    if (!shown.length) continue;
    const pages = Math.min(ENGINE.maxMultiPages, Math.ceil(a.poles.length / ENGINE.pageSize));
    const score = imp * eigMulti(inc, shown) + bonus - repetition(state, a.module, []);
    out.push({ axis: s, options: poleOptions(a, shown), format: 'poles', page: s.pagesSeen + 1, pages, priority, score });
  }
  return out;
}

function isAskable(state: SessionState, s: AxisState): boolean {
  if (s.status !== 'open') return false;
  if (s.applicable === false) return false;
  if (s.lastSkip !== undefined && state.questionCount - s.lastSkip < ENGINE.skipCooldown) return false;
  return true;
}

/** SPEC: tier 0 and gate axes come first until they are resolved. */
function isPriority(state: SessionState, s: AxisState): boolean {
  if (s.axis.tier === 0) return true;
  return isGateLike(s) && gateStillOpen(state, s);
}

export type NextOptions = { count?: number; issued?: number; deterministic?: boolean; exclude?: Set<string> };

/** Picks up to `count` questions from different modules, randomesque top-3 with a seeded PRNG. */
export function nextQuestions(k: Knowledge, state: SessionState, opts: NextOptions = {}): RenderedQuestion[] {
  const count = Math.max(1, Math.min(4, opts.count ?? 1));
  const det = opts.deterministic ?? isDeterministic();
  let pool = candidates(k, state).filter((c) => !opts.exclude?.has(c.axis.axis.id));
  // Stable order: score desc, then axis id, then comparison id.
  pool.sort((x, y) => y.score - x.score || x.axis.axis.id.localeCompare(y.axis.axis.id) || (x.comparison?.id ?? '').localeCompare(y.comparison?.id ?? ''));
  const out: RenderedQuestion[] = [];
  const usedModules = new Set<string>();
  const usedAxes = new Set<string>();
  const rand = mulberry32(hashSeed(state.seed, state.effective.length, opts.issued ?? 0));
  for (let slot = 0; slot < count; slot++) {
    pool = pool.filter((c) => !usedAxes.has(c.axis.axis.id) && !usedModules.has(c.axis.axis.module));
    if (!pool.length) break;
    // Only one candidate per axis competes for the top-K pool.
    const seen = new Set<string>();
    const top: Candidate[] = [];
    for (const c of pool) {
      if (seen.has(c.axis.axis.id)) continue;
      seen.add(c.axis.axis.id);
      top.push(c);
      if (top.length >= ENGINE.topK) break;
    }
    const pick = det ? top[0] : top[pickIndex(rand, top.length)];
    if (!pick) break;
    usedAxes.add(pick.axis.axis.id);
    usedModules.add(pick.axis.axis.module);
    out.push(render(pick, `${state.id}:q${(opts.issued ?? 0) + slot + 1}`));
  }
  return out;
}

const BLEND_LABEL = 'Blend of both';
const NA_LABEL = 'Not in my game';
const NONE_LABEL = 'None of these';

export function render(c: Candidate, questionId: string): RenderedQuestion {
  const a = c.axis.axis;
  const multi = a.kind === 'multi' || a.kind === 'rank';
  const q: Question = {
    questionId, axis: a.id, module: a.module, format: c.format, comparisonId: c.comparison?.id, multi,
    page: c.page, pages: c.pages, options: c.options,
  };
  return renderQuestion(q, a, c.score);
}

/** Renders a stored question (from the library or improvised) into AskUserQuestion form. */
export function renderQuestion(q: Question, a: Pick<Axis, 'kind' | 'label' | 'header' | 'questionTemplate' | 'poles'> & { keep?: number }, score = 0): RenderedQuestion {
  const binary = a.kind === 'bipolar' || a.kind === 'gate';
  const names = q.options.map((o) => o.label);
  let prompt = a.questionTemplate.replace('{label}', a.label);
  if (names.length >= 3 && prompt.includes('{a} or {b}')) prompt = prompt.replace('{a} or {b}', '{a}, {b} or {c}');
  prompt = prompt.replace('{a}', names[0] ?? '').replace('{b}', names[1] ?? '').replace('{c}', names[2] ?? '');
  if (!binary && q.format === 'comparison') prompt = `${a.label}: which game handles this most like yours?`;
  if (binary && q.format === 'poles' && !a.questionTemplate.includes('{a}')) prompt = `${a.label}: ${names[0]} or ${names[1]}?`;
  if (a.kind === 'rank') prompt += ` Pick up to ${a.keep ?? 3}.`;
  if (q.page && q.pages && q.pages > 1) prompt += ` (page ${q.page} of ${q.pages})`;

  const answerMap: Record<string, string> = {};
  const options: AskUserQuestion['options'] = q.options.map((o) => {
    answerMap[o.label] = o.key;
    const pole = a.poles.find((p) => p.id === o.pole);
    const poleLabel = o.pole === BLEND_POLE ? 'Blend' : (pole?.label ?? o.pole);
    const description = o.game ? `${o.how ?? ''}`.trim() : (o.how ?? poleLabel);
    const opt: AskUserQuestion['options'][number] = { label: o.label, description: description.slice(0, 200) };
    if (!q.multi && o.game) {
      opt.preview = [`**${o.game}**${o.year ? ` (${o.year})` : ''}`, '', `${a.label}: ${poleLabel}`, '', o.how ?? ''].join('\n');
    }
    return opt;
  });
  const room = () => options.length < 4;
  if (binary) {
    if (room() && !q.options.some((o) => o.pole === BLEND_POLE)) {
      options.push({ label: BLEND_LABEL, description: 'Somewhere in between, or a mix of both approaches' });
      answerMap[BLEND_LABEL] = 'blend';
    }
    if (room()) {
      options.push({ label: NA_LABEL, description: 'This axis does not apply to my game' });
      answerMap[NA_LABEL] = 'na';
    }
  } else if (!q.multi && room()) {
    options.push({ label: NONE_LABEL, description: 'None of these fit; show other options' });
    answerMap[NONE_LABEL] = 'neither';
  }
  answerMap['Other'] = 'neither';
  return {
    ...q,
    prompt,
    score,
    answerMap,
    askUserQuestion: { question: prompt, header: a.header, multiSelect: q.multi, options },
  };
}
