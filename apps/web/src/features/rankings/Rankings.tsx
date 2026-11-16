import { POINTS, roundRobin, type Standing } from '@lineage/core';
import { useState } from 'react';
import { CreatureAvatar } from '../../components/CreatureAvatar';
import { Badge, Button, EmptyState, Panel } from '../../components/ui';
import { nameOf, type Creature } from '../../lib/collection';

const SEASON = 'season-1';

/**
 * The leaderboard is a pure function of (creatures, season seed): every pair
 * fights twice with sides swapped. Anyone can recompute it, so no server or
 * trusted referee is needed.
 */
export function Rankings({ creatures }: { creatures: Creature[] }) {
  const [table, setTable] = useState<{ key: string; standings: Standing[]; ms: number } | null>(null);
  const key = creatures.map((c) => c.id).join(',');
  const stale = table !== null && table.key !== key;
  const battles = creatures.length * (creatures.length - 1);

  function run() {
    const start = performance.now();
    const standings = roundRobin(
      creatures.map((c) => ({ id: c.id, gates: c.gates })),
      SEASON,
    );
    setTable({ key, standings, ms: Math.round(performance.now() - start) });
  }

  const byId = new Map(creatures.map((c) => [c.id, c]));

  return (
    <Panel
      title={`Season 1 · round robin`}
      aside={
        <Button onClick={run} disabled={creatures.length < 2}>
          {table ? 'Re-run season' : 'Run season'}
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted">
        {battles} battles, {POINTS.win} points per win and {POINTS.draw} per draw. The result is deterministic from the season seed, so anyone can
        recompute this table from the chain and get the same answer.
        {stale && <span className="ml-1 text-amber">New creatures were born since this run.</span>}
      </p>

      {!table ? (
        <EmptyState>Run the season to rank every creature in your collection.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="py-2 pr-2">#</th>
                <th className="py-2">Creature</th>
                <th className="py-2 text-right">Pts</th>
                <th className="py-2 text-right">W-D-L</th>
                <th className="py-2 text-right">± Energy</th>
              </tr>
            </thead>
            <tbody>
              {table.standings.map((s, i) => {
                const c = byId.get(s.id);
                if (!c) return null;
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className="py-2 pr-2 font-mono text-muted">{i + 1}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <CreatureAvatar gates={c.gates} size={32} />
                        <span className="font-semibold">{nameOf(c)}</span>
                        <span className="font-mono text-[11px] text-muted">G{c.generation}</span>
                        {i === 0 && <Badge tone="acid">Champion</Badge>}
                        {c.source === 'founder' && <Badge tone="amber">Founder</Badge>}
                      </div>
                    </td>
                    <td className="py-2 text-right font-mono font-semibold">{s.points}</td>
                    <td className="py-2 text-right font-mono text-muted">
                      {s.wins}-{s.draws}-{s.losses}
                    </td>
                    <td className={`py-2 text-right font-mono ${s.energyDiff >= 0 ? 'text-acid' : 'text-spark'}`}>
                      {s.energyDiff > 0 ? '+' : ''}
                      {s.energyDiff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">Computed in your browser in {table.ms} ms.</p>
        </div>
      )}
    </Panel>
  );
}
