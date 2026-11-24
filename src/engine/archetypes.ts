import { ENGINE } from './config';
import type { Knowledge } from './data';
import type { Archetype, Axis } from './ontology';
import { normalize, smoothOneHot, uniform, type PoleDist } from './posterior';

/** Evidence about one axis, derived from an answer or a stated fact. Shared by axis and archetype updates. */
export type Evidence =
  | { axis: string; kind: 'bin'; lik: number[] }
  | { axis: string; kind: 'cat'; lik: PoleDist }
  | { axis: string; kind: 'multi'; obs: { pole: string; selected: boolean }[] };

export function uniformArchetypes(k: Knowledge): number[] {
  return uniform(k.archetypes.length);
}

/** P(bin | archetype): the smoothed one-hot of its profile value, or undefined when it has no opinion. */
export function profileBinDist(arch: Archetype, axisId: string): number[] | undefined {
  const v = arch.profile[axisId];
  return typeof v === 'number' ? smoothOneHot(v, ENGINE.profileSmoothing) : undefined;
}

export function profileCatDist(arch: Archetype, axis: Axis): PoleDist | undefined {
  const v = arch.profile[axis.id];
  if (typeof v !== 'string') return undefined;
  const n = axis.poles.length;
  const rest = (1 - ENGINE.categoricalProfileMass) / Math.max(1, n - 1);
  return Object.fromEntries(axis.poles.map((p) => [p.id, p.id === v ? ENGINE.categoricalProfileMass : rest]));
}

/** P(pole selected | archetype) for multi and rank axes. */
export function profileMultiProb(arch: Archetype, axisId: string, pole: string): number | undefined {
  const v = arch.profile[axisId];
  if (!Array.isArray(v)) return undefined;
  return v.includes(pole) ? ENGINE.multiProfileMass : 1 - ENGINE.multiProfileMass;
}

/** P(evidence | archetype) = sum over values of P(evidence | value) P(value | archetype). */
export function evidenceLikelihood(k: Knowledge, arch: Archetype, e: Evidence): number {
  if (e.kind === 'bin') {
    const d = profileBinDist(arch, e.axis) ?? uniform(5);
    return d.reduce((s, p, i) => s + p * (e.lik[i] ?? 0), 0);
  }
  const axis = k.axisById.get(e.axis);
  if (e.kind === 'cat') {
    if (!axis) return 1;
    const d = profileCatDist(arch, axis) ?? Object.fromEntries(axis.poles.map((p) => [p.id, 1 / axis.poles.length]));
    return Object.entries(d).reduce((s, [pole, p]) => s + p * (e.lik[pole] ?? 0), 0);
  }
  let l = 1;
  for (const o of e.obs) {
    const q = profileMultiProb(arch, e.axis, o.pole) ?? 0.5;
    l *= o.selected ? q : 1 - q;
  }
  return l;
}

export function updateArchetypes(k: Knowledge, prior: number[], evidence: Evidence[]): number[] {
  let post = [...prior];
  for (const e of evidence) {
    const l = k.archetypes.map((a) => evidenceLikelihood(k, a, e));
    post = normalize(post.map((p, i) => p * (l[i] ?? 1)));
  }
  return post;
}

export function archetypeConfidence(post: number[]): number {
  return Math.max(...post);
}

export function rankArchetypes(k: Knowledge, post: number[]): { id: string; label: string; p: number; exemplars: string[] }[] {
  return k.archetypes
    .map((a, i) => ({ id: a.id, label: a.label, p: post[i] ?? 0, exemplars: a.exemplars }))
    .sort((x, y) => y.p - x.p);
}

/**
 * CALIBRATION: the uniform share of the prior starts at the spec's 0.3 and decays toward
 * ENGINE.uniformFloor as the archetype posterior concentrates.
 */
export function uniformShare(post: number[]): number {
  const n = post.length;
  const conf = archetypeConfidence(post);
  const t = n > 1 ? Math.max(0, (conf - 1 / n) / (1 - 1 / n)) : 1;
  return ENGINE.uniformWeight - (ENGINE.uniformWeight - ENGINE.uniformFloor) * t;
}

/** Prior over the 5 bins of a binary axis: archetype-weighted profile mixed with uniform. */
export function binPrior(k: Knowledge, axisId: string, post: number[]): number[] {
  const u = uniformShare(post);
  const mix = [0, 0, 0, 0, 0];
  k.archetypes.forEach((a, i) => {
    const d = profileBinDist(a, axisId) ?? uniform(5);
    for (let b = 0; b < 5; b++) mix[b] = (mix[b] as number) + (post[i] ?? 0) * (d[b] as number);
  });
  return normalize(mix.map((x) => (1 - u) * x + u / 5));
}

export function catPrior(k: Knowledge, axis: Axis, post: number[]): PoleDist {
  const u = uniformShare(post);
  const n = axis.poles.length;
  const mix: PoleDist = Object.fromEntries(axis.poles.map((p) => [p.id, 0]));
  k.archetypes.forEach((a, i) => {
    const d = profileCatDist(a, axis);
    for (const p of axis.poles) mix[p.id] = (mix[p.id] ?? 0) + (post[i] ?? 0) * (d ? (d[p.id] ?? 0) : 1 / n);
  });
  return Object.fromEntries(axis.poles.map((p) => [p.id, (1 - u) * (mix[p.id] ?? 0) + u / n]));
}

export function multiPrior(k: Knowledge, axis: Axis, post: number[]): PoleDist {
  const u = uniformShare(post);
  return Object.fromEntries(
    axis.poles.map((p) => {
      let q = 0;
      k.archetypes.forEach((a, i) => {
        q += (post[i] ?? 0) * (profileMultiProb(a, axis.id, p.id) ?? 0.5);
      });
      return [p.id, (1 - u) * q + u * 0.5];
    }),
  );
}
