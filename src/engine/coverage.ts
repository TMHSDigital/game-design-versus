import type { Knowledge } from './data';
import { ERAS } from './ontology';

export const COVERAGE_TARGETS = {
  total: 600,
  stretch: 1000,
  perBipolarAxis: 4,
  perGenreFamily: 25,
  indieShare: 0.3,
  eraShare: 0.1,
  maxPerGame: 12,
} as const;

export type CoverageReport = {
  total: number;
  verified: number;
  unverified: number;
  indieShare: number;
  eraShare: Record<string, number>;
  perGenre: Record<string, number>;
  thinBipolarAxes: { axis: string; count: number }[];
  uncoveredPoles: { axis: string; pole: string }[];
  overusedGames: { game: string; count: number }[];
  topGames: { game: string; count: number }[];
  distinctGames: number;
  /** Hard targets that are not met. */
  failures: string[];
  /** Soft targets still being sourced (thin bipolar axes); reported but not blocking. */
  warnings: string[];
};

/** Normalizes a game title so "Resident Evil 2 (2019)" and "resident evil 2 (2019)" count together. */
export function gameKey(game: string): string {
  return game.toLowerCase().replace(/[^a-z0-9()]+/g, ' ').trim();
}

/** Computes coverage over k.comparisons (the servable set). */
export function coverageReport(k: Knowledge): CoverageReport {
  const list = k.comparisons;
  const T = COVERAGE_TARGETS;
  const failures: string[] = [];
  const warnings: string[] = [];
  const total = list.length;
  const verified = k.allComparisons.filter((c) => c.verification.status === 'verified').length;

  const perAxis = new Map<string, number>();
  const poleSeen = new Set<string>();
  const perGenre: Record<string, number> = {};
  const eraCount: Record<string, number> = Object.fromEntries(ERAS.map((e) => [e, 0]));
  const gameCount = new Map<string, { game: string; count: number }>();
  let indie = 0;
  for (const c of list) {
    perAxis.set(c.axis, (perAxis.get(c.axis) ?? 0) + 1);
    for (const o of c.options) {
      poleSeen.add(`${c.axis}:${o.pole}`);
      const key = gameKey(o.game);
      const g = gameCount.get(key) ?? { game: o.game, count: 0 };
      g.count++;
      gameCount.set(key, g);
    }
    for (const g of c.tags.genres) perGenre[g] = (perGenre[g] ?? 0) + 1;
    eraCount[c.tags.era] = (eraCount[c.tags.era] ?? 0) + 1;
    if (c.tags.indie) indie++;
  }

  if (total < T.total) failures.push(`total ${total} < ${T.total}`);
  const thinBipolarAxes: { axis: string; count: number }[] = [];
  const uncoveredPoles: { axis: string; pole: string }[] = [];
  for (const a of k.axes) {
    if (a.kind === 'bipolar') {
      const n = perAxis.get(a.id) ?? 0;
      if (n < T.perBipolarAxis) thinBipolarAxes.push({ axis: a.id, count: n });
    }
    if (a.kind === 'categorical') {
      for (const p of a.poles) if (!p.noExemplar && !poleSeen.has(`${a.id}:${p.id}`)) uncoveredPoles.push({ axis: a.id, pole: p.id });
    }
  }
  if (thinBipolarAxes.length) warnings.push(`${thinBipolarAxes.length} bipolar axes below ${T.perBipolarAxis} comparisons`);
  if (uncoveredPoles.length) failures.push(`${uncoveredPoles.length} categorical poles uncovered`);

  const families = k.axisById.get('genre.family')?.poles.map((p) => p.id) ?? [];
  for (const g of families) {
    perGenre[g] ??= 0;
    if ((perGenre[g] ?? 0) < T.perGenreFamily) failures.push(`genre ${g}: ${perGenre[g]} < ${T.perGenreFamily}`);
  }
  const indieShare = total ? indie / total : 0;
  if (indieShare < T.indieShare) failures.push(`indie share ${(indieShare * 100).toFixed(1)}% < ${T.indieShare * 100}%`);
  const eraShare: Record<string, number> = {};
  for (const e of ERAS) {
    eraShare[e] = total ? (eraCount[e] ?? 0) / total : 0;
    if ((eraShare[e] ?? 0) < T.eraShare) failures.push(`era ${e} share ${((eraShare[e] ?? 0) * 100).toFixed(1)}% < ${T.eraShare * 100}%`);
  }
  const games = [...gameCount.values()].sort((a, b) => b.count - a.count);
  const overusedGames = games.filter((g) => g.count > T.maxPerGame);
  if (overusedGames.length) failures.push(`${overusedGames.length} games used more than ${T.maxPerGame} times`);

  return {
    total,
    verified,
    unverified: k.allComparisons.length - verified,
    indieShare,
    eraShare,
    perGenre,
    thinBipolarAxes,
    uncoveredPoles,
    overusedGames,
    topGames: games.slice(0, 10),
    distinctGames: games.length,
    failures,
    warnings,
  };
}

export function formatCoverage(r: CoverageReport): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines = [
    `Comparisons served: ${r.total} (verified ${r.verified}, unverified ${r.unverified}); targets >= ${COVERAGE_TARGETS.total}, stretch ${COVERAGE_TARGETS.stretch}`,
    `Distinct games: ${r.distinctGames}; top: ${r.topGames.map((g) => `${g.game} ${g.count}`).join(', ')}`,
    `Indie share: ${pct(r.indieShare)} (target >= 30%)`,
    `Eras: ${Object.entries(r.eraShare).map(([e, s]) => `${e} ${pct(s)}`).join(', ')} (each >= 10%)`,
    `Per genre: ${Object.entries(r.perGenre).sort().map(([g, n]) => `${g} ${n}`).join(', ')} (each >= 25)`,
    `Thin bipolar axes (< 4): ${r.thinBipolarAxes.length ? r.thinBipolarAxes.map((t) => `${t.axis}=${t.count}`).join(', ') : 'none'}`,
    `Uncovered categorical poles: ${r.uncoveredPoles.length ? r.uncoveredPoles.map((p) => `${p.axis}:${p.pole}`).join(', ') : 'none'}`,
    `Overused games (> 12): ${r.overusedGames.length ? r.overusedGames.map((g) => `${g.game}=${g.count}`).join(', ') : 'none'}`,
    r.failures.length ? `FAIL: ${r.failures.join('; ')}` : 'PASS: all hard coverage targets met',
  ];
  if (r.warnings.length) lines.push(`WARN: ${r.warnings.join('; ')}`);
  return lines.join('\n');
}
