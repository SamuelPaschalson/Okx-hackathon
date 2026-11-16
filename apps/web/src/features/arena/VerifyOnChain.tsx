import type { Frame } from '@lineage/core';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { describeChainError, verifyBattleOnChain, type BattleVerification } from '../../lib/chain/lineage';

type State = { kind: 'idle' } | { kind: 'checking' } | { kind: 'done'; result: BattleVerification } | { kind: 'error'; message: string };

/**
 * Replays every decision of this battle through TapeOut's on-chain eval().
 * Keyed by the battle in the parent, so a new battle starts back at idle.
 */
export function VerifyOnChain({ circuitIds, frames }: { circuitIds: [number, number]; frames: readonly Frame[] }) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function verify() {
    setState({ kind: 'checking' });
    try {
      setState({ kind: 'done', result: await verifyBattleOnChain(circuitIds, frames) });
    } catch (err) {
      setState({ kind: 'error', message: describeChainError(err) });
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-line bg-bg p-3 text-sm">
      {state.kind === 'done' ? (
        state.result.mismatches === 0 ? (
          <p role="status" className="text-acid">
            ✓ All {state.result.checked} decisions match TapeOut's on-chain eval() on X Layer.
          </p>
        ) : (
          <p role="alert" className="text-spark">
            ✗ {state.result.mismatches} of {state.result.checked} decisions differ from the chain.
          </p>
        )
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted">Both brains live on X Layer. Check every decision against the chain.</span>
          <Button variant="ghost" onClick={() => void verify()} disabled={state.kind === 'checking'}>
            {state.kind === 'checking' ? 'Checking…' : 'Verify on X Layer'}
          </Button>
        </div>
      )}
      {state.kind === 'error' && <p className="mt-2 text-xs text-spark">{state.message}</p>}
    </div>
  );
}
