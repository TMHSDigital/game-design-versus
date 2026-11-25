import { describe, expect, it } from 'vitest';
import { knowledge } from '../../src/engine/data';
import { PERSONAS, runHybrid, runPersona } from '../../src/engine/simulate';
import { ENGINE } from '../../src/engine/config';

const k = knowledge();

describe('persona simulation', () => {
  for (const p of PERSONAS) {
    it(`${p.label}: brief ready within 36 questions, no irrelevant modules, archetype in top 3`, () => {
      const r = runPersona(k, p, { maxQuestions: 45 });
      expect(r.stopRecommended).toBe(true);
      expect(r.coreReady).toBe(true);
      expect(r.stopReasons).toEqual([]);
      expect(r.clarity).toBeGreaterThanOrEqual(0.75);
      expect(r.questions).toBeLessThanOrEqual(36);
      expect(r.irrelevantAsked).toEqual([]);
      expect(r.matchRank).toBeGreaterThanOrEqual(1);
      expect(r.matchRank).toBeLessThanOrEqual(3);
    });
  }

  // Real users mix genres and answer blend, not sure or no preference. Sessions must end well before the hard cap.
  for (const mix of ['module', 'axis'] as const) {
    it(`hybrid users (${mix} mix) get a ready brief well before ${ENGINE.maxQuestions} questions`, () => {
      const rs = Array.from({ length: 8 }, (_, i) => runHybrid(k, { seed: i + 1, mix }));
      const qs = rs.map((r) => r.questions).sort((a, b) => a - b);
      for (const r of rs) {
        expect(r.stopRecommended).toBe(true);
        expect(r.stopReasons.some((x) => x.startsWith(`reached ${ENGINE.maxQuestions}`))).toBe(false);
        // The recommended length plus at most one unfinished round.
        expect(r.questions).toBeLessThanOrEqual(ENGINE.softQuestions + 4);
      }
      expect(qs[Math.floor(qs.length / 2)]).toBeLessThanOrEqual(46);
      expect(rs.filter((r) => r.coreReady).length).toBeGreaterThanOrEqual(5);
    });
  }

  it('is deterministic for a seed', () => {
    const p = PERSONAS[0]!;
    const a = runPersona(k, p, { seed: 99 }).trace;
    const b = runPersona(k, p, { seed: 99 }).trace;
    expect(a).toEqual(b);
  });
});
