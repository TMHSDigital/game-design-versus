import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { knowledge } from '../../src/engine/data';
import { loadSession, saveSession, listSessions, migrate, sessionsDir, gdvHome } from '../../src/store/fs-store';
import * as svc from '../../src/service';
import { buildBrief, renderBriefMarkdown } from '../../src/engine/brief';
import { foldSession, type SessionEvent } from '../../src/engine/session';
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
