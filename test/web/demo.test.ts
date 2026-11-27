import { describe, expect, it } from 'vitest';
import { VersusDemo, demoKnowledge } from '../../src/web/demo';
import type { Choice } from '../../src/engine/session';
import { settledDecisions } from '../../src/engine/brief';

const k = demoKnowledge();

function play(d: VersusDemo, rounds: number) {
  for (let i = 0; i < rounds; i++) {
    const [q] = d.next(1);
    if (!q) break;
    if (q.multi) d.answer(q.questionId, 'neither', [q.options[0]!.key]);
    else d.answer(q.questionId, (q.options[0]?.key ?? 'a') as Choice);
  }
}

describe('browser demo adapter', () => {
  it('serves only verified comparisons', () => {
    expect(k.comparisons.every((c) => c.verification.status === 'verified')).toBe(true);
  });

  it('runs an interview in memory and ends in a brief', () => {
    const d = new VersusDemo(k, { title: 'Web Test', pitch: 'A physics sword fighter', seed: 3 });
    const [first] = d.next(1);
    expect(first).toBeDefined();
    expect(first!.options.length).toBeGreaterThanOrEqual(2);
    expect(first!.moduleLabel.length).toBeGreaterThan(0);
    play(d, 20);
    const s = d.summary();
    expect(s.questionCount).toBe(20);
    expect(s.clarity).toBeGreaterThan(0);
    expect(s.archetypes).toHaveLength(3);
    const { markdown } = d.brief();
    expect(markdown).toContain('# Web Test');
    expect(markdown).toContain('Design pillars');
  });

  it('plays to a ready brief, labels the systems checklist and reports core progress', () => {
    const d = new VersusDemo(k, { title: 'Hybrid', seed: 5 });
    let sawChecklist = false;
    for (let i = 0; i < 60 && !d.summary().stopRecommended; i++) {
      const [q] = d.next(1);
      if (!q) break;
      if (q.axis === 'systems.checklist') {
        sawChecklist = true;
        expect(q.axisLabel).toBe('Systems');
        expect(q.multi).toBe(true);
      }
      if (q.multi) d.answer(q.questionId, 'neither', [q.options[0]!.key]);
      else d.answer(q.questionId, (i % 5 === 0 && q.comparison ? 'unsure' : (q.options[0]?.key ?? 'a')) as Choice);
    }
    const s = d.summary();
    expect(sawChecklist).toBe(true);
    expect(s.stopRecommended).toBe(true);
    expect(s.questionCount).toBeLessThan(52);
    expect(s.core.total).toBeGreaterThan(0);
    expect(s.core.settled).toBeLessThanOrEqual(s.core.total);
    expect(d.brief().markdown).toContain('## 11. Open questions');
  });

  it('reports skipped modules when a gate is answered "not in my game"', () => {
    const d = new VersusDemo(k, { seed: 11 });
    let skipped: string[] = [];
    for (let i = 0; i < 40 && skipped.length === 0; i++) {
      const [q] = d.next(1);
      if (!q) break;
      const r = q.binary ? d.answer(q.questionId, 'na') : d.answer(q.questionId, q.multi ? 'neither' : 'a', q.multi ? [q.options[0]!.key] : undefined);
      skipped = r.skippedModules;
    }
    expect(skipped.length).toBeGreaterThan(0);
  });

  it('gives binary questions a 5-bin belief and supports undo', () => {
    const d = new VersusDemo(k, { seed: 5 });
    let found = false;
    for (let i = 0; i < 30 && !found; i++) {
      const [q] = d.next(1);
      if (!q) break;
      if (q.binary) {
        expect(q.bins).toHaveLength(5);
        found = true;
      }
      d.answer(q.questionId, q.multi ? 'neither' : 'a', q.multi ? [q.options[0]!.key] : undefined);
    }
    expect(found).toBe(true);
    const n = d.summary().questionCount;
    expect(d.undo()).toBe(true);
    expect(d.summary().questionCount).toBe(n - 1);
  });

  it('lists settled decisions like the server, without undecided entries', () => {
    const d = new VersusDemo(k, { seed: 7 });
    play(d, 15);
    const settled = d.summary().settled;
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.length).toBeLessThanOrEqual(8);
    expect(settled.every((x) => !x.endsWith(': Undecided'))).toBe(true);
    expect(settled).toEqual(settledDecisions(d.state, 8));
  });

  it('can undo a lone skip, and only once', () => {
    const d = new VersusDemo(k, { seed: 3 });
    expect(d.undo()).toBe(false);
    const [q] = d.next(1);
    d.answer(q!.questionId, 'skip');
    expect(d.summary().canUndo).toBe(true);
    expect(d.undo()).toBe(true);
    expect(d.summary().canUndo).toBe(false);
    expect(d.undo()).toBe(false);
  });

  it('restores a saved snapshot to the same summary and keeps going', () => {
    const d = new VersusDemo(k, { title: 'Saved', seed: 9 });
    play(d, 8);
    d.undo();
    const snap = JSON.parse(JSON.stringify(d.snapshot()));
    const r = VersusDemo.restore(k, snap);
    expect(r.id).toBe(d.id);
    expect(r.title).toBe('Saved');
    expect(r.summary()).toEqual(d.summary());
    const [a] = d.next(1);
    const [b] = r.next(1);
    expect(b?.questionId).toBe(a?.questionId);
    expect(b?.axis).toBe(a?.axis);
    expect(() => VersusDemo.restore(k, { events: [], issued: 0 })).toThrow(/not a saved demo session/);
  });

  it('rejects answers to questions it did not issue', () => {
    const d = new VersusDemo(k, { seed: 1 });
    expect(() => d.answer('nope', 'a')).toThrow(/unknown/);
  });
});
