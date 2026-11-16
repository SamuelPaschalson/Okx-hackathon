import { ARENA, type Frame } from '@lineage/core';
import { CreatureAvatar } from '../../components/CreatureAvatar';
import type { Creature } from '../../lib/collection';

const EVENT_TEXT: Record<string, (amount?: number) => string> = {
  eat: (n) => `+${n}`,
  steal: (n) => `steal ${n}`,
  bounce: (n) => `bounced −${n}`,
  clash: (n) => `clash −${n}`,
  guard: () => 'shell',
  bump: () => 'blocked',
};

export function Board({ frame, fighters }: { frame: Frame; fighters: [Creature, Creature] }) {
  const cells = Array.from({ length: ARENA.size * ARENA.size }, (_, i) => i);
  const ring = ['ring-acid', 'ring-spark'];
  return (
    <div
      className="relative grid aspect-square w-full gap-0.5 rounded-xl border border-line bg-bg p-1.5"
      style={{ gridTemplateColumns: `repeat(${ARENA.size}, minmax(0, 1fr))` }}
      role="img"
      aria-label={`Tick ${frame.tick + 1}: arena with ${frame.food.length} food`}
    >
      {cells.map((i) => {
        const x = i % ARENA.size;
        const y = Math.floor(i / ARENA.size);
        const food = frame.food.some((p) => p.x === x && p.y === y);
        const who = frame.fighters.findIndex((p) => p.x === x && p.y === y);
        const events = who === -1 ? [] : frame.events.filter((e) => e.who === who);
        const guarding = who !== -1 && frame.actions[who].kind === 'guard';
        return (
          <div key={i} className="relative grid place-items-center rounded-[4px] bg-surface">
            {food && <span className="h-2.5 w-2.5 rounded-full bg-amber shadow-[0_0_10px_var(--color-amber)]" />}
            {who !== -1 && (
              <div className={`absolute inset-0.5 grid place-items-center rounded-md ${guarding ? `ring-2 ${ring[who]}` : ''}`}>
                <CreatureAvatar gates={fighters[who].gates} size={40} className="h-full w-full" />
              </div>
            )}
            {events.length > 0 && (
              <span
                key={`${frame.tick}-${who}`}
                className={`animate-rise pointer-events-none absolute -top-3 z-10 whitespace-nowrap rounded bg-bg/90 px-1 text-[10px] font-bold ${who === 0 ? 'text-acid' : 'text-spark'}`}
              >
                {EVENT_TEXT[events[events.length - 1].kind](events[events.length - 1].amount)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
