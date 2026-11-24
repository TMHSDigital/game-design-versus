import type { Knowledge } from './data';
import { isBinary, type Axis } from './ontology';
import { rankAffinity } from './affinity';
import { claritySummary, countedAxes, topArchetypes, type AxisState, type SessionState } from './session';
import { gameKey } from './coverage';

export type BriefSystemItem = { axis: string; label: string; position: string; lean?: number; status: string; clarity: number; reference?: string; notes?: string[] };
export type Brief = {
  title: string;
  pitch: string;
  elevator: string;
  frame: Record<string, string>;
  experience: { aesthetics: string[]; motivations: string[]; tone: string; pace: string; challenge: string };
  genre: { families: string[]; forms: string[]; tags: string[]; archetypes: { label: string; p: number }[] };
  pillars: { title: string; description: string }[];
  coreLoop: { moment: string; session: string; longTerm: string };
  systems: { module: string; label: string; clarity: number; items: BriefSystemItem[] }[];
  comparables: { headline: string; titles: { game: string; score: number; borrow: string[] }[] };
  usps: string[];
  nonGoals: string[];
  scope: { team: string; timeline: string; mvp: string; verticalSlice: string; activeModules: number; warning?: string };
  risks: { severity: string; message: string; probe?: string }[];
  openQuestions: { axis: string; label: string; importance: number; clarity: number; question: string }[];
  decisionLog: { at: string; kind: string; axis?: string; answer: string; note?: string }[];
  clarity: { overall: number; questionCount: number; stopRecommended: boolean };
};

const VERB3: Record<string, string> = {
  fight: 'fights', explore: 'explores', build: 'builds', manage: 'manages', solve: 'solves', race: 'races', talk: 'talks',
  collect: 'collects', create: 'creates', trade: 'trades',
};
const GOAL: Record<string, string> = {
  destruction: 'cause spectacular mayhem', excitement: 'chase the next thrill', competition: 'beat everyone else',
  community: 'thrive together with friends', challenge: 'master a demanding challenge', strategy: 'outthink every rival',
  completion: 'complete everything there is', power: 'become overwhelmingly powerful', fantasy: 'live out a fantasy',
  story: 'see the story through', design: 'make something their own', discovery: 'discover what lies beyond the map',
};

function poleLabel(a: Axis, id: string | undefined): string {
  return a.poles.find((p) => p.id === id)?.label ?? id ?? '';
}

/** Human-readable position for an axis. */
export function positionText(s: AxisState): string {
  const a = s.axis;
  if (s.status === 'na') return 'Not in this game';
  if (isBinary(a)) {
    const [pa, pb] = a.poles;
    const pct = s.leanPct ?? 50;
    if (s.status === 'flexible' && !s.evidenceCount) return 'Flexible (no strong preference)';
    if (s.lean === 'A') return pct <= 15 ? `${pa?.label}` : `Leans ${pa?.label}`;
    if (s.lean === 'B') return pct >= 85 ? `${pb?.label}` : `Leans ${pb?.label}`;
    return `Blend of ${pa?.label} and ${pb?.label}`;
  }
  const sel = (s.selected ?? []).map((p) => poleLabel(a, p)).filter(Boolean);
  if (s.status === 'flexible' && s.notes.length) return `Other: ${s.notes.join('; ')}`;
  return sel.length ? sel.join(', ') : 'Undecided';
}

function referenceText(s: AxisState): string | undefined {
  const r = s.ref;
  if (!r?.chosen) return undefined;
  const not = r.rejected.length ? `, not ${r.rejected.map((x) => x.game).join(' or ')}` : '';
  return `like ${r.chosen.game}${r.chosen.how ? ` (${r.chosen.how})` : ''}${not}`;
}

function axisValue(state: SessionState, id: string): string {
  const s = state.axes.get(id);
  if (!s) return '';
  if (s.status === 'open' && s.clarity < 0.6) return 'Undecided';
  return positionText(s);
}

function sentenceCase(s: string): string {
  return s ? s[0]?.toUpperCase() + s.slice(1) : s;
}

function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

export function buildBrief(k: Knowledge, state: SessionState): Brief {
  const sum = claritySummary(k, state);
  const ax = (id: string) => state.axes.get(id);
  const sel = (id: string) => {
    const s = ax(id);
    return s && s.status !== 'open' ? (s.selected ?? []) : s && s.clarity >= 0.6 ? (s.selected ?? []) : [];
  };
  const labelsOf = (id: string) => {
    const a = k.axisById.get(id);
    return a ? sel(id).map((p) => poleLabel(a, p)) : [];
  };
  const arch = topArchetypes(k, state, 3);
  const affinity = rankAffinity(state.elo).filter((e) => e.games > 0);

  // Comparable titles: Elo winners, else the top archetype exemplars.
  const borrowFor = new Map<string, string[]>();
  for (const s of state.axes.values()) {
    const g = s.ref?.chosen?.game;
    if (!g || s.status !== 'decided') continue;
    const list = borrowFor.get(gameKey(g)) ?? [];
    list.push(`${s.axis.label.toLowerCase()}: ${s.ref?.chosen?.how ?? positionText(s)}`);
    borrowFor.set(gameKey(g), list);
  }
  const comps = (affinity.length ? affinity.filter((e) => e.score >= 1500) : [])
    .slice(0, 5)
    .map((e) => ({ game: e.game, score: Math.round(e.score), borrow: borrowFor.get(gameKey(e.game)) ?? [] }));
  if (comps.length < 2) {
    for (const ex of arch[0]?.exemplars ?? []) if (comps.length < 5 && !comps.some((c) => c.game === ex)) comps.push({ game: ex, score: 0, borrow: [`its overall ${arch[0]?.label.toLowerCase()} structure`] });
  }
  const headline = comps.length >= 2 ? `${comps[0]?.game} meets ${comps[1]?.game}` : (comps[0]?.game ?? arch[0]?.label ?? 'A new game');

  const counted = countedAxes(state);
  const decided = counted.filter((s) => s.status === 'decided');
  const byImportance = [...decided].sort((a, b) => b.axis.importance - a.axis.importance || b.clarity - a.clarity || a.axis.id.localeCompare(b.axis.id));

  // Pillars: highest-importance decided axes, one per module, 3 to 5.
  const pillars: Brief['pillars'] = [];
  const pillarModules = new Set<string>();
  for (const s of byImportance) {
    if (pillars.length >= 5) break;
    if (pillarModules.has(s.axis.module) || s.axis.kind === 'gate' || s.axis.tier === 0) continue;
    if (s.axis.kind === 'multi' || s.axis.kind === 'rank') continue;
    pillarModules.add(s.axis.module);
    const ref = referenceText(s);
    pillars.push({ title: `${s.axis.label}: ${positionText(s)}`, description: ref ? sentenceCase(ref) + '.' : (s.axis.poles.find((p) => p.id === s.selected?.[0])?.summary ?? `Committed position on ${s.axis.label.toLowerCase()}.`) });
  }
  if (pillars.length < 3) for (const s of byImportance.filter((x) => !pillarModules.has(x.axis.module))) if (pillars.length < 3) { pillarModules.add(s.axis.module); pillars.push({ title: `${s.axis.label}: ${positionText(s)}`, description: referenceText(s) ?? '' }); }

  // Pitch.
  const verbs = sel('loop.verb').map((v) => VERB3[v] ?? v).slice(0, 2);
  const commander = ax('ctl.embodiment')?.lean === 'B';
  const player = commander ? 'The player, as a commander,' : ax('narr.protagonist')?.lean === 'A' && ax('narr.presence')?.lean !== 'A' ? 'A defined hero' : 'The player';
  const motive = (ax('exp.motivation')?.selected ?? [])[0];
  const goal = (motive && GOAL[motive]) || 'reach their goals';
  const twistAxis = byImportance.find((s) => s.ref?.chosen && isBinary(s.axis)) ?? byImportance.find((s) => isBinary(s.axis) && s.axis.kind !== 'gate');
  const twist = twistAxis ? `${positionText(twistAxis).replace(/^Leans /, '').toLowerCase()} ${twistAxis.axis.label.toLowerCase()}` : 'a distinctive twist';
  const pitch = `${player} ${verbs.length ? joinAnd(verbs) : 'plays'} in order to ${goal}, with ${twist}.`;
  const families = labelsOf('genre.family');
  const forms = labelsOf('genre.form');
  const setting = labelsOf('world.setting')[0];
  const elevator = [
    `${state.title ?? 'This game'} is ${forms.length ? `a ${forms.slice(0, 2).join(' and ').toLowerCase()}` : families.length ? `a ${families.slice(0, 2).join(' and ').toLowerCase()} game` : `a ${arch[0]?.label.toLowerCase() ?? 'new'} game`}${setting ? ` in a ${setting.toLowerCase()} setting` : ''}.`,
    `Think ${headline}.`,
    state.pitch ? `Original pitch: ${state.pitch}` : '',
    pillars.length ? `It is built on ${joinAnd(pillars.slice(0, 3).map((p) => p.title.split(': ')[1]?.toLowerCase() ?? p.title))}.` : '',
  ].filter(Boolean).join(' ');

  const frameIds = ['frame.platform', 'frame.input', 'frame.players', 'frame.session', 'frame.length', 'frame.monetization', 'frame.team', 'frame.timeline', 'frame.engine', 'frame.rating', 'frame.dimension', 'frame.realism'];
  const frame: Record<string, string> = {};
  for (const id of frameIds) frame[k.axisById.get(id)?.label ?? id] = axisValue(state, id);

  const tags = [...new Set([...forms, ...families, ...labelsOf('cam.view'), ...labelsOf('frame.dimension'), ...labelsOf('frame.players'), ...(setting ? [setting] : [])])].slice(0, 5);

  // Systems spec per applicable module.
  const systems: Brief['systems'] = [];
  for (const m of k.modules) {
    if (['frame', 'experience', 'genre'].includes(m.id)) continue;
    const items = counted
      .filter((s) => s.axis.module === m.id && s.axis.kind !== 'gate' && (s.status !== 'open' || s.clarity >= 0.6))
      .map((s) => ({
        axis: s.axis.id, label: s.axis.label, position: positionText(s), lean: isBinary(s.axis) ? s.leanPct : undefined,
        status: s.status === 'open' ? 'inferred' : s.status, clarity: round(s.clarity), reference: referenceText(s), notes: s.notes.length ? s.notes : undefined,
      }));
    if (!items.length) continue;
    systems.push({ module: m.id, label: m.label, clarity: round(sum.modules.find((x) => x.module === m.id)?.clarity ?? 0), items });
  }
  if (state.custom.size) {
    systems.push({
      module: 'custom', label: 'Custom axes', clarity: 1,
      items: [...state.custom.values()].map((c) => ({
        axis: c.def.id, label: c.def.label, position: c.lean === 'A' ? c.def.poleA : c.lean === 'B' ? c.def.poleB : c.status === 'na' ? 'Not in this game' : `Blend of ${c.def.poleA} and ${c.def.poleB}`,
        status: c.status, clarity: 1, reference: c.ref?.chosen ? `like ${c.ref.chosen.game}` : undefined, notes: c.notes.length ? c.notes : undefined,
      })),
    });
  }

  // USPs: decided strong positions that differ from the top archetype's norm.
  const top = k.archetypes.find((a) => a.id === arch[0]?.id);
  const usps: string[] = [];
  for (const s of byImportance) {
    if (usps.length >= 3) break;
    if (!isBinary(s.axis) || s.axis.kind === 'gate' || s.lean === 'center') continue;
    const norm = top?.profile[s.axis.id];
    const bin = s.lean === 'A' ? -2 : 2;
    if (typeof norm === 'number' && Math.sign(norm) === Math.sign(bin)) continue;
    usps.push(`${positionText(s)} ${s.axis.label.toLowerCase()}, unusual for a ${top?.label.toLowerCase() ?? 'game of this kind'}${s.ref?.chosen ? ` (${referenceText(s)})` : ''}`);
  }
  if (!usps.length && pillars[0]) usps.push(pillars[0].title);

  const nonGoals: string[] = [];
  for (const m of sum.modules) if (m.status === 'skipped') nonGoals.push(`No ${k.moduleById.get(m.module)?.label.toLowerCase() ?? m.module} module`);
  for (const s of decided) {
    if (!isBinary(s.axis) || s.axis.kind === 'gate' || s.lean === 'center') continue;
    if ((s.leanPct ?? 50) > 15 && (s.leanPct ?? 50) < 85) continue;
    const other = s.lean === 'A' ? s.axis.poles[1] : s.axis.poles[0];
    if (other) nonGoals.push(`Not ${other.label.toLowerCase()} (${s.axis.label.toLowerCase()})`);
  }

  const team = axisValue(state, 'frame.team');
  const timeline = axisValue(state, 'frame.timeline');
  const activeModules = sum.modules.filter((m) => m.status === 'active').length;
  const scope = scopeFor(state, activeModules, team, timeline, pillars.map((p) => p.title));

  const risks: Brief['risks'] = state.tensions.map((t) => ({ severity: t.severity, message: t.message, probe: t.probe }));
  for (const s of state.axes.values()) {
    const c = s.ref?.comparisonId ? k.comparisonById.get(s.ref.comparisonId) : undefined;
    if (c?.note && /patent/i.test(c.note) && s.ref?.chosen && c.options.some((o) => o.game === s.ref?.chosen?.game && /mordor|patent/i.test(`${o.game} ${c.note}`))) {
      risks.push({ severity: 'risk', message: `${c.options.map((o) => o.game).join(' vs ')}: ${c.note}` });
    }
  }
  if (scope.warning) risks.push({ severity: 'warn', message: scope.warning });

  const openQuestions = counted
    .filter((s) => s.clarity < 0.6)
    .sort((a, b) => b.axis.importance - a.axis.importance || a.clarity - b.clarity || a.axis.id.localeCompare(b.axis.id))
    .map((s) => ({ axis: s.axis.id, label: s.axis.label, importance: s.axis.importance, clarity: round(s.clarity), question: s.axis.questionTemplate.replace('{label}', s.axis.label).replace('{a}', s.axis.poles[0]?.label ?? '').replace('{b}', s.axis.poles[1]?.label ?? '').replace(' or {c}', '') }));

  return {
    title: state.title ?? 'Untitled game',
    pitch,
    elevator,
    frame,
    experience: {
      aesthetics: labelsOf('exp.aesthetics').slice(0, 3),
      motivations: labelsOf('exp.motivation').slice(0, 4),
      tone: axisValue(state, 'exp.tone'),
      pace: axisValue(state, 'exp.pace'),
      challenge: axisValue(state, 'exp.challenge'),
    },
    genre: { families, forms, tags, archetypes: arch.map((a) => ({ label: a.label, p: round(a.p) })) },
    pillars: pillars.slice(0, 5),
    coreLoop: coreLoop(state, verbs),
    systems,
    comparables: { headline, titles: comps },
    usps,
    nonGoals: [...new Set(nonGoals)].slice(0, 12),
    scope,
    risks,
    openQuestions,
    decisionLog: state.log.map((l) => ({ at: l.at, kind: l.kind, axis: l.axis, answer: l.answer, note: l.note })),
    clarity: { overall: round(sum.overall), questionCount: sum.questionCount, stopRecommended: sum.stop.recommended },
  };
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}

function coreLoop(state: SessionState, verbs: string[]): Brief['coreLoop'] {
  const ax = (id: string) => state.axes.get(id);
  const lean = (id: string) => ax(id)?.lean;
  const doing = verbs.length ? joinAnd(verbs) : 'acts';
  const pace = lean('exp.pace') === 'B' ? 'under constant pressure' : lean('exp.pace') === 'A' ? 'at their own pace' : 'with rising and falling pressure';
  const cadence = lean('loop.cadence') === 'A' ? 'reading the situation and executing in the moment' : lean('loop.cadence') === 'B' ? 'planning each move before committing' : 'mixing quick execution with short planning beats';
  const moment = `Seconds: the player ${doing.replace(/s\b/g, '')} ${pace}, ${cadence}${ax('combat.sim')?.applicable === true ? `; combat is ${(ax('combat.sim')?.lean === 'A' ? 'physics-simulated' : ax('combat.sim')?.lean === 'B' ? 'animation and stat driven' : 'a hybrid of physics and animation')}` : ''}.`;
  const runs = lean('loop.run') === 'B';
  const sessionLen = lean('frame.session') === 'A' ? 'under 20 minutes' : lean('frame.session') === 'B' ? 'two hours or more' : 'about an hour';
  const session = `Minutes: a session of ${sessionLen} ${runs ? 'is one or more runs that reset on failure' : 'advances one persistent campaign'}${ax('loop.goal')?.lean === 'B' ? ', toward goals the player sets' : ', toward explicit objectives'}.`;
  const prog = ax('prog.presence');
  const longParts: string[] = [];
  if (prog?.applicable !== false && prog?.lean !== 'A') longParts.push(lean('prog.direction') === 'B' ? 'new options unlock rather than raw power' : 'the player grows stronger');
  if (runs && ax('prog.meta')?.lean === 'B') longParts.push('runs feed permanent meta upgrades');
  if (lean('world.persistence') === 'B') longParts.push('the world keeps the changes the player makes');
  if (lean('live.model') === 'B') longParts.push('seasons and live updates add goals');
  if (lean('frame.length') === 'A') longParts.push('the experience builds to a designed ending');
  const longTerm = `Weeks: ${longParts.length ? joinAnd(longParts) : 'mastery and variety keep the player returning'}.`;
  return { moment, session, longTerm };
}

const SCOPE: Record<string, { mvp: string; slice: string; budget: number }> = {
  jam: { mvp: 'One room or level that proves the core verb in under 10 minutes of play.', slice: 'The jam build itself: one polished loop, placeholder everything else.', budget: 2 },
  months: { mvp: 'The core loop playable end to end with greybox art and one content set.', slice: '15 to 30 minutes at final quality covering the core loop once.', budget: 4 },
  years: { mvp: 'All active systems at minimal depth plus one region or mode of content.', slice: 'A 30 to 60 minute slice at shipping quality that shows every pillar.', budget: 7 },
  long: { mvp: 'Every pillar implemented with content tooling ready for scale.', slice: 'A one-hour slice at shipping quality plus a content pipeline proof.', budget: 10 },
};

function scopeFor(state: SessionState, activeModules: number, team: string, timeline: string, pillars: string[]): Brief['scope'] {
  const tl = state.axes.get('frame.timeline')?.selected?.[0] ?? 'years';
  const tm = state.axes.get('frame.team')?.selected?.[0] ?? 'small';
  const s = SCOPE[tl] ?? (SCOPE.years as (typeof SCOPE)[string]);
  const teamFactor = { solo: 0.6, small: 1, medium: 1.6, large: 2.5 }[tm] ?? 1;
  const budget = Math.round(s.budget * teamFactor);
  const warning = activeModules > budget + 4 ? `Scope: ${activeModules} active modules for a ${team.toLowerCase()} team on a ${timeline.toLowerCase()} timeline. Cut to the pillars (${pillars.slice(0, 3).map((p) => p.split(':')[0]).join(', ')}) for the MVP.` : undefined;
  return { team, timeline, mvp: s.mvp, verticalSlice: s.slice, activeModules, warning };
}

export function renderBriefMarkdown(b: Brief): string {
  const L: string[] = [];
  L.push(`# ${b.title}`, '', `> ${b.pitch}`, '', b.elevator, '');
  L.push(`Overall clarity ${b.clarity.overall} after ${b.clarity.questionCount} questions.`, '');
  L.push('## 1. Frame', '', '| Aspect | Decision |', '| --- | --- |', ...Object.entries(b.frame).map(([k, v]) => `| ${k} | ${v || 'Undecided'} |`), '');
  L.push('## 2. Experience targets', '');
  L.push(`- MDA aesthetics: ${b.experience.aesthetics.join(', ') || 'Undecided'}`);
  L.push(`- Player motivations: ${b.experience.motivations.join(', ') || 'Undecided'}`);
  L.push(`- Tone: ${b.experience.tone}`, `- Pace: ${b.experience.pace}`, `- Challenge: ${b.experience.challenge}`, '');
  L.push('## 3. Genre', '');
  L.push(`- Families: ${b.genre.families.join(', ') || 'Undecided'}`, `- Forms: ${b.genre.forms.join(', ') || 'None'}`, `- Tags: ${b.genre.tags.join(', ') || 'None'}`);
  L.push(`- Closest archetypes: ${b.genre.archetypes.map((a) => `${a.label} (${Math.round(a.p * 100)}%)`).join(', ')}`, '');
  L.push('## 4. Design pillars', '', ...b.pillars.map((p, i) => `${i + 1}. **${p.title}**${p.description ? `. ${p.description}` : ''}`), '');
  L.push('## 5. Core loop', '', `- ${b.coreLoop.moment}`, `- ${b.coreLoop.session}`, `- ${b.coreLoop.longTerm}`, '');
  L.push('## 6. Systems spec', '');
  for (const m of b.systems) {
    L.push(`### ${m.label} (clarity ${m.clarity})`, '', '| Axis | Position | Status | Reference |', '| --- | --- | --- | --- |');
    for (const i of m.items) L.push(`| ${i.label} | ${i.position}${i.lean !== undefined ? ` (lean ${i.lean})` : ''} | ${i.status} | ${(i.reference ?? '') + (i.notes ? ` Notes: ${i.notes.join('; ')}` : '')} |`);
    L.push('');
  }
  L.push('## 7. Comparable titles', '', `**${b.comparables.headline}**`, '');
  for (const t of b.comparables.titles) L.push(`- **${t.game}**${t.borrow.length ? `: borrow ${t.borrow.join('; ')}` : ''}`);
  L.push('', '## 8. USPs and non-goals', '', '**USPs**', '', ...b.usps.map((u) => `- ${u}`), '', '**Non-goals**', '', ...(b.nonGoals.length ? b.nonGoals.map((n) => `- ${n}`) : ['- None recorded']), '');
  L.push('## 9. Scope', '', `- Team: ${b.scope.team}`, `- Timeline: ${b.scope.timeline}`, `- Active modules: ${b.scope.activeModules}`, `- MVP: ${b.scope.mvp}`, `- Vertical slice: ${b.scope.verticalSlice}`, '');
  L.push('## 10. Risks', '', ...(b.risks.length ? b.risks.map((r) => `- **${r.severity}**: ${r.message}${r.probe ? ` Probe: ${r.probe}` : ''}`) : ['- None detected']), '');
  L.push('## 11. Open questions', '', ...(b.openQuestions.length ? b.openQuestions.map((q) => `- (${q.importance}) ${q.label}: ${q.question} (clarity ${q.clarity})`) : ['- None below 0.6 clarity']), '');
  L.push('## 12. Decision log', '', '| When | Kind | Axis | Answer |', '| --- | --- | --- | --- |', ...b.decisionLog.map((d) => `| ${d.at} | ${d.kind} | ${d.axis ?? ''} | ${d.answer}${d.note ? ` (${d.note})` : ''} |`), '');
  return L.join('\n').replace(/—/g, ',');
}
