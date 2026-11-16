import { useState } from 'react';
import { ArenaView } from './features/arena/ArenaView';
import { BreedLab } from './features/breed/BreedLab';
import { Rankings } from './features/rankings/Rankings';
import { useCollection } from './lib/collection';

const TABS = [
  { id: 'hatchery', label: 'Hatchery' },
  { id: 'pit', label: 'The Pit' },
  { id: 'rankings', label: 'Rankings' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function App() {
  const { creatures, add } = useCollection();
  const [tab, setTab] = useState<Tab>('hatchery');
  const [challenger, setChallenger] = useState<string | undefined>();

  function fight(id: string) {
    setChallenger(id);
    setTab('pit');
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 sm:px-6">
      <header className="flex flex-col gap-4 py-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            Lineage<span className="text-acid">.</span>
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Creatures whose DNA is a real NAND circuit taped out on X Layer. Breed them, and every child is a brand-new circuit. Watch them think,
            gate by gate.
          </p>
        </div>
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
      </header>

      <main className="flex-1">
        {tab === 'hatchery' && <BreedLab creatures={creatures} onBorn={add} onFight={fight} />}
        {/* Keyed so a new challenger resets the fighter pickers. */}
        {tab === 'pit' && <ArenaView key={challenger ?? 'default'} creatures={creatures} challengerId={challenger} />}
        {tab === 'rankings' && <Rankings creatures={creatures} />}
      </main>

      <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
        Built on TapeOut · X Layer. Creatures bred here stay in this browser until hatched on-chain.
      </footer>
    </div>
  );
}
