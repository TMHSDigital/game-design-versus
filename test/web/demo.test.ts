import { describe, expect, it } from 'vitest';
import { VersusDemo, demoKnowledge } from '../../src/web/demo';
import type { Choice } from '../../src/engine/session';

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

  it('rejects answers to questions it did not issue', () => {
    const d = new VersusDemo(k, { seed: 1 });
    expect(() => d.answer('nope', 'a')).toThrow(/unknown/);
  });
});
