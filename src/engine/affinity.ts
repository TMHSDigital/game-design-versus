import { ENGINE } from './config';
import { gameKey } from './coverage';

export type EloEntry = { game: string; rating: number; games: number; wins: number };
export type EloTable = Record<string, EloEntry>;

function entry(t: EloTable, game: string): EloEntry {
  const key = gameKey(game);
  t[key] ??= { game, rating: ENGINE.eloStart, games: 0, wins: 0 };
  return t[key];
}

/**
 * Each answer is a win for every chosen game over every rejected game. A blend is a draw among the
 * listed games. Mutates the table.
 */
export function eloUpdate(t: EloTable, winners: string[], losers: string[], draw = false): void {
  const pairs: [string, string, number][] = [];
  if (draw) {
    for (let i = 0; i < winners.length; i++) for (let j = i + 1; j < winners.length; j++) pairs.push([winners[i] as string, winners[j] as string, 0.5]);
  } else {
    for (const w of winners) for (const l of losers) pairs.push([w, l, 1]);
  }
  for (const [a, b, score] of pairs) {
    const ea = entry(t, a);
    const eb = entry(t, b);
    const expA = 1 / (1 + 10 ** ((eb.rating - ea.rating) / 400));
    ea.rating += ENGINE.eloK * (score - expA);
    eb.rating += ENGINE.eloK * (1 - score - (1 - expA));
    ea.games++;
    eb.games++;
    if (score === 1) ea.wins++;
  }
}

/** Weighted Elo: ratings shrink toward the start value when a game has few comparisons. */
export function rankAffinity(t: EloTable): (EloEntry & { score: number })[] {
  return Object.values(t)
    .map((e) => ({ ...e, score: ENGINE.eloStart + (e.rating - ENGINE.eloStart) * (e.games / (e.games + 1)) }))
    .sort((a, b) => b.score - a.score || b.wins - a.wins || a.game.localeCompare(b.game));
}
