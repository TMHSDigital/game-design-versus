import { describe, expect, it } from 'vitest';
import { knowledge } from '../../src/engine/data';
import { claritySummary, foldSession, isCoreAxis, isPresenceGate, SYSTEMS_CHECKLIST, type SessionEvent, type Question } from '../../src/engine/session';
import { PERSONAS, runPersona } from '../../src/engine/simulate';
import { candidates, eigBinary, nextQuestions, render } from '../../src/engine/selection';
import { ENGINE } from '../../src/engine/config';
import { isBinary } from '../../src/engine/ontology';

const k = knowledge();
const at = '2026-11-23T00:00:00.000Z';
const start: SessionEvent = { type: 'start', at, sessionId: 's1', seed: 1234 };

function stripVolatile(s: ReturnType<typeof foldSession>) {
  return JSON.stringify({
    axes: [...s.axes.entries()].map(([id, a]) => [id, a.status, a.dist, a.poleDist, a.inclusion, a.clarity, a.applicable]),
    arch: s.archetypePost,
    flags: s.flags,
    elo: s.elo,
    count: s.questionCount,
  });
}

function answer(q: Question, choice: string, extra: Partial<Extract<SessionEvent, { type: 'answer' }>> = {}): SessionEvent {
  return { type: 'answer', at, question: q, choice: choice as never, ...extra };
}

describe('session fold', () => {
  it('starts with everything open and no flags decided', () => {
    const s = foldSession(k, [start]);
    expect(s.questionCount).toBe(0);
    expect(s.axes.get('combat.sim')?.status).toBe('open');
    expect(s.flags.has_combat).toBeUndefined();
  });

  it('undo replays to an identical state', () => {
    const q = nextQuestions(k, foldSession(k, [start]), { deterministic: true })[0] as Question;
    const events: SessionEvent[] = [start, answer(q, 'a')];
    const before = stripVolatile(foldSession(k, events));
    const s2 = foldSession(k, [...events, answer(q, 'b'), { type: 'undo', at }]);
    expect(stripVolatile(s2)).toEqual(before);
    const s3 = foldSession(k, [...events, { type: 'undo', at }]);
    expect(stripVolatile(s3)).toEqual(stripVolatile(foldSession(k, [start])));
  });

  it('never pops the start event', () => {
    expect(() => foldSession(k, [start, { type: 'undo', at }, { type: 'undo', at }])).not.toThrow();
  });

  it('constraints from start become decided frame facts', () => {
    const s = foldSession(k, [{ ...start, constraints: { platform: ['pc'], team: 'solo', timeline: 'years' } } as SessionEvent]);
    expect(s.axes.get('frame.team')?.status).toBe('decided');
    expect(s.axes.get('frame.team')?.selected).toEqual(['solo']);
    expect(s.axes.get('frame.platform')?.selected).toEqual(['pc']);
  });

  it('set events record user statements', () => {
    const s = foldSession(k, [start, { type: 'set', at, axis: 'exp.tone', value: 2, confidence: 0.9, source: 'user_statement' }]);
    const tone = s.axes.get('exp.tone');
    expect(tone?.status).toBe('decided');
    expect(tone?.lean).toBe('B');
    expect(tone?.source).toBe('user_statement');
  });

  it('gates the combat module when combat is answered as absent', () => {
    const s = foldSession(k, [start, { type: 'set', at, axis: 'combat.presence', value: 'none', confidence: 1, source: 'user_statement' }]);
    expect(s.flags.has_combat).toBe(false);
    expect(s.axes.get('combat.sim')?.applicable).toBe(false);
    // Stealth lives in the combat module but stays available without combat.
    const combatAxes = [...s.axes.values()].filter((a) => a.axis.id.startsWith('combat.') && a.axis.id !== 'combat.presence');
    expect(combatAxes.every((a) => a.applicable === false)).toBe(true);
    expect(claritySummary(k, s).modules.find((m) => m.module === 'movement')).toBeDefined();
  });

  it('no_pref marks flexible with reduced importance; na marks na', () => {
    const q: Question = { questionId: 'x', axis: 'exp.tone', module: 'experience', format: 'poles', multi: false, options: [{ key: 'a', pole: 'light', label: 'Lighthearted' }, { key: 'b', pole: 'grim', label: 'Grim' }] };
    const s = foldSession(k, [start, answer(q, 'no_pref')]);
    expect(s.axes.get('exp.tone')?.status).toBe('flexible');
    expect(s.axes.get('exp.tone')?.importanceMult).toBeCloseTo(0.3);
    const s2 = foldSession(k, [start, answer(q, 'na')]);
    expect(s2.axes.get('exp.tone')?.status).toBe('na');
  });

  it('a no_pref multi axis selects no poles and sets no flags (#2)', () => {
    const q: Question = {
      questionId: 'f', axis: 'genre.form', module: 'genre', format: 'poles', multi: true,
      options: [{ key: 'a', pole: 'moba', label: 'MOBA' }, { key: 'b', pole: 'battle_royale', label: 'Battle royale' }],
    };
    const s = foldSession(k, [
      start,
      { type: 'set', at, axis: 'frame.players', value: 'local_versus', confidence: 0.9, source: 'user_statement' },
      answer(q, 'no_pref'),
    ]);
    expect(s.axes.get('genre.form')?.status).toBe('flexible');
    expect(s.axes.get('genre.form')?.selected).toEqual([]);
    expect(s.flags.is_online).toBe(false);
  });

  it('prior inclusion at 0.5 plus rounding noise never counts as selected (#2)', () => {
    const s = foldSession(k, [start]);
    for (const a of s.axes.values()) {
      if (!a.inclusion) continue;
      for (const p of a.selected ?? []) {
        if (a.axis.kind === 'rank') continue;
        expect(a.inclusion[p], `${a.axis.id}.${p}`).toBeGreaterThan(0.5 + 1e-6);
      }
    }
  });

  it('the sample session no longer reports online play for a local versus game (#2)', async () => {
    const { readFileSync } = await import('node:fs');
    const f = JSON.parse(readFileSync(new URL('../../examples/sample-session.json', import.meta.url), 'utf8'));
    const s = foldSession(k, f.events);
    expect(s.axes.get('frame.players')?.selected).toEqual(['local_versus']);
    expect(s.flags.is_online).toBe(false);
    expect(s.tensions.map((t) => t.id)).not.toContain('physics_melee_online_pvp');
  });

  it('"None of these" on page 1 of a multi axis keeps it open; none on every page is no answer (#3)', () => {
    const page = (n: number, poles: string[]): Question => ({
      questionId: `p${n}`, axis: 'frame.platform', module: 'frame', format: 'poles', multi: true, page: n, pages: 2,
      options: poles.map((p, i) => ({ key: (['a', 'b', 'c', 'd'] as const)[i] as 'a', pole: p, label: p })),
    });
    const first = foldSession(k, [start, answer(page(1, ['pc', 'console', 'handheld', 'mobile']), 'neither', { selected: [] })]);
    expect(first.axes.get('frame.platform')?.status).toBe('open');
    const next = candidates(k, first).find((c) => c.axis.axis.id === 'frame.platform');
    expect(next?.page).toBe(2);
    expect(next?.options.map((o) => o.pole).sort()).toEqual(['vr', 'web']);
    const both = foldSession(k, [
      start,
      answer(page(1, ['pc', 'console', 'handheld', 'mobile']), 'neither', { selected: [] }),
      answer(page(2, ['vr', 'web']), 'neither', { selected: [] }),
    ]);
    expect(both.axes.get('frame.platform')?.status).toBe('flexible');
    expect(both.axes.get('frame.platform')?.selected).toEqual([]);
  });

  it('a binary A answer leans the axis to pole A even against the archetype prior', () => {
    const q: Question = { questionId: 'x', axis: 'exp.tone', module: 'experience', format: 'poles', multi: false, options: [{ key: 'a', pole: 'light', label: 'Lighthearted' }, { key: 'b', pole: 'grim', label: 'Grim' }] };
    const s = foldSession(k, [start, answer(q, 'a')]);
    expect(s.axes.get('exp.tone')?.lean).toBe('A');
    const s2 = foldSession(k, [start, answer(q, 'b')]);
    expect(s2.axes.get('exp.tone')?.lean).toBe('B');
  });
});

describe('selection', () => {
  it('EIG is highest for a uniform axis and near zero for a certain one', () => {
    expect(eigBinary([0.2, 0.2, 0.2, 0.2, 0.2])).toBeGreaterThan(eigBinary([0.9, 0.05, 0.03, 0.01, 0.01]));
    expect(eigBinary([1, 0, 0, 0, 0])).toBeCloseTo(0, 6);
  });

  it('asks tier 0 and gate axes first', () => {
    const qs = nextQuestions(k, foldSession(k, [start]), { count: 4, deterministic: true });
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      // The systems checklist asks several presence gates at once.
      const ids = q.axis === SYSTEMS_CHECKLIST ? q.options.map((o) => o.pole) : [q.axis];
      for (const id of ids) {
        const a = k.axisById.get(id)!;
        expect(a.tier === 0 || a.kind === 'gate' || (a.sets?.length ?? 0) > 0).toBe(true);
      }
    }
  });

  it('returns questions from different modules', () => {
    const qs = nextQuestions(k, foldSession(k, [start]), { count: 4, deterministic: true });
    expect(new Set(qs.map((q) => q.module)).size).toBe(qs.length);
  });

  it('is reproducible for a seed and varies across seeds', () => {
    const a = nextQuestions(k, foldSession(k, [start]), { count: 3 }).map((q) => q.questionId + q.axis + (q.comparisonId ?? ''));
    const b = nextQuestions(k, foldSession(k, [start]), { count: 3 }).map((q) => q.questionId + q.axis + (q.comparisonId ?? ''));
    expect(a).toEqual(b);
    const seeds = new Set<string>();
    for (let seed = 1; seed < 15; seed++) {
      seeds.add(nextQuestions(k, foldSession(k, [{ ...start, seed } as SessionEvent]), { count: 2 }).map((q) => q.axis).join());
    }
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('renders AskUserQuestion objects within limits', () => {
    const qs = nextQuestions(k, foldSession(k, [start]), { count: 4, deterministic: true });
    for (const q of qs) {
      expect(q.askUserQuestion.header.length).toBeLessThanOrEqual(12);
      expect(q.askUserQuestion.options.length).toBeGreaterThanOrEqual(2);
      expect(q.askUserQuestion.options.length).toBeLessThanOrEqual(4);
      for (const o of q.askUserQuestion.options) expect(q.answerMap[o.label]).toBeDefined();
      if (q.askUserQuestion.multiSelect) expect(q.askUserQuestion.options.every((o) => !o.preview)).toBe(true);
    }
  });

  describe('"Not sure / don\'t know these games"', () => {
    const s0 = foldSession(k, [start]);
    const binaryPair = () => {
      const c = candidates(k, s0).find((x) => x.format === 'comparison' && isBinary(x.axis.axis) && x.options.length === 2);
      if (!c) throw new Error('no two-game binary comparison candidate');
      return render(c, 's1:q1');
    };

    it('is offered on game questions; Blend moves to moreOptions on a two-game binary question', () => {
      const q = binaryPair();
      expect(q.askUserQuestion.options.map((o) => q.answerMap[o.label])).toEqual(['a', 'b', 'unsure', 'na']);
      expect(q.moreOptions?.map((o) => q.answerMap[o.label])).toEqual(['blend']);
      for (const qq of nextQuestions(k, s0, { count: 4, deterministic: true })) {
        const games = !qq.multi && qq.options.some((o) => o.game);
        expect(Object.values(qq.answerMap).includes('unsure')).toBe(games);
      }
    });

    it('keeps Blend and Not in my game on plain-word binary questions', () => {
      const c = candidates(k, s0).find((x) => x.format === 'poles' && isBinary(x.axis.axis));
      if (!c) throw new Error('no plain-word binary candidate');
      const q = render(c, 's1:q1');
      expect(q.askUserQuestion.options.slice(2).map((o) => q.answerMap[o.label])).toEqual(['blend', 'na']);
      expect(q.moreOptions).toBeUndefined();
    });

    it('records no evidence, remembers the games, and re-asks the axis later in plain words', () => {
      const q = binaryPair();
      const s1 = foldSession(k, [start, answer(q, 'unsure')]);
      const st = s1.axes.get(q.axis)!;
      expect(st.status).toBe('open');
      expect(st.evidenceCount).toBe(0);
      expect(st.unsureCount).toBe(1);
      expect(s1.unknownGames).toEqual(q.options.map((o) => o.game));
      expect(s1.log.at(-1)?.answer).toBe('not sure');
      // Cooling down right after the answer ...
      expect(candidates(k, s1).some((c) => c.axis.axis.id === q.axis)).toBe(false);
      // ... and back without games once a couple of other answers went by.
      let events: SessionEvent[] = [start, answer(q, 'unsure')];
      for (let i = 0; i < ENGINE.unsureCooldown; i++) {
        const other = nextQuestions(k, foldSession(k, events), { deterministic: true, issued: i + 1, exclude: new Set([q.axis]) })[0]!;
        events = [...events, answer(other, 'skip')];
      }
      const back = candidates(k, foldSession(k, events)).filter((c) => c.axis.axis.id === q.axis);
      expect(back.length).toBeGreaterThan(0);
      expect(back.every((c) => c.format === 'poles' && c.options.every((o) => !o.game))).toBe(true);
    });

    it('scores comparisons with games the user does not know lower', () => {
      const c = candidates(k, s0).find((x) => x.format === 'comparison')!;
      const game = c.options[0]!.game!;
      const after = candidates(k, { ...s0, unknownGames: [game] }).find((x) => x.comparison?.id === c.comparison?.id)!;
      expect(c.score - after.score).toBeCloseTo(ENGINE.unknownGamePenalty, 9);
    });

  });

  it('never asks combat axes after combat is ruled out', () => {
    let events: SessionEvent[] = [start, { type: 'set', at, axis: 'combat.presence', value: 'none', confidence: 1, source: 'user_statement' }];
    for (let i = 0; i < 40; i++) {
      const s = foldSession(k, events);
      const qs = nextQuestions(k, s, { count: 1, deterministic: true, issued: i });
      if (!qs.length) break;
      const q = qs[0]!;
      for (const id of q.axis === SYSTEMS_CHECKLIST ? q.options.map((o) => o.pole) : [q.axis]) {
        const a = k.axisById.get(id)!;
        expect(a.module === 'combat' && a.id !== 'stealth.presence' && !a.id.startsWith('stealth.')).toBe(false);
      }
      events = [...events, answer(q, q.multi ? 'a' : 'a', q.multi ? { selected: [q.options[0]!.key] } : {})];
    }
  });
});

describe('shorter interviews', () => {
  const presence = k.axes.filter((a) => isPresenceGate(a));
  const setAll = (ids: string[], value: string | number): SessionEvent[] => ids.map((axis) => ({ type: 'set', at, axis, value, confidence: 1, source: 'user_statement' }));
  const checklistAt = (events: SessionEvent[]) => {
    for (let i = 0; i < 8; i++) {
      const q = nextQuestions(k, foldSession(k, events), { count: 4, deterministic: true, issued: i }).find((x) => x.axis === SYSTEMS_CHECKLIST);
      if (q) return q;
    }
    throw new Error('no systems checklist offered');
  };

  it('asks several presence gates in one checklist and never repeats them in the same round', () => {
    const qs = nextQuestions(k, foldSession(k, [start]), { count: 4, deterministic: true });
    const q = checklistAt([start]);
    expect(q.multi).toBe(true);
    expect(q.options.length).toBeGreaterThanOrEqual(2);
    expect(q.options.length).toBeLessThanOrEqual(4);
    for (const o of q.options) expect(isPresenceGate(k.axisById.get(o.pole)!)).toBe(true);
    const covered = qs.flatMap((x) => (x.axis === SYSTEMS_CHECKLIST ? x.options.map((o) => o.pole) : [x.axis]));
    expect(new Set(covered).size).toBe(covered.length);
    expect(q.answerMap['None of these']).toBe('neither');
  });

  it('checked systems turn their module on, unchecked ones off; no preference records nothing', () => {
    const q = checklistAt([start]);
    const [first, ...rest] = q.options;
    const s = foldSession(k, [start, answer(q, 'neither', { selected: [first!.key] })]);
    const gate = (id: string) => s.axes.get(id)!;
    expect(gate(first!.pole).status).toBe('decided');
    expect(gate(first!.pole).lean).not.toBe('A');
    for (const o of rest) expect(gate(o.pole).lean).toBe('A');
    const none = foldSession(k, [start, answer(q, 'no_pref')]);
    for (const o of q.options) {
      expect(none.axes.get(o.pole)!.status).toBe('open');
      expect(none.axes.get(o.pole)!.evidenceCount).toBe(0);
    }
  });

  it('sets an axis aside after "not sure" twice: not asked again and not blocking the stop', () => {
    const q = candidates(k, foldSession(k, [start])).find((c) => c.format === 'comparison' && isBinary(c.axis.axis) && c.axis.axis.importance === 3)!;
    const rq = render(q, 's1:q1');
    const s = foldSession(k, [start, answer(rq, 'unsure'), answer({ ...rq, questionId: 's1:q2', format: 'poles' }, 'unsure')]);
    const st = s.axes.get(rq.axis)!;
    expect(st.deferred).toBe(true);
    expect(st.importanceMult).toBeLessThan(1);
    expect(candidates(k, s).some((c) => c.axis.axis.id === rq.axis)).toBe(false);
  });

  it('does not count a deferred gate-like axis as an open gate in the stop rule', () => {
    const gatesOpen = (st: ReturnType<typeof foldSession>) => {
      const r = claritySummary(k, st).stop.reasons.find((x) => x.endsWith('gates open'));
      return r ? Number.parseInt(r, 10) : 0;
    };
    const s0 = foldSession(k, [start]);
    const q = candidates(k, s0).find((c) => c.axis.axis.id === 'ctl.embodiment' && c.format === 'comparison')!;
    expect(q).toBeDefined();
    const rq = render(q, 's1:q1');
    const s = foldSession(k, [start, answer(rq, 'unsure'), answer({ ...rq, questionId: 's1:q2', format: 'poles' }, 'unsure')]);
    expect(s.axes.get('ctl.embodiment')!.deferred).toBe(true);
    expect(gatesOpen(s)).toBe(gatesOpen(s0) - 1);
  });

  it('fills a round with frame questions when only the frame is left among priority axes', () => {
    const events: SessionEvent[] = [start, ...setAll(presence.map((a) => a.id), 'core'), ...setAll(['ctl.embodiment'], 'avatar')];
    const qs = nextQuestions(k, foldSession(k, events), { count: 4, deterministic: true });
    expect(qs.length).toBe(4);
    expect(qs.filter((q) => q.phase === 0).length).toBeGreaterThan(1);
  });

  it('tags each question with its phase; only refinement answers count as detail', () => {
    const qs = nextQuestions(k, foldSession(k, [start]), { count: 4, deterministic: true });
    for (const q of qs) expect(q.phase).toBe(0);
    const detail = candidates(k, foldSession(k, [start])).find((c) => !isCoreAxis(c.axis.axis) && c.axis.axis.kind === 'bipolar')!;
    const s = foldSession(k, [start, answer(render(detail, 's1:q1', 2), 'a'), answer(qs[0]!, qs[0]!.multi ? 'neither' : 'a')]);
    expect(s.detailCount).toBe(1);
  });

  it('recommends stopping at the recommended length once frame and gates are settled, naming open core questions', () => {
    // Walk an ideal persona until only core axes are missing, then pretend the session is long.
    let found: ReturnType<typeof foldSession> | undefined;
    for (let n = 4; n <= 40 && !found; n += 2) {
      const r = runPersona(k, PERSONAS[1]!, { maxQuestions: n });
      const reasons = claritySummary(k, r.state).stop.reasons;
      if (reasons.length && reasons.every((x) => x.includes('core axes') || x.includes('detail questions'))) found = r.state;
    }
    expect(found).toBeDefined();
    const sum = claritySummary(k, { ...found!, questionCount: ENGINE.softQuestions });
    expect(sum.stop.recommended).toBe(true);
    expect(sum.stop.reasons.join()).toMatch(/recommended length/);
    expect(sum.coreReady).toBe(false);
    const early = claritySummary(k, { ...found!, questionCount: ENGINE.softQuestions - 1 });
    expect(early.stop.recommended).toBe(false);
  });
});
