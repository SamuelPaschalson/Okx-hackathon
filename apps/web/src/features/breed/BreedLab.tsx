import { breed, GENES, identityOf, type BreedResult } from '@lineage/core';
import { useState } from 'react';
import { CreatureAvatar } from '../../components/CreatureAvatar';
import { CreatureCard } from '../../components/CreatureCard';
import { DnaStrip } from '../../components/DnaStrip';
import { Badge, Button, Panel } from '../../components/ui';
import { nameOf, randomSeed, type Creature } from '../../lib/collection';

type Phase =
  | { kind: 'pick' }
  | { kind: 'egg'; seed: string; result: BreedResult }
  | { kind: 'hatching'; seed: string; result: BreedResult }
  | { kind: 'born'; child: Creature };

const HATCH_MS = 1100;

interface Props {
  creatures: Creature[];
  onBorn: (c: Creature) => void;
  onFight: (id: string) => void;
}

export function BreedLab({ creatures, onBorn, onFight }: Props) {
  const [parents, setParents] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [error, setError] = useState<string | null>(null);

  const [a, b] = parents.map((id) => creatures.find((c) => c.id === id));
  const busy = phase.kind === 'egg' || phase.kind === 'hatching';

  function toggle(id: string) {
    if (busy) return;
    setError(null);
    if (phase.kind === 'born') setPhase({ kind: 'pick' });
    setParents((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]));
  }

  function layEgg() {
    if (!a || !b) return;
    try {
      const seed = randomSeed();
      setPhase({ kind: 'egg', seed, result: breed(a.gates, b.gates, seed) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Breeding failed.');
    }
  }

  function hatch() {
    if (phase.kind !== 'egg' || !a || !b) return;
    const { seed, result } = phase;
    setPhase({ kind: 'hatching', seed, result });
    window.setTimeout(() => {
      const child: Creature = {
        id: `L${Date.now().toString(36)}`,
        gates: result.gates,
        generation: Math.max(a.generation, b.generation) + 1,
        source: 'local',
        parents: [a.id, b.id],
        inherited: result.inherited,
        mutations: result.mutations,
        seed,
        bornAt: Date.now(),
      };
      onBorn(child);
      setPhase({ kind: 'born', child });
    }, HATCH_MS);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Panel title="Choose two parents" aside={<span className="text-xs text-muted">{parents.length}/2 selected</span>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {creatures.map((c) => {
            const idx = parents.indexOf(c.id);
            return (
              <CreatureCard
                key={c.id}
                creature={c}
                selected={idx !== -1}
                selectedLabel={idx === 0 ? 'Parent A' : 'Parent B'}
                onSelect={() => toggle(c.id)}
                disabled={busy}
              />
            );
          })}
        </div>
      </Panel>

      <Panel title="Hatchery" className="lg:sticky lg:top-4 lg:self-start">
        {phase.kind === 'born' ? (
          <Newborn child={phase.child} creatures={creatures} onFight={onFight} onAgain={() => setPhase({ kind: 'pick' })} />
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-3">
              <ParentSlot creature={a} label="A" />
              <span className="text-2xl text-muted">+</span>
              <ParentSlot creature={b} label="B" />
            </div>

            <Egg phase={phase.kind} />

            {phase.kind === 'pick' && (
              <>
                <Button onClick={layEgg} disabled={!a || !b} className="w-full">
                  Lay egg
                </Button>
                <p className="text-xs text-muted">
                  Each gene (Stride, Bearing, Shell) is a whole logic cone inherited from one parent, then 1–3 gates mutate.
                </p>
              </>
            )}
            {phase.kind !== 'pick' && (
              <>
                <p className="w-full break-all rounded-lg bg-bg p-2 font-mono text-[10px] text-muted">seed {phase.seed}</p>
                <Button onClick={hatch} disabled={phase.kind === 'hatching'} className="w-full">
                  {phase.kind === 'hatching' ? 'Hatching…' : 'Hatch'}
                </Button>
                <p className="text-xs text-muted">
                  On X Layer the seed comes from the Lineage contract when the egg is laid, so nobody can reroll for a better child.
                </p>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-spark">
                {error}
              </p>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ParentSlot({ creature, label }: { creature?: Creature; label: string }) {
  return (
    <div className="flex w-24 flex-col items-center gap-1">
      {creature ? (
        <CreatureAvatar gates={creature.gates} size={56} />
      ) : (
        <div className="grid h-14 w-14 place-items-center rounded-full border border-dashed border-line text-muted">{label}</div>
      )}
      <span className="w-full truncate text-xs text-muted">{creature ? nameOf(creature) : `Parent ${label}`}</span>
    </div>
  );
}

function Egg({ phase }: { phase: Phase['kind'] }) {
  const anim = phase === 'egg' ? 'animate-wobble' : phase === 'hatching' ? 'animate-crack' : '';
  return (
    <svg viewBox="0 0 80 100" width="96" height="120" className={anim} aria-hidden>
      <defs>
        <radialGradient id="egg" cx="35%" cy="30%">
          <stop offset="0" stopColor="#f3ffe0" />
          <stop offset="1" stopColor={phase === 'pick' ? '#2a362e' : '#9ccf4a'} />
        </radialGradient>
      </defs>
      <path d="M40 4C60 4 76 40 76 62S60 96 40 96 4 84 4 62 20 4 40 4z" fill="url(#egg)" stroke="#2a362e" strokeWidth="2" />
      {phase !== 'pick' && <path d="M16 54l10-6 8 7 9-8 9 7 9-6 6 4" stroke="#0b0f0c" strokeWidth="2" fill="none" opacity="0.5" />}
    </svg>
  );
}

function Newborn({ child, creatures, onFight, onAgain }: { child: Creature; creatures: Creature[]; onFight: (id: string) => void; onAgain: () => void }) {
  const id = identityOf(child.gates);
  const parentName = (p: 'A' | 'B') => {
    const pid = child.parents?.[p === 'A' ? 0 : 1];
    const parent = creatures.find((c) => c.id === pid);
    return parent ? nameOf(parent) : p;
  };
  return (
    <div className="animate-rise flex flex-col items-center gap-4 text-center">
      <CreatureAvatar gates={child.gates} size={112} alive />
      <div>
        <p className="text-xl font-bold">{id.name} is born</p>
        <p className="font-mono text-xs text-muted">
          Gen {child.generation} · {child.gates.length} NAND gates · #{id.fingerprint}
        </p>
      </div>
      <DnaStrip gates={child.gates} className="w-full" />

      <ul className="w-full space-y-1 text-left text-sm">
        {GENES.map((gene, i) => (
          <li key={gene} className="flex items-center justify-between rounded-lg bg-bg px-3 py-2">
            <span>{gene} gene</span>
            <Badge tone={child.inherited?.[i] === 'A' ? 'acid' : 'spark'}>from {parentName(child.inherited?.[i] ?? 'A')}</Badge>
          </li>
        ))}
      </ul>

      {child.mutations && child.mutations.length > 0 ? (
        <div className="w-full text-left">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Mutations</p>
          <ul className="space-y-1 text-xs text-amber">
            {child.mutations.map((m, i) => (
              <li key={i}>✦ {m.note}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted">No mutations survived: a faithful blend of its parents.</p>
      )}

      <div className="grid w-full grid-cols-2 gap-2">
        <Button onClick={() => onFight(child.id)}>Send to the Pit</Button>
        <Button variant="ghost" onClick={onAgain}>
          Breed again
        </Button>
      </div>
    </div>
  );
}
