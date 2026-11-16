import { identityOf } from '@lineage/core';
import { nameOf, type Creature } from '../lib/collection';
import { CreatureAvatar } from './CreatureAvatar';
import { DnaStrip } from './DnaStrip';
import { Badge } from './ui';

interface Props {
  creature: Creature;
  selected?: boolean;
  /** Small label shown when selected, e.g. "Parent A". */
  selectedLabel?: string;
  onSelect?: () => void;
  disabled?: boolean;
}

export function CreatureCard({ creature, selected, selectedLabel, onSelect, disabled }: Props) {
  const id = identityOf(creature.gates);
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`group relative flex w-full flex-col gap-2 rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-acid disabled:opacity-40 ${
        selected ? 'border-acid bg-raised' : 'border-line bg-surface hover:border-acid-dim'
      }`}
    >
      {selected && selectedLabel && (
        <span className="absolute -top-2 right-2 rounded-full bg-acid px-2 text-[10px] font-bold uppercase text-bg">{selectedLabel}</span>
      )}
      <div className="flex items-center gap-3">
        <CreatureAvatar gates={creature.gates} size={48} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{nameOf(creature, id)}</p>
          <p className="font-mono text-[11px] text-muted">
            Gen {creature.generation} · {creature.gates.length} gates
          </p>
        </div>
      </div>
      <DnaStrip gates={creature.gates} />
      <div className="flex flex-wrap gap-1">
        {creature.source === 'founder' && <Badge tone="amber">Founder</Badge>}
        {creature.source === 'local' && <Badge>Local · not on-chain</Badge>}
        {creature.source === 'chain' && <Badge tone="acid">Circuit #{creature.circuitId}</Badge>}
        {creature.lineageVerified === true && <Badge tone="acid">Lineage verified</Badge>}
        {creature.lineageVerified === false && <Badge tone="spark">Lineage unverified</Badge>}
      </div>
    </button>
  );
}
