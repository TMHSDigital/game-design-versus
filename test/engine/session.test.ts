import { describe, expect, it } from 'vitest';
import { knowledge } from '../../src/engine/data';
import { claritySummary, foldSession, type SessionEvent, type Question } from '../../src/engine/session';
import { candidates, eigBinary, nextQuestions } from '../../src/engine/selection';

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
      const a = k.axisById.get(q.axis)!;
      expect(a.tier === 0 || a.kind === 'gate' || (a.sets?.length ?? 0) > 0).toBe(true);
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

  it('never asks combat axes after combat is ruled out', () => {
    let events: SessionEvent[] = [start, { type: 'set', at, axis: 'combat.presence', value: 'none', confidence: 1, source: 'user_statement' }];
    for (let i = 0; i < 40; i++) {
      const s = foldSession(k, events);
      const qs = nextQuestions(k, s, { count: 1, deterministic: true, issued: i });
      if (!qs.length) break;
      const q = qs[0]!;
      const a = k.axisById.get(q.axis)!;
      expect(a.module === 'combat' && a.id !== 'stealth.presence' && !a.id.startsWith('stealth.')).toBe(false);
      events = [...events, answer(q, q.multi ? 'a' : 'a', q.multi ? { selected: [q.options[0]!.key] } : {})];
    }
  });
});
