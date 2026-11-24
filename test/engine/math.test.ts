import { describe, expect, it } from 'vitest';
import {
  binMean, binPosterior, catPosterior, entropy, leanLik, leanOf, likForAnswer, normalize, smoothOneHot, multiPosterior,
} from '../../src/engine/posterior';
import { entropyClarity, axisClarity } from '../../src/engine/clarity';
import { archetypeConfidence, rankArchetypes, updateArchetypes, uniformArchetypes } from '../../src/engine/archetypes';
import { eloUpdate, rankAffinity, type EloTable } from '../../src/engine/affinity';
import { evaluateTensions } from '../../src/engine/tensions';
import { knowledge } from '../../src/engine/data';
import { ENGINE } from '../../src/engine/config';

const k = knowledge();

describe('likelihoods', () => {
  it('match the spec vectors and mirror for B', () => {
    expect(likForAnswer('A')).toEqual([0.5, 0.3, 0.14, 0.04, 0.02]);
    expect(likForAnswer('B')).toEqual([0.02, 0.04, 0.14, 0.3, 0.5]);
    expect(likForAnswer('blend')).toEqual([0.05, 0.2, 0.5, 0.2, 0.05]);
  });
  it('centers an explicit lean Gaussian at lean/25 - 2', () => {
    const l0 = leanLik(0);
    expect(l0.indexOf(Math.max(...l0))).toBe(0);
    const l50 = leanLik(50);
    expect(l50.indexOf(Math.max(...l50))).toBe(2);
    const l75 = leanLik(75);
    expect(l75.indexOf(Math.max(...l75))).toBe(3);
    expect(l75[2]).toBeCloseTo(l75[4] as number, 10);
  });
});

describe('posterior updates', () => {
  it('moves toward A on an A answer and is normalized', () => {
    const post = binPosterior(normalize([1, 1, 1, 1, 1]), [likForAnswer('A')]);
    expect(post.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
    expect(binMean(post)).toBeLessThan(-0.6);
    expect(leanOf(post)).toBe('A');
  });
  it('blend answers center the posterior', () => {
    expect(leanOf(binPosterior(normalize([1, 1, 1, 1, 1]), [likForAnswer('blend')]))).toBe('center');
  });
  it('smooths a one-hot profile bin', () => {
    const s = smoothOneHot(-2, ENGINE.profileSmoothing);
    expect(s[0]).toBeCloseTo(1 - ENGINE.profileSmoothing);
    expect(s[1]).toBeCloseTo(ENGINE.profileSmoothing);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it('categorical posterior concentrates on the chosen pole', () => {
    const post = catPosterior({ a: 1 / 3, b: 1 / 3, c: 1 / 3 }, [{ a: 1, b: 0.05, c: 0.15 }]);
    expect(post.a).toBeGreaterThan(0.8);
  });
  it('multi posterior follows selections', () => {
    const post = multiPosterior({ x: 0.5, y: 0.5 }, [{ pole: 'x', selected: true }, { pole: 'y', selected: false }]);
    expect(post.x).toBeGreaterThan(0.85);
    expect(post.y).toBeLessThan(0.15);
  });
});

describe('clarity', () => {
  it('is 0 for uniform and 1 for certain', () => {
    expect(entropyClarity([0.2, 0.2, 0.2, 0.2, 0.2])).toBeCloseTo(0, 10);
    expect(entropyClarity([1, 0, 0, 0, 0])).toBeCloseTo(1, 10);
    expect(entropy([0.5, 0.5])).toBeCloseTo(Math.log(2));
  });
  it('normalizes categorical axes by log(#poles)', () => {
    expect(entropyClarity([1 / 3, 1 / 3, 1 / 3])).toBeCloseTo(0, 10);
  });
  it('applies the decided floor and flexible credit', () => {
    const p = [0.2, 0.2, 0.2, 0.2, 0.2];
    expect(axisClarity({ status: 'decided', dist: p })).toBe(ENGINE.decidedClarityFloor);
    expect(axisClarity({ status: 'flexible', dist: p })).toBe(1);
    expect(axisClarity({ status: 'open', dist: p })).toBeCloseTo(0);
  });
});

describe('archetypes', () => {
  it('rank soulslike first after soulslike-shaped answers', () => {
    let post = uniformArchetypes(k);
    const ev = [
      { axis: 'exp.challenge', kind: 'bin' as const, lik: likForAnswer('B') },
      { axis: 'combat.commitment', kind: 'bin' as const, lik: likForAnswer('A') },
      { axis: 'combat.resource', kind: 'bin' as const, lik: likForAnswer('A') },
      { axis: 'fail.penalty', kind: 'cat' as const, lik: { drop_recover: 1, none: 0.05, recent: 0.05, gear: 0.05, permadeath: 0.05 } },
      { axis: 'genre.form', kind: 'multi' as const, obs: [{ pole: 'soulslike', selected: true }, { pole: 'roguelike', selected: false }] },
    ];
    post = updateArchetypes(k, post, ev);
    expect(rankArchetypes(k, post)[0]?.id).toBe('soulslike_arpg');
    expect(archetypeConfidence(post)).toBeGreaterThan(1 / k.archetypes.length);
  });
  it('is order independent', () => {
    const e1 = { axis: 'exp.tone', kind: 'bin' as const, lik: likForAnswer('A') };
    const e2 = { axis: 'loop.time', kind: 'bin' as const, lik: likForAnswer('B') };
    const a = updateArchetypes(k, uniformArchetypes(k), [e1, e2]);
    const b = updateArchetypes(k, uniformArchetypes(k), [e2, e1]);
    a.forEach((x, i) => expect(x).toBeCloseTo(b[i] as number, 12));
  });
});

describe('affinity (Elo)', () => {
  it('ranks the repeatedly chosen game first', () => {
    const t: EloTable = {};
    eloUpdate(t, ['Half Sword'], ['Skyrim']);
    eloUpdate(t, ['Half Sword'], ['Chivalry 2']);
    eloUpdate(t, ['Exanima'], ['Skyrim']);
    const r = rankAffinity(t);
    expect(r[0]?.game).toBe('Half Sword');
    expect(r.at(-1)?.game).toBe('Skyrim');
    expect(t['skyrim']?.rating).toBeLessThan(ENGINE.eloStart);
  });
  it('treats blend as a draw', () => {
    const t: EloTable = {};
    eloUpdate(t, ['A', 'B'], [], true);
    expect(t['a']?.rating).toBe(ENGINE.eloStart);
  });
});

describe('tensions', () => {
  it('fire for physics melee in online competitive play', () => {
    const hits = evaluateTensions(k, {
      flags: { has_melee: true, is_online: true, is_competitive: true },
      axis: (id) => (id === 'combat.sim' ? { status: 'decided', lean: 'A' } : undefined),
    });
    expect(hits.map((h) => h.id)).toContain('physics_melee_online_pvp');
  });
  it('stay quiet when undetermined', () => {
    expect(evaluateTensions(k, { flags: {}, axis: () => undefined })).toEqual([]);
  });
});
