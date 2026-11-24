import { ENGINE } from './config';
import { BINS, type Lean } from './ontology';

export type Dist = number[];
export type PoleDist = Record<string, number>;

export function normalize(v: number[]): number[] {
  const s = v.reduce((a, b) => a + b, 0);
  return s > 0 ? v.map((x) => x / s) : v.map(() => 1 / v.length);
}

export function normalizeRecord(r: PoleDist): PoleDist {
  const s = Object.values(r).reduce((a, b) => a + b, 0);
  const n = Object.keys(r).length;
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, s > 0 ? v / s : 1 / n]));
}

/** Shannon entropy in nats. */
export function entropy(p: number[]): number {
  let h = 0;
  for (const x of p) if (x > 0) h -= x * Math.log(x);
  return h;
}

export function binaryEntropy(p: number): number {
  return entropy([p, 1 - p]);
}

export function uniform(n: number): number[] {
  return Array.from({ length: n }, () => 1 / n);
}

export function likForAnswer(answer: 'A' | 'B' | 'blend'): number[] {
  if (answer === 'A') return [...ENGINE.likA];
  if (answer === 'B') return [...ENGINE.likA].reverse();
  return [...ENGINE.likBlend];
}

/** Explicit lean 0-100: Gaussian over the bins centered at lean/25 - 2. */
export function leanLik(lean: number): number[] {
  const c = Math.max(0, Math.min(100, lean)) / 25 - 2;
  const s = ENGINE.leanSigma;
  return BINS.map((b) => Math.exp(-((b - c) ** 2) / (2 * s * s)));
}

/** A value stated by the user with some confidence (versus_set): Gaussian whose width grows as confidence falls. */
export function statedBinLik(bin: number, confidence: number): number[] {
  const s = 0.35 + (1 - Math.max(0, Math.min(1, confidence))) * 1.5;
  return BINS.map((b) => Math.exp(-((b - bin) ** 2) / (2 * s * s)));
}

export function smoothOneHot(bin: number, smoothing: number): number[] {
  const i = bin + 2;
  const v = [0, 0, 0, 0, 0];
  v[i] = 1 - smoothing;
  const left = i - 1 >= 0;
  const right = i + 1 <= 4;
  if (left && right) {
    v[i - 1] = smoothing / 2;
    v[i + 1] = smoothing / 2;
  } else if (left) v[i - 1] = smoothing;
  else if (right) v[i + 1] = smoothing;
  return v;
}

export function binPosterior(prior: number[], liks: number[][]): number[] {
  let p = [...prior];
  for (const l of liks) p = p.map((x, i) => x * (l[i] ?? 1));
  return normalize(p);
}

export function catPosterior(prior: PoleDist, liks: PoleDist[]): PoleDist {
  const p: PoleDist = { ...prior };
  for (const l of liks) for (const k of Object.keys(p)) p[k] = (p[k] ?? 0) * (l[k] ?? 1);
  return normalizeRecord(p);
}

/** Per-pole inclusion probabilities updated by noisy selected or not-selected observations. */
export function multiPosterior(prior: PoleDist, obs: { pole: string; selected: boolean }[], accuracy = 0.9): PoleDist {
  const p: PoleDist = { ...prior };
  for (const o of obs) {
    const q = p[o.pole] ?? 0.5;
    const yes = q * (o.selected ? accuracy : 1 - accuracy);
    const no = (1 - q) * (o.selected ? 1 - accuracy : accuracy);
    p[o.pole] = yes / (yes + no);
  }
  return p;
}

export function binMean(p: number[]): number {
  return p.reduce((s, x, i) => s + x * ((BINS[i] as number) ?? 0), 0);
}

export function leanOf(p: number[]): Lean {
  const m = binMean(p);
  if (m <= -ENGINE.leanThreshold) return 'A';
  if (m >= ENGINE.leanThreshold) return 'B';
  return 'center';
}

/** Lean 0-100 (0 = pole A strong, 100 = pole B strong) for display. */
export function leanPercent(p: number[]): number {
  return Math.round(((binMean(p) + 2) / 4) * 100);
}

export function argmax(r: PoleDist): string | undefined {
  let best: string | undefined;
  let bv = -Infinity;
  for (const [k, v] of Object.entries(r)) if (v > bv) [best, bv] = [k, v];
  return best;
}
