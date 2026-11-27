import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { knowledge } from '../../src/engine/data';
import { loadSession, saveSession, listSessions, migrate, sessionsDir, gdvHome } from '../../src/store/fs-store';
import * as svc from '../../src/service';
import { buildBrief, renderBriefMarkdown, settledDecisions } from '../../src/engine/brief';
import { foldSession, SYSTEMS_CHECKLIST, type SessionEvent } from '../../src/engine/session';
import { PERSONAS, runPersona } from '../../src/engine/simulate';

const k = knowledge();
let home: string;
let prev: string | undefined;

beforeAll(() => {
  prev = process.env.GDV_HOME;
  home = mkdtempSync(join(tmpdir(), 'gdv-store-'));
  process.env.GDV_HOME = home;
});
afterAll(() => {
  if (prev === undefined) delete process.env.GDV_HOME;
  else process.env.GDV_HOME = prev;
  rmSync(home, { recursive: true, force: true });
});

describe('fs-store', () => {
  it('uses GDV_HOME and writes atomically', () => {
    expect(gdvHome()).toBe(home);
    const s = svc.startSession(k, { title: 'Persist', seed: 5 });
    const files = readdirSync(sessionsDir());
    expect(files).toContain(`${s.sessionId}.json`);
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
    const f = loadSession(s.sessionId);
    expect(f.schemaVersion).toBe(1);
    expect(f.events[0]?.type).toBe('start');
  });
  it('round-trips the event log and replays identically', () => {
    const s = svc.startSession(k, { seed: 9 });
    const n = svc.next(k, s.sessionId, 2);
    svc.answer(k, s.sessionId, n.questions.map((q) => ({ questionId: q.questionId, choice: q.multi ? 'neither' : 'a', selected: q.multi ? ['a'] : undefined })));
    const f = loadSession(s.sessionId);
    saveSession(f);
    const again = loadSession(s.sessionId);
    expect(JSON.stringify(foldSession(k, again.events).archetypePost)).toBe(JSON.stringify(foldSession(k, f.events).archetypePost));
  });
  it('migrates version 0 files and rejects newer ones', () => {
    const m = migrate({ id: 'gdv-x', events: [], createdAt: '', updatedAt: '' });
    expect(m.schemaVersion).toBe(1);
    expect(m.pending).toEqual({});
    expect(() => migrate({ schemaVersion: 99 })).toThrow();
  });
  it('rejects path traversal ids', () => {
    expect(() => loadSession('../../etc/passwd')).toThrow(/invalid session id/);
  });
  it('lists sessions and skips corrupt files', () => {
    mkdirSync(sessionsDir(), { recursive: true });
    writeFileSync(join(sessionsDir(), 'gdv-corrupt.json'), '{not json');
    expect(listSessions().length).toBeGreaterThanOrEqual(2);
  });
});

describe('brief', () => {
  const at = '2026-11-23T00:00:00.000Z';
  it('produces all sections and identical JSON for a persona session', () => {
    const r = runPersona(k, PERSONAS[0]!);
    const b = buildBrief(k, r.state);
    expect(b.pitch).toMatch(/in order to/);
    expect(b.pillars.length).toBeGreaterThanOrEqual(3);
    expect(b.pillars.length).toBeLessThanOrEqual(5);
    expect(b.usps.length).toBeLessThanOrEqual(3);
    expect(b.comparables.titles.length).toBeGreaterThan(0);
    const md = renderBriefMarkdown(b);
    for (const h of ['Frame', 'Experience targets', 'Genre', 'Design pillars', 'Core loop', 'Systems spec', 'Comparable titles', 'USPs and non-goals', 'Scope', 'Risks', 'Open questions', 'Decision log']) {
      expect(md).toContain(h);
    }
    expect(md.includes(String.fromCharCode(0x2014))).toBe(false);
    expect(JSON.parse(JSON.stringify(b))).toEqual(b);
  });

  it('matches the snapshot for a fixed scripted session', () => {
    const events: SessionEvent[] = [
      { type: 'start', at, sessionId: 'gdv-snapshot', seed: 1, title: 'Snapshot Brawler', pitch: 'Physics sword duels' },
      { type: 'set', at, axis: 'genre.family', value: ['action', 'fighting'], confidence: 0.9, source: 'user_statement' },
      { type: 'set', at, axis: 'frame.team', value: 'small', confidence: 1, source: 'user_statement' },
      { type: 'set', at, axis: 'frame.timeline', value: 'years', confidence: 1, source: 'user_statement' },
      { type: 'set', at, axis: 'combat.presence', value: 'core', confidence: 1, source: 'user_statement' },
      { type: 'answer', at, choice: 'a', question: { questionId: 'gdv-snapshot:q1', axis: 'combat.sim', module: 'combat', format: 'comparison', multi: false, comparisonId: 'cmp.combat.sim.test', options: [{ key: 'a', pole: 'physics', label: 'Half Sword', game: 'Half Sword', how: 'Physics swings' }, { key: 'b', pole: 'animated', label: 'Skyrim', game: 'Skyrim', how: 'Animation swings' }] } },
      { type: 'set', at, axis: 'exp.tone', value: 2, confidence: 0.9, source: 'user_statement' },
    ];
    const b = buildBrief(k, foldSession(k, events));
    const stable = { ...b, genre: { ...b.genre, archetypes: b.genre.archetypes.map((a) => a.label) }, systems: b.systems.map((s) => s.module), openQuestions: b.openQuestions.length > 0 };
    expect(stable).toMatchSnapshot();
  });
});

describe('settled decisions', () => {
  it('the service summary uses the shared settled list', () => {
    const s = svc.startSession(k, { title: 'Settled', seed: 61 });
    svc.setFact(k, s.sessionId, { axis: 'combat.sim', value: 'physics', confidence: 0.9 });
    svc.setFact(k, s.sessionId, { axis: 'genre.family', value: ['action'], confidence: 0.9 });
    const sum = svc.status(k, s.sessionId);
    expect(sum.settled.length).toBeGreaterThan(0);
    expect(sum.settled).toEqual(settledDecisions(foldSession(k, loadSession(s.sessionId).events), 12));
  });
});

describe('service validation', () => {
  it('versus_set rejects a value that does not fit, with or without prior evidence', () => {
    const s = svc.startSession(k, { title: 'Set', seed: 11 });
    svc.setFact(k, s.sessionId, { axis: 'combat.sim', value: 'physics', confidence: 0.9 });
    const before = loadSession(s.sessionId).events.length;
    expect(() => svc.setFact(k, s.sessionId, { axis: 'combat.sim', value: 'banana', confidence: 0.9 })).toThrow(/does not fit/);
    expect(() => svc.setFact(k, s.sessionId, { axis: 'genre.family', value: ['action', 'banana'], confidence: 0.9 })).toThrow(/does not fit/);
    expect(() => svc.setFact(k, s.sessionId, { axis: 'genre.family', value: 'banana', confidence: 0.9 })).toThrow(/does not fit/);
    expect(loadSession(s.sessionId).events.length).toBe(before);
  });
});

describe('answer validation', () => {
  it('rejects blend on the systems checklist, records a selection, and reports core progress', () => {
    const s = svc.startSession(k, { title: 'Checklist', seed: 3 });
    let q = svc.next(k, s.sessionId, 4).questions.find((x) => x.axis === SYSTEMS_CHECKLIST);
    for (let i = 0; i < 10 && !q; i++) q = svc.next(k, s.sessionId, 4).questions.find((x) => x.axis === SYSTEMS_CHECKLIST);
    if (!q) throw new Error('no checklist offered');
    const bad = svc.answer(k, s.sessionId, [{ questionId: q.questionId, choice: 'blend' }]);
    expect(bad.errors[0]).toMatch(/checklist/);
    const r = svc.answer(k, s.sessionId, [{ questionId: q.questionId, choice: 'neither', selected: [q.options[0]!.key] }]);
    expect(r.recorded).toBe(1);
    expect(r.core.total).toBeGreaterThan(0);
    const sum = svc.status(k, s.sessionId);
    expect(sum.core.settled).toBeLessThanOrEqual(sum.core.total);
    expect(typeof sum.coreReady).toBe('boolean');
  });

  it('rejects selected entries that match no option, and selected on a single-select question', () => {
    const s = svc.startSession(k, { title: 'Typos', seed: 3 });
    let q = svc.next(k, s.sessionId, 4).questions.find((x) => x.axis === SYSTEMS_CHECKLIST);
    for (let i = 0; i < 10 && !q; i++) q = svc.next(k, s.sessionId, 4).questions.find((x) => x.axis === SYSTEMS_CHECKLIST);
    if (!q) throw new Error('no checklist offered');
    const count = svc.status(k, s.sessionId).questionCount;
    const bad = svc.answer(k, s.sessionId, [{ questionId: q.questionId, choice: 'neither', selected: [q.options[0]!.key, 'nonexistent'] }]);
    expect(bad.recorded).toBe(0);
    expect(bad.errors[0]).toMatch(/nonexistent matches no option/);
    expect(svc.status(k, s.sessionId).questionCount).toBe(count);
    expect(loadSession(s.sessionId).pending[q.questionId]).toBeDefined();

    const asked = svc.ask(k, s.sessionId, { axis: 'combat.sim', options: [{ game: 'Half Sword', how: 'Physical' }, { game: 'Skyrim', how: 'Animated' }] });
    const single = svc.answer(k, s.sessionId, [{ questionId: asked.questionId, choice: 'neither', selected: ['a'] }]);
    expect(single.recorded).toBe(0);
    expect(single.errors[0]).toMatch(/only applies to multi-select/);
  });

  it('records "not sure" on a game question as no answer and avoids those games next', () => {
    const s = svc.startSession(k, { title: 'Unsure', seed: 8 });
    let q = svc.next(k, s.sessionId, 1).questions[0];
    for (let i = 0; i < 60 && q && !q.options.some((o) => o.game); i++) {
      svc.answer(k, s.sessionId, [{ questionId: q.questionId, choice: 'skip' }]);
      q = svc.next(k, s.sessionId, 1).questions[0];
    }
    if (!q) throw new Error('no game question reached');
    const label = Object.keys(q.answerMap).find((l) => q!.answerMap[l] === 'unsure')!;
    expect(q.askUserQuestion.options.some((o) => o.label === label)).toBe(true);
    const r = svc.answer(k, s.sessionId, [{ questionId: q.questionId, choice: 'unsure' }]);
    expect(r.recorded).toBe(1);
    expect(r.overallClarity.after).toBe(r.overallClarity.before);
    const st = foldSession(k, loadSession(s.sessionId).events);
    expect(st.axes.get(q.axis)?.status).toBe('open');
    expect(st.unknownGames.length).toBeGreaterThan(0);
  });

  function pendingOn(kind: 'categorical' | 'multi') {
    const s = svc.startSession(k, { title: kind, seed: 21 });
    for (let i = 0; i < 60; i++) {
      const q = svc.next(k, s.sessionId, 1).questions[0];
      if (!q) break;
      const a = k.axisById.get(q.axis);
      if (a?.kind === kind && !q.customAxis) return { sessionId: s.sessionId, q };
      svc.answer(k, s.sessionId, [{ questionId: q.questionId, choice: 'skip' }]);
    }
    throw new Error(`no ${kind} question reached`);
  }
  for (const kind of ['categorical', 'multi'] as const) {
    it(`rejects blend and lean on a ${kind} question and keeps it pending`, () => {
      const { sessionId, q } = pendingOn(kind);
      const count = svc.status(k, sessionId).questionCount;
      const r1 = svc.answer(k, sessionId, [{ questionId: q.questionId, choice: 'blend' }]);
      expect(r1.recorded).toBe(0);
      expect(r1.errors[0]).toMatch(/only applies to two-pole axes/);
      const r2 = svc.answer(k, sessionId, [{ questionId: q.questionId, choice: 'a', lean: 30 }]);
      expect(r2.recorded).toBe(0);
      expect(svc.status(k, sessionId).questionCount).toBe(count);
      expect(loadSession(sessionId).pending[q.questionId]).toBeDefined();
    });
  }
});

describe('custom axes in the brief', () => {
  const customRow = (choice: 'no_pref' | 'neither' | 'blend' | 'a', note?: string) => {
    const s = svc.startSession(k, { title: `Custom ${choice}`, seed: 31 });
    const asked = svc.ask(k, s.sessionId, {
      customAxis: { id: 'custom.grip', label: 'Grip', poleA: 'Loose', poleB: 'Tight' },
      options: [{ game: 'G1', how: 'h1' }, { game: 'G2', how: 'h2' }],
    });
    svc.answer(k, s.sessionId, [{ questionId: asked.questionId, choice, note }]);
    return svc.brief(k, s.sessionId, 'json').brief.systems.find((m) => m.module === 'custom')?.items[0]?.position;
  };
  it('shows no preference as flexible, not as a blend', () => {
    expect(customRow('no_pref')).toBe('Flexible (no strong preference)');
  });
  it('shows the note for an Other answer', () => {
    expect(customRow('neither', 'depends on the weapon')).toBe('Other: depends on the weapon');
  });
  it('still shows a real blend and a pole pick', () => {
    expect(customRow('blend')).toBe('Blend of Loose and Tight');
    expect(customRow('a')).toBe('Loose');
  });

  it('maps poleA and poleB text on a custom axis and rejects any other pole', () => {
    const s = svc.startSession(k, { title: 'Grit', seed: 32 });
    const longHow = 'G'.repeat(180);
    const asked = svc.ask(k, s.sessionId, {
      customAxis: { id: 'custom.grit', label: 'Tone', poleA: 'Gritty', poleB: 'Whimsical' },
      options: [
        { game: 'Dark Souls', how: longHow, pole: 'Gritty' },
        { game: 'Kirby', how: 'Light and playful', pole: 'Whimsical' },
      ],
    });
    expect(asked.question.options.map((o) => o.pole)).toEqual(['A', 'B']);
    expect(asked.question.options[0]?.how).toHaveLength(160);
    svc.answer(k, s.sessionId, [{ questionId: asked.questionId, choice: 'a' }]);
    const item = svc.brief(k, s.sessionId, 'json').brief.systems.find((m) => m.module === 'custom')?.items[0];
    expect(item?.position).toBe('Gritty');
    expect(item?.reference).toBe('like Dark Souls');
    expect(() => svc.ask(k, s.sessionId, {
      customAxis: { id: 'custom.other', label: 'Tone', poleA: 'Gritty', poleB: 'Whimsical' },
      options: [
        { game: 'Dark Souls', how: 'Punishing', pole: 'Bleak' },
        { game: 'Kirby', how: 'Playful', pole: 'B' },
      ],
    })).toThrow(/unknown pole Bleak for custom.other/);
  });
});

describe('pending questions', () => {
  it('keeps a versus_ask question answerable after versus_next', () => {
    const s = svc.startSession(k, { title: 'Ask then next', seed: 41 });
    const asked = svc.ask(k, s.sessionId, {
      axis: 'combat.sim',
      options: [
        { game: 'Half Sword', how: 'Physical weapons' },
        { game: 'Skyrim', how: 'Animated swings' },
      ],
    });
    const n = svc.next(k, s.sessionId, 3);
    const r = svc.answer(k, s.sessionId, [
      { questionId: asked.questionId, choice: 'a' },
      { questionId: n.questions[0]!.questionId, choice: n.questions[0]!.multi ? 'neither' : 'a', selected: n.questions[0]!.multi ? [] : undefined },
    ]);
    expect(r.errors).toEqual([]);
    expect(r.recorded).toBe(2);
  });
});

describe('undo', () => {
  it('reports nothing to undo once every answer is undone', () => {
    const s = svc.startSession(k, { title: 'Undo', seed: 51 });
    const q = svc.next(k, s.sessionId, 1).questions[0]!;
    svc.answer(k, s.sessionId, [{ questionId: q.questionId, choice: 'a' }]);
    svc.undo(k, s.sessionId);
    const before = loadSession(s.sessionId).events.length;
    expect(() => svc.undo(k, s.sessionId)).toThrow(/nothing to undo/);
    expect(loadSession(s.sessionId).events.length).toBe(before);
  });

  it('undoes a whole round with round: true, and several events with steps', () => {
    const s = svc.startSession(k, { title: 'Undo round', seed: 52 });
    const pick = (q: { questionId: string; multi: boolean }) => ({ questionId: q.questionId, choice: (q.multi ? 'neither' : 'a') as 'neither' | 'a', selected: q.multi ? [] : undefined });
    const r1 = svc.next(k, s.sessionId, 2).questions;
    svc.answer(k, s.sessionId, r1.map(pick));
    const afterFirst = svc.status(k, s.sessionId).questionCount;
    const r2 = svc.next(k, s.sessionId, 3).questions;
    expect(r2.length).toBe(3);
    svc.answer(k, s.sessionId, r2.map(pick));
    const u = svc.undo(k, s.sessionId, { round: true });
    expect(u.undone).toBe(3);
    expect(u.questionCount).toBe(afterFirst);
    const u2 = svc.undo(k, s.sessionId, { steps: 10 });
    expect(u2.undone).toBe(r1.length);
    expect(u2.questionCount).toBe(0);
  });
});

describe('brief tables', () => {
  it('keeps a note with a pipe and a line break inside one cell', () => {
    const s = svc.startSession(k, { title: 'Pipes', seed: 41 });
    const q = svc.next(k, s.sessionId, 1).questions[0]!;
    svc.answer(k, s.sessionId, [{ questionId: q.questionId, choice: 'neither', note: 'mostly A | some B\nsecond line' }]);
    const md = svc.brief(k, s.sessionId, 'markdown').markdown;
    const rows = md.split('\n').filter((l) => l.includes('mostly A'));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toContain('mostly A \\| some B second line');
      expect(row.split(/(?<!\\)\|/).length).toBe(6);
    }
    expect(md).not.toMatch(/^second line/m);
  });
});

describe('tension replies', () => {
  const mmoOnSoloTeam = () => {
    const s = svc.startSession(k, { title: 'Tiny MMO', seed: 71 });
    svc.setFact(k, s.sessionId, { axis: 'frame.team', value: 'solo', confidence: 1 });
    svc.setFact(k, s.sessionId, { axis: 'frame.players', value: 'mmo', confidence: 0.8 });
    return s.sessionId;
  };

  it('shows the reply under the risk instead of the probe, and undo takes it back', () => {
    const id = mmoOnSoloTeam();
    const probe = svc.status(k, id).tensions.find((t) => t.id === 'solo_team_mmo')?.probe;
    expect(probe).toBeTruthy();
    expect(svc.brief(k, id, 'markdown').markdown).toContain(`Probe: ${probe}`);

    const r = svc.reply(k, id, { tensionId: 'solo_team_mmo', response: 'A small persistent server, scoped to 50 players.', stance: 'mitigated' });
    expect(r.summary.tensions.find((t) => t.id === 'solo_team_mmo')?.response).toBe('A small persistent server, scoped to 50 players.');
    const b = svc.brief(k, id, 'json').brief;
    const risk = b.risks.find((x) => x.response);
    expect(risk).toMatchObject({ response: 'A small persistent server, scoped to 50 players.', stance: 'mitigated' });
    expect(risk?.probe).toBeUndefined();
    const md = svc.brief(k, id, 'markdown').markdown;
    expect(md).toContain('Response (mitigated): A small persistent server, scoped to 50 players.');
    expect(md).not.toContain(`Probe: ${probe}`);
    expect(b.decisionLog.some((d) => d.kind === 'tension_reply' && d.note === 'A small persistent server, scoped to 50 players.')).toBe(true);

    svc.undo(k, id);
    expect(svc.brief(k, id, 'markdown').markdown).toContain(`Probe: ${probe}`);
  });

  it('keeps a reply in the decision log once its tension stops firing', () => {
    const id = mmoOnSoloTeam();
    svc.reply(k, id, { tensionId: 'solo_team_mmo', response: 'Fine, it becomes a small-session online game.', stance: 'will_change' });
    svc.setFact(k, id, { axis: 'frame.players', value: 'online_coop', confidence: 1 });
    const b = svc.brief(k, id, 'json').brief;
    expect(b.risks.some((x) => x.response)).toBe(false);
    expect(b.decisionLog.some((d) => d.kind === 'tension_reply')).toBe(true);
  });

  it('rejects a reply to a tension that is not active, and an empty reply', () => {
    const id = mmoOnSoloTeam();
    const before = loadSession(id).events.length;
    expect(() => svc.reply(k, id, { tensionId: 'permadeath_long_campaign', response: 'ok' })).toThrow(/not active; active tensions: .*solo_team_mmo/);
    expect(() => svc.reply(k, id, { tensionId: 'solo_team_mmo', response: '  ' })).toThrow(/empty/);
    expect(loadSession(id).events.length).toBe(before);
  });
});

describe('revising an earlier answer', () => {
  const at = '2026-11-23T00:00:00.000Z';
  const physicsAnswer: SessionEvent = { type: 'answer', at, choice: 'a', question: { questionId: 'gdv-rev:q1', axis: 'combat.sim', module: 'combat', format: 'comparison', multi: false, options: [{ key: 'a', pole: 'physics', label: 'Half Sword', game: 'Half Sword', how: 'Physics swings' }, { key: 'b', pole: 'animated', label: 'Skyrim', game: 'Skyrim', how: 'Animation swings' }] } };
  const start: SessionEvent = { type: 'start', at, sessionId: 'gdv-rev', seed: 1 };
  const tone: SessionEvent = { type: 'set', at, axis: 'exp.tone', value: 2, confidence: 0.9, source: 'user_statement' };

  it('replaces the earlier answer instead of blending with it, and keeps later answers', () => {
    const revised = foldSession(k, [start, physicsAnswer, tone, { type: 'retract', at, axis: 'combat.sim', value: 'animated', confidence: 0.9 }]);
    const fresh = foldSession(k, [start, tone, { type: 'set', at, axis: 'combat.sim', value: 'animated', confidence: 0.9, source: 'user_statement' }]);
    const sim = revised.axes.get('combat.sim')!;
    expect(sim.lean).toBe('B');
    expect(sim.leanPct).toBe(fresh.axes.get('combat.sim')!.leanPct);
    expect(revised.archetypePost).toEqual(fresh.archetypePost);
    expect(revised.axes.get('exp.tone')!.status).toBe('decided');
    expect(revised.questionCount).toBe(1);
    expect(revised.log.find((l) => l.kind === 'answer')?.revised).toBe(true);
    const md = renderBriefMarkdown(buildBrief(k, revised));
    expect(md).toContain('(revised later) Half Sword');
  });

  it('reopens an axis without a value, so it can be asked again', () => {
    const s = foldSession(k, [start, physicsAnswer, { type: 'retract', at, axis: 'combat.sim' }]);
    const sim = s.axes.get('combat.sim')!;
    expect(sim.status).toBe('open');
    expect(sim.evidenceCount).toBe(0);
    expect(sim.ref).toBeUndefined();
  });

  it('reports modules a revised gate skips or unlocks, and undo restores the earlier position', () => {
    const s = svc.startSession(k, { title: 'Revise', seed: 81 });
    svc.setFact(k, s.sessionId, { axis: 'genre.family', value: ['puzzle'], confidence: 1 });
    svc.setFact(k, s.sessionId, { axis: 'combat.sim', value: 'physics', confidence: 1 });
    const g = svc.revise(k, s.sessionId, { axis: 'genre.family', value: ['strategy'], confidence: 1 });
    expect(g.revised).toBe(1);
    expect(g.unlockedModules).toContain('strategy');
    expect(g.skippedModules).toContain('puzzle');

    const r = svc.revise(k, s.sessionId, { axis: 'combat.sim', value: 'animated' });
    expect(r.position).toMatch(/Animat/i);
    svc.undo(k, s.sessionId);
    const st = foldSession(k, loadSession(s.sessionId).events).axes.get('combat.sim')!;
    expect(st.lean).toBe('A');
  });

  it('rejects unknown axes, values that do not fit, and reopening an axis with nothing recorded', () => {
    const s = svc.startSession(k, { title: 'Revise errors', seed: 82 });
    const before = loadSession(s.sessionId).events.length;
    expect(() => svc.revise(k, s.sessionId, { axis: 'combat.banana' })).toThrow(/unknown axis/);
    expect(() => svc.revise(k, s.sessionId, { axis: 'combat.sim', value: 'banana' })).toThrow(/does not fit/);
    expect(() => svc.revise(k, s.sessionId, { axis: 'combat.sim' })).toThrow(/nothing is recorded/);
    expect(loadSession(s.sessionId).events.length).toBe(before);
  });
});
