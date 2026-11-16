import { ARENA, battle } from '@lineage/core';
import { useMemo, useState } from 'react';
import { CreatureAvatar } from '../../components/CreatureAvatar';
import { Badge, Button, Panel } from '../../components/ui';
import { nameOf, type Creature } from '../../lib/collection';
import { Board } from './Board';
import { BrainScan, type BrainScanProps } from './BrainScan';
import { SPEEDS, useReplay } from './useReplay';

interface Props {
  creatures: Creature[];
  /** Pre-selected challenger (e.g. a creature that was just born). */
  challengerId?: string;
}

export function ArenaView({ creatures, challengerId }: Props) {
  const [aId, setAId] = useState(challengerId ?? creatures[0]?.id);
  const [bId, setBId] = useState(() => creatures.find((c) => c.id !== aId)?.id);
  const [round, setRound] = useState(1);

  const a = creatures.find((c) => c.id === aId);
  const b = creatures.find((c) => c.id === bId);
  const seed = `${aId}|${bId}|${round}`;

  // Memoised so the replay keeps the same frames across re-renders.
  const result = useMemo(() => (a && b ? battle(a.gates, b.gates, [seed], { record: true }) : null), [a, b, seed]);
  const replay = useReplay(result?.frames.length ?? 0, seed);

  if (!a || !b || !result) {
    return <Panel>You need at least two creatures to fight.</Panel>;
  }

  const frame = result.frames[replay.tick];
  const fighters: [Creature, Creature] = [a, b];
  const energies = replay.done ? result.energy : [frame.fighters[0].energy, frame.fighters[1].energy];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
      <FighterPanel
        creature={a}
        creatures={creatures}
        onPick={setAId}
        energy={energies[0]}
        tone="acid"
        frameData={{ inputs: frame.inputs[0], outputs: frame.outputs[0], action: frame.actions[0] }}
        exclude={bId}
      />

      <Panel
        title={`The Pit · tick ${replay.tick + 1}/${result.frames.length}`}
        aside={<Badge>{ARENA.size}×{ARENA.size}</Badge>}
        className="order-first lg:order-none"
      >
        <Board frame={frame} fighters={fighters} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={replay.toggle} className="min-w-20">
            {replay.playing ? 'Pause' : replay.done ? 'Replay' : 'Play'}
          </Button>
          <div className="flex rounded-lg border border-line" role="group" aria-label="Playback speed">
            {SPEEDS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => replay.setSpeed(i)}
                aria-pressed={replay.speed === i}
                className={`min-h-10 px-3 text-xs ${replay.speed === i ? 'text-acid' : 'text-muted hover:text-ink'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => setRound((r) => r + 1)}>
            Rematch
          </Button>
        </div>
        <input
          type="range"
          min={0}
          max={result.frames.length - 1}
          value={replay.tick}
          onChange={(e) => replay.seek(Number(e.target.value))}
          className="mt-3 w-full accent-[var(--color-acid)]"
          aria-label="Scrub through the battle"
        />

        {replay.done && <Verdict result={result} fighters={fighters} />}
      </Panel>

      <FighterPanel
        creature={b}
        creatures={creatures}
        onPick={setBId}
        energy={energies[1]}
        tone="spark"
        frameData={{ inputs: frame.inputs[1], outputs: frame.outputs[1], action: frame.actions[1] }}
        exclude={aId}
      />
    </div>
  );
}

interface FighterPanelProps {
  creature: Creature;
  creatures: Creature[];
  onPick: (id: string) => void;
  energy: number;
  tone: 'acid' | 'spark';
  frameData: Omit<BrainScanProps, 'tone'>;
  exclude?: string;
}

function FighterPanel({ creature, creatures, onPick, energy, tone, frameData, exclude }: FighterPanelProps) {
  const bar = tone === 'acid' ? 'bg-acid' : 'bg-spark';
  const max = 40;
  return (
    <Panel>
      <div className="flex items-center gap-3">
        <CreatureAvatar gates={creature.gates} size={56} />
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor={`pick-${tone}`}>
            Choose fighter
          </label>
          <select
            id={`pick-${tone}`}
            value={creature.id}
            onChange={(e) => onPick(e.target.value)}
            className="min-h-10 w-full truncate rounded-lg border border-line bg-bg px-2 text-sm font-semibold"
          >
            {creatures.map((c) => (
              <option key={c.id} value={c.id} disabled={c.id === exclude}>
                {nameOf(c)} · Gen {c.generation}
              </option>
            ))}
          </select>
          <p className="mt-1 font-mono text-[11px] text-muted">{creature.gates.length} NAND gates</p>
        </div>
      </div>

      <div className="my-4">
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted">Energy</span>
          <span className="font-mono font-semibold">{energy}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-bg" role="meter" aria-valuenow={energy} aria-valuemin={0} aria-valuemax={max} aria-label="Energy">
          <div className={`h-full ${bar} transition-all`} style={{ width: `${Math.min(100, (energy / max) * 100)}%` }} />
        </div>
      </div>

      <BrainScan {...frameData} tone={tone} />
    </Panel>
  );
}

function Verdict({ result, fighters }: { result: ReturnType<typeof battle>; fighters: [Creature, Creature] }) {
  const text =
    result.winner === null
      ? `Draw at ${result.energy[0]} energy each`
      : `${nameOf(fighters[result.winner])} wins ${Math.max(...result.energy)}–${Math.min(...result.energy)}${result.knockout ? ' by knockout' : ''}`;
  return (
    <p role="status" className="animate-rise mt-3 rounded-lg border border-acid-dim bg-raised p-3 text-center font-semibold">
      {text}
    </p>
  );
}
