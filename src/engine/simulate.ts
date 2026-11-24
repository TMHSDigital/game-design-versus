import type { Knowledge } from './data';
import { isBinary, type Archetype } from './ontology';
import { claritySummary, foldSession, topArchetypes, type Choice, type SessionEvent, type SessionState, type Question } from './session';
import { nextQuestions } from './selection';

export type Persona = {
  id: string;
  label: string;
  archetype: string;
  /** Facts an agent would record from the pitch via versus_set before asking anything. */
  pitchAxes: string[];
  overrides?: Archetype['profile'];
};

export const PERSONAS: Persona[] = [
  { id: 'physics_brawler', label: 'Physics brawler like Half Sword', archetype: 'physics_brawler', pitchAxes: ['frame.platform', 'frame.players', 'genre.family'], overrides: { 'frame.platform': ['pc'], 'frame.players': 'local_versus', 'frame.team': 'small', 'frame.timeline': 'years' } },
  { id: 'business_sim', label: 'Business sim like Big Ambitions', archetype: 'business_tycoon', pitchAxes: ['frame.platform', 'frame.players', 'genre.family'], overrides: { 'frame.platform': ['pc'], 'frame.team': 'small', 'frame.timeline': 'years' } },
  { id: 'civ_4x', label: '4X like Civilization VI', archetype: 'x4', pitchAxes: ['frame.platform', 'frame.players', 'genre.family'], overrides: { 'frame.platform': ['pc', 'console'], 'frame.team': 'medium', 'frame.timeline': 'long' } },
  { id: 'cozy_farming', label: 'Cozy farming life sim', archetype: 'cozy_farming', pitchAxes: ['frame.platform', 'frame.players', 'genre.family'], overrides: { 'frame.platform': ['pc', 'handheld'], 'frame.team': 'solo', 'frame.timeline': 'years' } },
  { id: 'extraction', label: 'Extraction shooter', archetype: 'extraction_shooter', pitchAxes: ['frame.platform', 'frame.players', 'genre.family'], overrides: { 'frame.platform': ['pc'], 'frame.team': 'medium', 'frame.timeline': 'long' } },
  { id: 'deckbuilder', label: 'Roguelike deckbuilder', archetype: 'roguelike_deckbuilder', pitchAxes: ['frame.platform', 'frame.players', 'genre.family'], overrides: { 'frame.platform': ['pc', 'mobile'], 'frame.team': 'small', 'frame.timeline': 'years' } },
  { id: 'survival_horror', label: 'Survival horror', archetype: 'survival_horror', pitchAxes: ['frame.platform', 'frame.players', 'genre.family'], overrides: { 'frame.platform': ['pc', 'console'], 'frame.team': 'medium', 'frame.timeline': 'years' } },
  { id: 'party', label: 'Party game', archetype: 'party_game', pitchAxes: ['frame.platform', 'frame.players', 'genre.family'], overrides: { 'frame.platform': ['console', 'pc'], 'frame.team': 'small', 'frame.timeline': 'months' } },
];

export type SimResult = {
  persona: string;
  questions: number;
  clarity: number;
  reached: boolean;
  stopRecommended: boolean;
  irrelevantAsked: string[];
  topArchetypes: string[];
  matchRank: number;
  trace: { axis: string; choice: string }[];
  state: SessionState;
};

export function personaProfile(k: Knowledge, p: Persona): Archetype['profile'] {
  const arch = k.archetypes.find((a) => a.id === p.archetype);
  if (!arch) throw new Error(`unknown archetype ${p.archetype}`);
  return { ...arch.profile, ...(p.overrides ?? {}) };
}

/** How a persona with a hidden profile answers a rendered question. */
export function personaAnswer(k: Knowledge, profile: Archetype['profile'], q: Question): { choice: Choice; selected?: string[] } {
  const a = k.axisById.get(q.axis);
  const truth = profile[q.axis];
  if (!a || truth === undefined) return { choice: 'no_pref' };
  if (isBinary(a)) {
    const bin = typeof truth === 'number' ? truth : 0;
    if (bin === 0) return { choice: 'blend' };
    const pole = bin < 0 ? a.poles[0]?.id : a.poles[1]?.id;
    const opt = q.options.find((o) => o.pole === pole);
    return opt ? { choice: opt.key } : { choice: 'blend' };
  }
  const vals = Array.isArray(truth) ? truth : [String(truth)];
  if (a.kind === 'categorical') {
    const opt = q.options.find((o) => vals.includes(o.pole));
    return opt ? { choice: opt.key } : { choice: 'neither' };
  }
  return { choice: 'neither', selected: q.options.filter((o) => vals.includes(o.pole)).map((o) => o.key) };
}

export function runPersona(k: Knowledge, p: Persona, opts: { maxQuestions?: number; seed?: number; batch?: number } = {}): SimResult {
  const max = opts.maxQuestions ?? 45;
  const profile = personaProfile(k, p);
  const at = '2026-11-23T00:00:00.000Z';
  const events: SessionEvent[] = [{ type: 'start', at, sessionId: `sim-${p.id}`, seed: opts.seed ?? 7 }];
  for (const axis of p.pitchAxes) {
    const v = profile[axis];
    if (v !== undefined) events.push({ type: 'set', at, axis, value: v, confidence: 0.9, source: 'user_statement' });
  }
  // Ground truth applicability: fold every profile fact and see which axes apply.
  const truthEvents: SessionEvent[] = [events[0] as SessionEvent];
  for (const [axis, v] of Object.entries(profile)) truthEvents.push({ type: 'set', at, axis, value: v, confidence: 1, source: 'user_statement' });
  const truth = foldSession(k, truthEvents);

  const trace: SimResult['trace'] = [];
  const irrelevant: string[] = [];
  let state = foldSession(k, events);
  let issued = 0;
  let reachedAt = -1;
  while (state.questionCount < max) {
    const summary = claritySummary(k, state);
    if (summary.overall >= 0.8 && reachedAt < 0) reachedAt = state.questionCount;
    if (summary.stop.recommended) break;
    const qs = nextQuestions(k, state, { count: opts.batch ?? 1, issued });
    issued += qs.length;
    if (!qs.length) break;
    for (const q of qs) {
      const ans = personaAnswer(k, profile, q);
      if (truth.axes.get(q.axis)?.applicable === false) irrelevant.push(q.axis);
      trace.push({ axis: q.axis, choice: ans.selected ? `[${ans.selected.join(',')}]` : ans.choice });
      events.push({ type: 'answer', at, question: q, choice: ans.choice, selected: ans.selected });
    }
    state = foldSession(k, events);
  }
  const summary = claritySummary(k, state);
  const top = topArchetypes(k, state, 5).map((a) => a.id);
  return {
    persona: p.id,
    questions: state.questionCount,
    clarity: summary.overall,
    reached: summary.overall >= 0.8,
    stopRecommended: summary.stop.recommended,
    irrelevantAsked: irrelevant,
    topArchetypes: top,
    matchRank: top.indexOf(p.archetype) + 1,
    trace,
    state,
  };
}
