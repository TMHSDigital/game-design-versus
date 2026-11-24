import { describe, expect, it } from 'vitest';
import { knowledge } from '../../src/engine/data';
import { PERSONAS, runPersona } from '../../src/engine/simulate';

const k = knowledge();

describe('persona simulation', () => {
  for (const p of PERSONAS) {
    it(`${p.label}: clarity >= 0.80 within 45 questions, no irrelevant modules, archetype in top 3`, () => {
      const r = runPersona(k, p, { maxQuestions: 45 });
      expect(r.clarity).toBeGreaterThanOrEqual(0.8);
      expect(r.questions).toBeLessThanOrEqual(45);
      expect(r.irrelevantAsked).toEqual([]);
      expect(r.matchRank).toBeGreaterThanOrEqual(1);
      expect(r.matchRank).toBeLessThanOrEqual(3);
    });
  }

  it('is deterministic for a seed', () => {
    const p = PERSONAS[0]!;
    const a = runPersona(k, p, { seed: 99 }).trace;
    const b = runPersona(k, p, { seed: 99 }).trace;
    expect(a).toEqual(b);
  });
});
