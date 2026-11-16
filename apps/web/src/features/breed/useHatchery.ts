import { breed, type BreedResult } from '@lineage/core';
import { useState } from 'react';
import type { Hash } from 'viem';
import { randomSeed, type Creature } from '../../lib/collection';
import * as lineage from '../../lib/chain/lineage';
import type { Connection } from '../../lib/chain/wallet';

export type Phase =
  | { kind: 'pick' }
  | { kind: 'laying' }
  | { kind: 'egg'; egg: EggState }
  | { kind: 'hatching'; egg: EggState }
  | { kind: 'born'; child: Creature; txHash?: Hash };

export interface EggState {
  parents: [Creature, Creature];
  seed: string;
  result: BreedResult;
  /** Set for on-chain eggs. */
  eggId?: bigint;
  layTx?: Hash;
}

const HATCH_ANIMATION_MS = 1100;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

interface Options {
  connection: Connection | null;
  onLocalBorn: (c: Creature) => void;
  /** Reloads on-chain creatures; awaited so the newborn is listed before we show it. */
  onChainBorn: () => Promise<void>;
}

/**
 * Egg -> hatch state machine for both modes:
 *  - sandbox: seed from the browser, child stored locally, free
 *  - on-chain: seed from the Lineage contract, child taped out on X Layer
 */
export function useHatchery({ connection, onLocalBorn, onChainBorn }: Options) {
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [error, setError] = useState<string | null>(null);

  const fail = (err: unknown, back: Phase) => {
    setError(lineage.describeChainError(err));
    setPhase(back);
  };

  function layLocal(a: Creature, b: Creature) {
    setError(null);
    try {
      const seed = randomSeed();
      setPhase({ kind: 'egg', egg: { parents: [a, b], seed, result: breed(a.gates, b.gates, seed) } });
    } catch (err) {
      fail(err, { kind: 'pick' });
    }
  }

  async function layOnChain(a: Creature, b: Creature) {
    if (!connection || a.circuitId === undefined || b.circuitId === undefined) return;
    setError(null);
    setPhase({ kind: 'laying' });
    try {
      const laid = await lineage.layEgg(connection, a.circuitId, b.circuitId);
      setPhase({
        kind: 'egg',
        egg: { parents: [a, b], seed: laid.seed, eggId: laid.eggId, layTx: laid.hash, result: breed(a.gates, b.gates, laid.seed) },
      });
    } catch (err) {
      fail(err, { kind: 'pick' });
    }
  }

  /** Picks up an egg laid earlier that was never hatched. */
  function resume(pending: lineage.PendingEgg, a: Creature, b: Creature) {
    setError(null);
    setPhase({
      kind: 'egg',
      egg: { parents: [a, b], seed: pending.seed, eggId: pending.eggId, result: breed(a.gates, b.gates, pending.seed) },
    });
  }

  async function hatch() {
    if (phase.kind !== 'egg') return;
    const { egg } = phase;
    setError(null);
    setPhase({ kind: 'hatching', egg });

    const [a, b] = egg.parents;
    const base = {
      gates: egg.result.gates,
      generation: Math.max(a.generation, b.generation) + 1,
      parents: [a.id, b.id] as [string, string],
      inherited: egg.result.inherited,
      mutations: egg.result.mutations,
      seed: egg.seed,
      bornAt: Date.now(),
    };

    if (egg.eggId === undefined) {
      await wait(HATCH_ANIMATION_MS);
      const child: Creature = { ...base, id: `L${Date.now().toString(36)}`, source: 'local' };
      onLocalBorn(child);
      setPhase({ kind: 'born', child });
      return;
    }

    if (!connection) {
      fail(new Error('Connect your wallet to hatch this egg.'), { kind: 'egg', egg });
      return;
    }
    try {
      const [hatched] = await Promise.all([lineage.hatch(connection, egg.eggId, egg.result.gates), wait(HATCH_ANIMATION_MS)]);
      await onChainBorn();
      const child: Creature = {
        ...base,
        id: lineage.chainId(hatched.circuitId),
        source: 'chain',
        circuitId: hatched.circuitId,
        owner: connection.account,
        lineageVerified: true,
      };
      setPhase({ kind: 'born', child, txHash: hatched.hash });
    } catch (err) {
      fail(err, { kind: 'egg', egg });
    }
  }

  return {
    phase,
    error,
    busy: phase.kind === 'laying' || phase.kind === 'hatching',
    layLocal,
    layOnChain,
    resume,
    hatch,
    reset: () => {
      setError(null);
      setPhase({ kind: 'pick' });
    },
  };
}
