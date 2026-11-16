import { battle } from './arena';
import { compileGenome } from './genome';
import type { Gate } from './netlist';

export interface Entrant {
  /** Stable id, e.g. the circuit id on X Layer. */
  id: string;
  gates: readonly Gate[];
}

export interface Standing {
  id: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  /** Energy scored minus energy conceded, the first tiebreaker. */
  energyDiff: number;
}

export const POINTS = { win: 3, draw: 1, loss: 0 } as const;

/**
 * Round robin: every pair fights twice, swapping starting sides. The result
 * is a pure function of (entrants, seasonSeed), so the leaderboard needs no
 * server: anyone who reads the creatures from chain recomputes the same table.
 */
export function roundRobin(entrants: readonly Entrant[], seasonSeed: string): Standing[] {
  const ids = new Set<string>();
  for (const e of entrants) {
    if (ids.has(e.id)) throw new Error(`duplicate entrant ${e.id}`);
    ids.add(e.id);
  }

  const brains = entrants.map((e) => compileGenome(e.gates));
  const table = entrants.map<Standing>((e) => ({ id: e.id, points: 0, wins: 0, draws: 0, losses: 0, energyDiff: 0 }));

  for (let i = 0; i < entrants.length; i++) {
    for (let j = i + 1; j < entrants.length; j++) {
      for (const leg of [0, 1]) {
        const [home, away] = leg === 0 ? [i, j] : [j, i];
        const r = battle(brains[home], brains[away], matchSeed(seasonSeed, entrants[home].id, entrants[away].id));
        record(table[home], r.energy[0] - r.energy[1], r.winner === null ? 'draw' : r.winner === 0 ? 'win' : 'loss');
        record(table[away], r.energy[1] - r.energy[0], r.winner === null ? 'draw' : r.winner === 1 ? 'win' : 'loss');
      }
    }
  }

  return table.sort((a, b) => b.points - a.points || b.energyDiff - a.energyDiff || compareIds(a.id, b.id));
}

/** Seed for one match. Order matters: (A home, B away) differs from (B home, A away). */
export const matchSeed = (season: string, homeId: string, awayId: string): string[] => [season, homeId, '|', awayId];

function record(s: Standing, diff: number, outcome: 'win' | 'draw' | 'loss') {
  s.points += POINTS[outcome];
  s.energyDiff += diff;
  if (outcome === 'win') s.wins++;
  else if (outcome === 'draw') s.draws++;
  else s.losses++;
}

/** Numeric ids sort numerically (circuit ids), anything else lexically. */
function compareIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}
