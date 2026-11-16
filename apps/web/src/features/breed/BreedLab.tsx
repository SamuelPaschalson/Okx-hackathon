import { GENES, identityOf } from '@lineage/core';
import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { CreatureAvatar } from '../../components/CreatureAvatar';
import { CreatureCard } from '../../components/CreatureCard';
import { DnaStrip } from '../../components/DnaStrip';
import { Badge, Button, Panel } from '../../components/ui';
import { chainEnabled, explorerTx } from '../../lib/chain/config';
import { quoteHatch, quoteLayEgg, type PendingEgg } from '../../lib/chain/lineage';
import type { Connection } from '../../lib/chain/wallet';
import { nameOf, type Creature } from '../../lib/collection';
import { useHatchery, type Phase } from './useHatchery';

interface Props {
  creatures: Creature[];
  connection: Connection | null;
  connecting: boolean;
  onConnect: () => void;
  pendingEggs: PendingEgg[];
  onLocalBorn: (c: Creature) => void;
  onChainBorn: () => Promise<void>;
  onFight: (id: string) => void;
}

export function BreedLab({ creatures, connection, connecting, onConnect, pendingEggs, onLocalBorn, onChainBorn, onFight }: Props) {
  const [parents, setParents] = useState<string[]>([]);
  const hatchery = useHatchery({ connection, onLocalBorn, onChainBorn });
  const { phase, busy } = hatchery;

  const [a, b] = parents.map((id) => creatures.find((c) => c.id === id));
  const onChain = chainEnabled && a?.source === 'chain' && b?.source === 'chain';
  const quote = useBreedQuote(onChain ? a : undefined, onChain ? b : undefined, connection);
  const resumable = pendingEggs.filter((e) => creatures.some((c) => c.id === e.parentA) && creatures.some((c) => c.id === e.parentB));

  function toggle(id: string) {
    if (busy || phase.kind === 'egg') return;
    if (phase.kind === 'born') hatchery.reset();
    setParents((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]));
  }

  function resume(egg: PendingEgg) {
    const pa = creatures.find((c) => c.id === egg.parentA);
    const pb = creatures.find((c) => c.id === egg.parentB);
    if (!pa || !pb) return;
    setParents([pa.id, pb.id]);
    hatchery.resume(egg, pa, pb);
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
                disabled={busy || phase.kind === 'egg'}
              />
            );
          })}
        </div>
      </Panel>

      <Panel title="Hatchery" className="lg:sticky lg:top-4 lg:self-start">
        {phase.kind === 'born' ? (
          <Newborn
            child={phase.child}
            txHash={phase.txHash}
            creatures={creatures}
            onFight={onFight}
            onAgain={() => {
              hatchery.reset();
              setParents([]);
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            {phase.kind === 'pick' && resumable.length > 0 && (
              <div className="w-full rounded-lg border border-amber/40 bg-bg p-3 text-left text-sm">
                <p className="mb-2 font-semibold text-amber">You have {resumable.length === 1 ? 'an unhatched egg' : `${resumable.length} unhatched eggs`}</p>
                {resumable.map((e) => (
                  <button key={String(e.eggId)} onClick={() => resume(e)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-raised">
                    Egg #{String(e.eggId)}: {label(creatures, e.parentA)} × {label(creatures, e.parentB)} → <span className="text-acid">resume</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <ParentSlot creature={phase.kind === 'egg' || phase.kind === 'hatching' ? phase.egg.parents[0] : a} label="A" />
              <span className="text-2xl text-muted">+</span>
              <ParentSlot creature={phase.kind === 'egg' || phase.kind === 'hatching' ? phase.egg.parents[1] : b} label="B" />
            </div>

            <Egg phase={phase.kind} />

            {phase.kind === 'pick' && (
              <PickActions
                ready={!!a && !!b}
                onChain={onChain}
                connected={!!connection}
                connecting={connecting}
                quote={quote}
                onConnect={onConnect}
                onLayChain={() => a && b && hatchery.layOnChain(a, b)}
                onLayLocal={() => a && b && hatchery.layLocal(a, b)}
              />
            )}

            {phase.kind === 'laying' && <p className="text-sm text-muted">Confirm in your wallet, then wait for X Layer to lay the egg…</p>}

            {(phase.kind === 'egg' || phase.kind === 'hatching') && (
              <>
                <p className="w-full break-all rounded-lg bg-bg p-2 font-mono text-[10px] text-muted">
                  {phase.egg.eggId !== undefined && <>egg #{String(phase.egg.eggId)} · </>}seed {phase.egg.seed}
                </p>
                <Button onClick={() => void hatchery.hatch()} disabled={phase.kind === 'hatching'} className="w-full">
                  {phase.kind === 'hatching'
                    ? phase.egg.eggId !== undefined
                      ? 'Taping out on X Layer…'
                      : 'Hatching…'
                    : phase.egg.eggId !== undefined
                      ? `Hatch on X Layer${quote ? ` · ${okb(quote.hatch)} OKB` : ''}`
                      : 'Hatch'}
                </Button>
                <p className="text-xs text-muted">
                  {phase.egg.eggId !== undefined
                    ? 'The seed was fixed by the Lineage contract when the egg was laid, so nobody can reroll for a better child.'
                    : 'Sandbox egg: the child stays in this browser.'}
                </p>
                {phase.egg.layTx && explorerTx(phase.egg.layTx) && (
                  <a href={explorerTx(phase.egg.layTx)!} target="_blank" rel="noreferrer" className="text-xs text-acid underline">
                    View egg transaction
                  </a>
                )}
              </>
            )}

            {hatchery.error && (
              <p role="alert" className="text-sm text-spark">
                {hatchery.error}
              </p>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

interface PickActionsProps {
  ready: boolean;
  onChain: boolean;
  connected: boolean;
  connecting: boolean;
  quote: Quote | null;
  onConnect: () => void;
  onLayChain: () => void;
  onLayLocal: () => void;
}

function PickActions({ ready, onChain, connected, connecting, quote, onConnect, onLayChain, onLayLocal }: PickActionsProps) {
  if (onChain) {
    return (
      <>
        {connected ? (
          <Button onClick={onLayChain} disabled={!ready} className="w-full">
            Lay egg on X Layer{quote ? ` · ${okb(quote.lay)} OKB` : ''}
          </Button>
        ) : (
          <Button onClick={onConnect} disabled={connecting} className="w-full">
            {connecting ? 'Connecting…' : 'Connect wallet to breed on-chain'}
          </Button>
        )}
        {quote && <p className="text-xs text-muted">Total with hatching ≈ {okb(quote.lay + quote.hatch)} OKB. Your child is a new TapeOut circuit NFT.</p>}
        <Button variant="ghost" onClick={onLayLocal} disabled={!ready} className="w-full">
          Try a free sandbox breed first
        </Button>
      </>
    );
  }
  return (
    <>
      <Button onClick={onLayLocal} disabled={!ready} className="w-full">
        Lay egg{chainEnabled ? ' (sandbox)' : ''}
      </Button>
      <p className="text-xs text-muted">
        {chainEnabled
          ? 'Sandbox breeding is free and stays in your browser. Pick two on-chain creatures to breed for real on X Layer.'
          : 'Each gene (Stride, Bearing, Shell) is a whole logic cone inherited from one parent, then 1–3 gates mutate.'}
      </p>
    </>
  );
}

interface Quote {
  lay: bigint;
  hatch: bigint;
}

/** Live on-chain price for breeding these parents (null while loading or not applicable). */
function useBreedQuote(a: Creature | undefined, b: Creature | undefined, connection: Connection | null): Quote | null {
  const [quote, setQuote] = useState<Quote | null>(null);
  const account = connection?.account;
  useEffect(() => {
    setQuote(null);
    if (!a?.circuitId || !b?.circuitId || !account) return;
    let cancelled = false;
    Promise.all([quoteLayEgg(a.circuitId, b.circuitId, account), quoteHatch()])
      .then(([lay, hatch]) => !cancelled && setQuote({ lay, hatch }))
      .catch(() => !cancelled && setQuote(null));
    return () => {
      cancelled = true;
    };
  }, [a?.circuitId, b?.circuitId, account]);
  return quote;
}

const okb = (wei: bigint) => {
  const s = formatEther(wei);
  return s.includes('.') ? s.slice(0, s.indexOf('.') + 5).replace(/\.?0+$/, '') : s;
};

const label = (creatures: Creature[], id: string) => {
  const c = creatures.find((x) => x.id === id);
  return c ? nameOf(c) : id;
};

function ParentSlot({ creature, label: slot }: { creature?: Creature; label: string }) {
  return (
    <div className="flex w-24 flex-col items-center gap-1">
      {creature ? (
        <CreatureAvatar gates={creature.gates} size={56} />
      ) : (
        <div className="grid h-14 w-14 place-items-center rounded-full border border-dashed border-line text-muted">{slot}</div>
      )}
      <span className="w-full truncate text-xs text-muted">{creature ? nameOf(creature) : `Parent ${slot}`}</span>
    </div>
  );
}

function Egg({ phase }: { phase: Phase['kind'] }) {
  const anim = phase === 'egg' || phase === 'laying' ? 'animate-wobble' : phase === 'hatching' ? 'animate-crack' : '';
  const laid = phase !== 'pick';
  return (
    <svg viewBox="0 0 80 100" width="96" height="120" className={anim} aria-hidden>
      <defs>
        <radialGradient id="egg" cx="35%" cy="30%">
          <stop offset="0" stopColor="#f3ffe0" />
          <stop offset="1" stopColor={laid ? '#9ccf4a' : '#2a362e'} />
        </radialGradient>
      </defs>
      <path d="M40 4C60 4 76 40 76 62S60 96 40 96 4 84 4 62 20 4 40 4z" fill="url(#egg)" stroke="#2a362e" strokeWidth="2" />
      {laid && <path d="M16 54l10-6 8 7 9-8 9 7 9-6 6 4" stroke="#0b0f0c" strokeWidth="2" fill="none" opacity="0.5" />}
    </svg>
  );
}

interface NewbornProps {
  child: Creature;
  txHash?: string;
  creatures: Creature[];
  onFight: (id: string) => void;
  onAgain: () => void;
}

function Newborn({ child, txHash, creatures, onFight, onAgain }: NewbornProps) {
  const id = identityOf(child.gates);
  const parentName = (p: 'A' | 'B') => label(creatures, child.parents?.[p === 'A' ? 0 : 1] ?? p);
  return (
    <div className="animate-rise flex flex-col items-center gap-4 text-center">
      <CreatureAvatar gates={child.gates} size={112} alive />
      <div>
        <p className="text-xl font-bold">{id.name} is born</p>
        <p className="font-mono text-xs text-muted">
          Gen {child.generation} · {child.gates.length} NAND gates · {child.circuitId ? `circuit #${child.circuitId}` : `#${id.fingerprint}`}
        </p>
        {child.source === 'chain' && (
          <div className="mt-2 flex justify-center gap-2">
            <Badge tone="acid">Taped out on X Layer</Badge>
            {txHash && explorerTx(txHash) && (
              <a href={explorerTx(txHash)!} target="_blank" rel="noreferrer" className="text-xs text-acid underline">
                transaction
              </a>
            )}
          </div>
        )}
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
