import { describe, expect, it } from 'vitest';
import { hashSeed, mulberry32, pickIndex } from '../../src/engine/prng';
import { evalExpr, computeFlags, applicability, type AxisView } from '../../src/engine/gating';
import { knowledge } from '../../src/engine/data';

describe('prng', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('hashSeed mixes inputs', () => {
    expect(hashSeed(1, 2)).not.toEqual(hashSeed(2, 1));
    expect(hashSeed('x', 3)).toEqual(hashSeed('x', 3));
  });
  it('pickIndex stays in range', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const n = pickIndex(r, 3);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(3);
    }
  });
});

describe('gating expressions (three-valued)', () => {
  const views = new Map<string, AxisView>([
    ['combat.presence', { status: 'decided', lean: 'A' }],
    ['frame.players', { status: 'decided', poles: ['online_competitive'] }],
    ['exp.tone', { status: 'open' }],
  ]);
  const ctx = { flags: { has_combat: false, is_online: true }, axis: (id: string) => views.get(id) };
  it('reads flags and axis values', () => {
    expect(evalExpr({ flag: 'has_combat' }, ctx)).toBe(false);
    expect(evalExpr({ flag: 'has_avatar' }, ctx)).toBeUndefined();
    expect(evalExpr({ axis: 'combat.presence', lean: 'A' }, ctx)).toBe(true);
    expect(evalExpr({ axis: 'frame.players', in: ['online_competitive', 'mmo'] }, ctx)).toBe(true);
    expect(evalExpr({ axis: 'exp.tone', lean: 'A' }, ctx)).toBeUndefined();
  });
  it('combines with Kleene logic', () => {
    expect(evalExpr({ all: [{ flag: 'is_online' }, { flag: 'has_avatar' }] }, ctx)).toBeUndefined();
    expect(evalExpr({ all: [{ flag: 'has_combat' }, { flag: 'has_avatar' }] }, ctx)).toBe(false);
    expect(evalExpr({ any: [{ flag: 'is_online' }, { flag: 'has_avatar' }] }, ctx)).toBe(true);
    expect(evalExpr({ not: { flag: 'has_avatar' } }, ctx)).toBeUndefined();
    expect(evalExpr({ not: { flag: 'has_combat' } }, ctx)).toBe(true);
  });
});

describe('flags and module gating', () => {
  const k = knowledge();
  it('skips the combat module when combat.presence = none', () => {
    const views = new Map<string, AxisView>([['combat.presence', { status: 'decided', lean: 'A' }]]);
    const flags = computeFlags(k, (id) => views.get(id));
    expect(flags.has_combat).toBe(false);
    const sim = k.axisById.get('combat.sim')!;
    expect(applicability(k, sim, { flags, axis: (id) => views.get(id) })).toBe(false);
    const presence = k.axisById.get('combat.presence')!;
    expect(applicability(k, presence, { flags, axis: (id) => views.get(id) })).toBe(true);
  });
  it('opens the combat module when combat.presence = core', () => {
    const views = new Map<string, AxisView>([['combat.presence', { status: 'decided', lean: 'B' }]]);
    const flags = computeFlags(k, (id) => views.get(id));
    expect(flags.has_combat).toBe(true);
    expect(applicability(k, k.axisById.get('combat.sim')!, { flags, axis: (id) => views.get(id) })).toBe(true);
  });
  it('treats na on a gate as false', () => {
    const views = new Map<string, AxisView>([['combat.presence', { status: 'na' }]]);
    expect(computeFlags(k, (id) => views.get(id)).has_combat).toBe(false);
  });
  it('leaves module axes undetermined while the gate is open', () => {
    const flags = computeFlags(k, () => undefined);
    expect(flags.has_combat).toBeUndefined();
    expect(applicability(k, k.axisById.get('combat.sim')!, { flags, axis: () => undefined })).toBeUndefined();
  });
  it('sets multiplayer flags from frame.players', () => {
    const views = new Map<string, AxisView>([['frame.players', { status: 'decided', poles: ['solo'] }]]);
    const flags = computeFlags(k, (id) => views.get(id));
    expect(flags.is_multiplayer).toBeUndefined(); // genre.form could still imply multiplayer
    const views2 = new Map<string, AxisView>([
      ['frame.players', { status: 'decided', poles: ['solo'] }],
      ['genre.form', { status: 'decided', poles: ['roguelike'] }],
    ]);
    const f2 = computeFlags(k, (id) => views2.get(id));
    expect(f2.is_multiplayer).toBe(false);
    expect(f2.is_run_based).toBe(true);
    expect(applicability(k, k.axisById.get('mp.mode')!, { flags: f2, axis: (id) => views2.get(id) })).toBe(false);
  });
  it('sets genre flags from genre.family', () => {
    const views = new Map<string, AxisView>([['genre.family', { status: 'decided', poles: ['strategy', 'card'] }]]);
    const flags = computeFlags(k, (id) => views.get(id));
    expect(flags.is_strategy).toBe(true);
    expect(flags.is_card).toBe(true);
    expect(flags.is_racing).toBe(false);
  });
});
