import { ENGINE } from './config';
import type { AxisStatus } from './gating';
import { binaryEntropy, entropy } from './posterior';

/** SPEC: 1 - H(p)/log(n), n = number of outcomes. */
export function entropyClarity(p: number[]): number {
  if (p.length < 2) return 1;
  return Math.max(0, Math.min(1, 1 - entropy(p) / Math.log(p.length)));
}

/** Mean per-pole Bernoulli clarity, for multi and rank axes. */
export function bernoulliClarity(ps: number[]): number {
  if (!ps.length) return 1;
  return ps.reduce((s, p) => s + (1 - binaryEntropy(p) / Math.log(2)), 0) / ps.length;
}

/**
 * Axis clarity. Open axes use entropy clarity of their (archetype-informed) posterior. Decided axes get at
 * least ENGINE.decidedClarityFloor (CALIBRATION). Flexible axes are settled by the user (no preference), so 1.
 */
export function axisClarity(a: { status: AxisStatus; dist?: number[]; bernoulli?: number[] }): number {
  const raw = a.bernoulli ? bernoulliClarity(a.bernoulli) : entropyClarity(a.dist ?? []);
  if (a.status === 'flexible') return 1;
  if (a.status === 'decided') return Math.max(raw, ENGINE.decidedClarityFloor);
  return raw;
}

/** Importance-weighted mean. */
export function weightedClarity(items: { clarity: number; weight: number }[]): number {
  const w = items.reduce((s, x) => s + x.weight, 0);
  if (w <= 0) return 0;
  return items.reduce((s, x) => s + x.clarity * x.weight, 0) / w;
}
