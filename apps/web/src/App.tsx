import { useCallback, useEffect, useState } from 'react';
import { Button } from './components/ui';
import { ArenaView } from './features/arena/ArenaView';
import { BreedLab } from './features/breed/BreedLab';
import { Rankings } from './features/rankings/Rankings';
import { chainEnabled, isLocalFork } from './lib/chain/config';
import { useChainCreatures, useWallet } from './lib/chain/hooks';
import { loadPendingEggs, type PendingEgg } from './lib/chain/lineage';
import { useLocalCollection } from './lib/collection';

const TABS = [
  { id: 'hatchery', label: 'Hatchery' },
  { id: 'pit', label: 'The Pit' },
  { id: 'rankings', label: 'Rankings' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function App() {
  const local = useLocalCollection();
  const chain = useChainCreatures();
  const wallet = useWallet();
  const [pendingEggs, setPendingEggs] = useState<PendingEgg[]>([]);
  const [tab, setTab] = useState<Tab>('hatchery');
  const [challenger, setChallenger] = useState<string | undefined>();

  // On-chain creatures replace the built-in founders when the contract is configured.
  const creatures = chainEnabled ? [...chain.creatures, ...local.local] : [...local.founders, ...local.local];
  const account = wallet.connection?.account;

  const refreshEggs = useCallback(async () => {
    if (!account) return setPendingEggs([]);
    try {
      setPendingEggs(await loadPendingEggs(account));
    } catch {
      setPendingEggs([]); // non-critical: the hatchery still works without the reminder
    }
  }, [account]);

  useEffect(() => {
    void refreshEggs();
  }, [refreshEggs]);

  const onChainBorn = useCallback(async () => {
    await Promise.all([chain.refresh(), refreshEggs()]);
  }, [chain.refresh, refreshEggs]);

  function fight(id: string) {
    setChallenger(id);
    setTab('pit');
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 sm:px-6">
      <header className="flex flex-col gap-4 py-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            Lineage<span className="text-acid">.</span>
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Creatures whose DNA is a real NAND circuit taped out on X Layer. Breed them, and every child is a brand-new circuit. Watch them think,
            gate by gate.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <nav className="flex rounded-xl border border-line bg-surface p-1" aria-label="Sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`min-h-10 flex-1 rounded-lg px-4 text-sm font-semibold transition sm:flex-none ${
                  tab === t.id ? 'bg-acid text-bg' : 'text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {chainEnabled &&
            (account ? (
              <span className="rounded-xl border border-line bg-surface px-3 py-2.5 text-center font-mono text-xs text-acid" title={account}>
                {account.slice(0, 6)}…{account.slice(-4)}
              </span>
            ) : (
              <Button variant="ghost" onClick={() => void wallet.connect()} disabled={wallet.connecting}>
                {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
              </Button>
            ))}
        </div>
      </header>

      {chainEnabled && isLocalFork && (
        <p className="mb-4 rounded-lg border border-amber/40 bg-surface p-3 text-sm text-amber">
          Local test network (X Layer fork). Transactions here use test OKB and never touch real X Layer.
        </p>
      )}
      {wallet.error && (
        <p role="alert" className="mb-4 rounded-lg border border-spark/40 bg-surface p-3 text-sm text-spark">
          {wallet.error}
        </p>
      )}
      {chain.status === 'loading' && chain.creatures.length === 0 && <p className="mb-4 text-sm text-muted">Loading creatures from X Layer…</p>}
      {chain.status === 'error' && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-spark/40 bg-surface p-3 text-sm">
          <span className="text-spark">Couldn't load creatures from X Layer: {chain.error}</span>
          <Button variant="ghost" onClick={() => void chain.refresh()}>
            Retry
          </Button>
        </div>
      )}

      <main className="flex-1">
        {tab === 'hatchery' && (
          <BreedLab
            creatures={creatures}
            connection={wallet.connection}
            connecting={wallet.connecting}
            onConnect={() => void wallet.connect()}
            pendingEggs={pendingEggs}
            onLocalBorn={local.add}
            onChainBorn={onChainBorn}
            onFight={fight}
          />
        )}
        {/* Keyed so a new challenger resets the fighter pickers. */}
        {tab === 'pit' && <ArenaView key={challenger ?? 'default'} creatures={creatures} challengerId={challenger} />}
        {tab === 'rankings' && <Rankings creatures={creatures} />}
      </main>

      <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
        Built on TapeOut · X Layer.{' '}
        {chainEnabled ? 'Sandbox creatures stay in this browser; on-chain creatures are TapeOut circuit NFTs.' : 'Running in sandbox mode.'}
      </footer>
    </div>
  );
}
