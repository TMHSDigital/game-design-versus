import { describe, expect, it } from 'vitest';
import { buildKnowledge, rawData } from '../../src/engine/data';
import { validateKnowledge, findForbiddenChars } from '../../src/engine/validate';
import { coverageReport, COVERAGE_TARGETS } from '../../src/engine/coverage';
import { MODULES } from '../../src/engine/ontology';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raw = rawData();
const k = buildKnowledge(raw, { allowUnverified: true });

describe('data files', () => {
  it('parse against the zod schemas', () => {
    expect(k.axes.length).toBeGreaterThan(100);
    expect(k.archetypes.length).toBeGreaterThanOrEqual(40);
    expect(k.tensions.length).toBeGreaterThanOrEqual(30);
  });

  it('pass referential validation (axes, poles, exprs, archetypes, comparisons)', () => {
    expect(validateKnowledge(k, raw)).toEqual([]);
  });

  it('define every module exactly once', () => {
    expect(k.modules.map((m) => m.id).sort()).toEqual([...MODULES].sort());
  });

  it('keep every required axis id from the spec', () => {
    const required = [
      'frame.platform', 'frame.input', 'frame.players', 'frame.session', 'frame.length', 'frame.monetization', 'frame.team',
      'frame.timeline', 'frame.engine', 'frame.rating', 'frame.dimension', 'frame.realism', 'exp.aesthetics', 'exp.motivation',
      'exp.tone', 'exp.pace', 'exp.challenge', 'exp.agency', 'exp.fantasy', 'genre.family', 'genre.form', 'cam.view',
      'cam.control', 'ctl.embodiment', 'ctl.complexity', 'ctl.physicality', 'loop.verb', 'loop.cadence', 'loop.goal', 'loop.run',
      'loop.time', 'combat.presence', 'combat.centrality', 'combat.time_model', 'combat.sim', 'combat.range', 'combat.targeting',
      'combat.input', 'combat.resource', 'combat.defense', 'combat.commitment', 'combat.ttk', 'combat.numbers', 'combat.crowd',
      'combat.ai', 'combat.party', 'combat.info', 'combat.gore', 'ranged.ballistics', 'ranged.assist', 'stealth.presence',
      'stealth.model', 'stealth.failure', 'move.feel', 'move.precision', 'move.tools', 'move.climb', 'move.vehicles',
      'veh.handling', 'veh.damage', 'prog.presence', 'prog.source', 'prog.direction', 'prog.meta', 'prog.build', 'prog.gating',
      'prog.scaling', 'prog.respec', 'prog.cap', 'econ.presence', 'econ.scale', 'econ.currency', 'econ.openness', 'econ.prices',
      'econ.scarcity', 'econ.sinks', 'econ.production', 'econ.trade', 'econ.logistics', 'econ.monetized', 'craft.presence',
      'craft.discovery', 'craft.depth', 'craft.quality', 'build.presence', 'build.placement', 'build.integrity', 'build.purpose',
      'build.scale', 'surv.presence', 'surv.needs', 'surv.pressure', 'mgmt.presence', 'mgmt.control', 'mgmt.agents',
      'mgmt.threat', 'mgmt.goal', 'world.structure', 'world.authoring', 'world.size', 'world.persistence', 'world.destruction',
      'world.time', 'world.setting', 'narr.presence', 'narr.source', 'narr.branching', 'narr.delivery', 'narr.protagonist',
      'narr.dialogue', 'narr.endings', 'fail.penalty', 'fail.save', 'diff.options', 'diff.dynamic', 'mp.mode', 'mp.size',
      'mp.structure', 'mp.matching', 'mp.loss', 'mp.async', 'mp.symmetry', 'mp.comm', 'mp.hosting', 'art.style', 'art.fidelity',
      'art.palette', 'ui.diegesis', 'ui.transparency', 'audio.music', 'audio.sync', 'live.model', 'mod.support', 'replay.source',
      'strat.scale', 'strat.micro', 'strat.asymmetry', 'strat.victory', 'strat.diplomacy', 'puzzle.teaching', 'puzzle.solutions',
      'race.catchup', 'fight.input', 'fight.win', 'sport.realism', 'horror.agency', 'horror.threat', 'card.acquisition',
      'card.scoring', 'idle.offline', 'idle.prestige', 'party.input', 'party.mode', 'rhythm.core',
    ];
    const missing = required.filter((id) => !k.axisById.has(id));
    expect(missing).toEqual([]);
  });

  it('keep headers within 12 characters for AskUserQuestion', () => {
    expect(k.axes.filter((a) => a.header.length > 12).map((a) => a.id)).toEqual([]);
  });

  it('keep comparison options within AskUserQuestion limits (2 to 3 games plus at most one extra)', () => {
    for (const c of k.allComparisons) {
      expect(c.options.length).toBeGreaterThanOrEqual(2);
      expect(c.options.length).toBeLessThanOrEqual(3);
    }
  });

  it('contain no em dash or emoji in any data string', () => {
    const hits = [
      ...findForbiddenChars(raw.ontology, 'axes.json'),
      ...findForbiddenChars(raw.archetypes, 'archetypes.json'),
      ...findForbiddenChars(raw.tensions, 'tensions.json'),
      ...Object.entries(raw.comparisonFiles).flatMap(([f, v]) => findForbiddenChars(v, `comparisons/${f}.json`)),
    ];
    expect(hits).toEqual([]);
  });

  it('list every comparison file in the static index', () => {
    const dir = fileURLToPath(new URL('../../src/data/comparisons/', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
    expect(Object.keys(raw.comparisonFiles).sort()).toEqual(files);
  });

  it('flags forbidden characters', () => {
    expect(findForbiddenChars({ a: 'ok', b: [`x ${String.fromCharCode(0x2014)} y`] }, 'f')).toHaveLength(1);
    expect(findForbiddenChars({ a: 'rocket \u{1F680}' }, 'f')).toHaveLength(1);
    expect(findForbiddenChars({ a: 'plain - hyphen' }, 'f')).toHaveLength(0);
  });
});

describe('coverage targets', () => {
  const report = coverageReport(buildKnowledge(raw, { allowUnverified: false }));
  it(`has at least ${COVERAGE_TARGETS.total} verified comparisons`, () => {
    expect(report.total).toBeGreaterThanOrEqual(COVERAGE_TARGETS.total);
  });
  it('meets every coverage target', () => {
    expect(report.failures).toEqual([]);
  });
});
