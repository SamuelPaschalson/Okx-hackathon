import { compileGenome } from './genome';
import type { CompiledCircuit, Gate } from './netlist';
import { Rng, type Seed } from './rng';

/**
 * The Pit: a deterministic duel on a small grid. Each tick, both creatures
 * read 10 sensor bits, their circuit computes 3 output bits, and moves resolve
 * simultaneously. The brain is the exact netlist on X Layer, so any tick can be
 * checked with a free `eval(circuitId, inputs)` call.
 */
export const ARENA = {
  size: 9,
  ticks: 60,
  startEnergy: 10,
  foodCount: 3,
  foodValue: 3,
  stealAmount: 3,
  bouncePenalty: 3,
  clashPenalty: 1,
  guardCost: 2,
} as const;

export type Dir = 0 | 1 | 2 | 3; // N, E, S, W
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export interface Pos {
  x: number;
  y: number;
}

export interface FighterState extends Pos {
  energy: number;
}

export type Action = { kind: 'move'; dir: Dir } | { kind: 'guard' };

export type EventKind = 'eat' | 'steal' | 'bounce' | 'clash' | 'guard' | 'bump';

export interface TickEvent {
  kind: EventKind;
  /** Index of the creature the event is about (0 or 1). */
  who: 0 | 1;
  amount?: number;
}

export interface Frame {
  tick: number;
  fighters: [FighterState, FighterState];
  food: Pos[];
  /** Sensor bits each creature saw this tick (what was passed to eval). */
  inputs: [Uint8Array, Uint8Array];
  /** Raw output bits each circuit produced. */
  outputs: [Uint8Array, Uint8Array];
  actions: [Action, Action];
  events: TickEvent[];
}

export interface BattleResult {
  /** 0 or 1 for a win, null for a draw. */
  winner: 0 | 1 | null;
  energy: [number, number];
  ticks: number;
  knockout: boolean;
  /** Only populated when `record` is true (replays); omitted in tournaments. */
  frames: Frame[];
  /** Board after the last tick. */
  final: { fighters: [FighterState, FighterState]; food: Pos[] };
}

export interface BattleOptions {
  /** Keep every frame for replay. Off for tournaments (thousands of battles). */
  record?: boolean;
}

/** Accepts raw netlists or pre-compiled circuits (tournaments reuse compilations). */
export type Brain = readonly Gate[] | CompiledCircuit;

export function battle(brainA: Brain, brainB: Brain, seed: Seed, options: BattleOptions = {}): BattleResult {
  const brains = [toCircuit(brainA), toCircuit(brainB)] as const;
  const rng = new Rng(seed);
  const mid = Math.floor(ARENA.size / 2);
  const fighters: [FighterState, FighterState] = [
    { x: 1, y: mid, energy: ARENA.startEnergy },
    { x: ARENA.size - 2, y: mid, energy: ARENA.startEnergy },
  ];
  const food: Pos[] = [];
  for (let i = 0; i < ARENA.foodCount; i++) food.push(spawnFood(rng, fighters, food));

  const frames: Frame[] = [];
  let tick = 0;
  let knockout = false;

  while (tick < ARENA.ticks && !knockout) {
    const inputs = [sense(fighters, food, 0), sense(fighters, food, 1)] as [Uint8Array, Uint8Array];
    const outputs = [brains[0].run(inputs[0]), brains[1].run(inputs[1])] as [Uint8Array, Uint8Array];
    const actions = [decode(outputs[0]), decode(outputs[1])] as [Action, Action];
    // Snapshot before resolving: a frame is the board the creatures saw, plus what they did.
    const before = options.record ? { fighters: clone(fighters), food: food.map((f) => ({ ...f })) } : null;

    const events = resolve(fighters, actions, rng);
    eat(fighters, food, rng, events);

    if (before) frames.push({ tick, ...before, inputs, outputs, actions, events });
    tick++;
    knockout = fighters[0].energy === 0 || fighters[1].energy === 0;
  }

  const [e0, e1] = [fighters[0].energy, fighters[1].energy];
  return {
    winner: e0 === e1 ? null : e0 > e1 ? 0 : 1,
    energy: [e0, e1],
    ticks: tick,
    knockout,
    frames,
    final: { fighters: clone(fighters), food: food.map((f) => ({ ...f })) },
  };
}

/** Builds the 10 sensor bits for fighter `me`, in SENSORS order. */
export function sense(fighters: readonly FighterState[], food: readonly Pos[], me: 0 | 1): Uint8Array {
  const self = fighters[me];
  const rival = fighters[1 - me];
  const target = nearest(self, food);
  const bits = new Uint8Array(10);
  if (target) {
    bits[0] = +(target.x > self.x);
    bits[1] = +(target.x < self.x);
    bits[2] = +(target.y > self.y);
    bits[3] = +(target.y < self.y);
  }
  bits[4] = +(rival.x > self.x);
  bits[5] = +(rival.x < self.x);
  bits[6] = +(rival.y > self.y);
  bits[7] = +(rival.y < self.y);
  bits[8] = +(self.energy > rival.energy);
  bits[9] = +(manhattan(self, rival) === 1);
  return bits;
}

/** Output bits -> action. Bits 0-1 = direction (N,E,S,W), bit 2 = guard. */
export function decode(out: ArrayLike<number>): Action {
  if (out[2]) return { kind: 'guard' };
  return { kind: 'move', dir: ((out[0] ? 1 : 0) | (out[1] ? 2 : 0)) as Dir };
}

/**
 * Simultaneous resolution, computed only from the state at the start of the
 * tick so neither creature has an ordering advantage.
 */
function resolve(f: [FighterState, FighterState], actions: [Action, Action], rng: Rng): TickEvent[] {
  const events: TickEvent[] = [];
  const start = clone(f);
  const targets = actions.map((a, i) => (a.kind === 'move' ? step(start[i], a.dir) : null));

  for (const i of [0, 1] as const) {
    if (actions[i].kind === 'guard') {
      f[i].energy = Math.max(0, f[i].energy - ARENA.guardCost);
      events.push({ kind: 'guard', who: i });
    }
  }

  const hits = [0, 1].map((i) => {
    const t = targets[i];
    const rival = start[1 - i];
    return !!t && t.x === rival.x && t.y === rival.y;
  });

  if (hits[0] && hits[1]) {
    // Head-on charge: both lose a little and stay put.
    for (const i of [0, 1] as const) {
      f[i].energy = Math.max(0, f[i].energy - ARENA.clashPenalty);
      events.push({ kind: 'clash', who: i, amount: ARENA.clashPenalty });
    }
    return events;
  }

  // A successful steal also grabs the victim: it cannot move away this tick.
  // Without this a hunter can never catch prey that moves as fast as it does.
  const grabbed = [false, false];
  for (const i of [0, 1] as const) {
    if (!hits[i]) continue;
    const j = (1 - i) as 0 | 1;
    if (actions[j].kind === 'guard') {
      const loss = Math.min(ARENA.bouncePenalty, f[i].energy);
      f[i].energy -= loss;
      events.push({ kind: 'bounce', who: i, amount: loss });
    } else {
      const loot = Math.min(ARENA.stealAmount, f[j].energy);
      f[j].energy -= loot;
      f[i].energy += loot;
      grabbed[j] = true;
      events.push({ kind: 'steal', who: i, amount: loot });
    }
  }

  // Movement for creatures that neither attacked nor were grabbed.
  const dest = [0, 1].map((i) => (targets[i] && !hits[i] && !grabbed[i] ? targets[i]! : start[i]));
  if (dest[0].x === dest[1].x && dest[0].y === dest[1].y) {
    // Contested cell. Freezing both would livelock deterministic brains, so
    // the stronger creature takes it; a tie is a seeded coin flip.
    const winner: 0 | 1 =
      start[0].energy !== start[1].energy ? (start[0].energy > start[1].energy ? 0 : 1) : (rng.int(2) as 0 | 1);
    const loser = (1 - winner) as 0 | 1;
    events.push({ kind: 'bump', who: loser });
    dest[loser] = start[loser];
  }
  for (const i of [0, 1] as const) {
    f[i].x = dest[i].x;
    f[i].y = dest[i].y;
  }
  return events;
}

function eat(f: [FighterState, FighterState], food: Pos[], rng: Rng, events: TickEvent[]) {
  for (const i of [0, 1] as const) {
    const at = food.findIndex((p) => p.x === f[i].x && p.y === f[i].y);
    if (at === -1) continue;
    f[i].energy += ARENA.foodValue;
    events.push({ kind: 'eat', who: i, amount: ARENA.foodValue });
    food.splice(at, 1);
    food.push(spawnFood(rng, f, food));
  }
}

function spawnFood(rng: Rng, fighters: readonly Pos[], food: readonly Pos[]): Pos {
  const taken = (x: number, y: number) =>
    fighters.some((p) => p.x === x && p.y === y) || food.some((p) => p.x === x && p.y === y);
  const cells = ARENA.size * ARENA.size;
  // Random probe, then a deterministic scan from there; the grid is never full.
  const startCell = rng.int(cells);
  for (let k = 0; k < cells; k++) {
    const c = (startCell + k) % cells;
    const x = c % ARENA.size;
    const y = Math.floor(c / ARENA.size);
    if (!taken(x, y)) return { x, y };
  }
  throw new Error('arena full');
}

function step(p: Pos, dir: Dir): Pos {
  const clamp = (v: number) => Math.min(ARENA.size - 1, Math.max(0, v));
  return { x: clamp(p.x + DX[dir]), y: clamp(p.y + DY[dir]) };
}

function nearest(from: Pos, food: readonly Pos[]): Pos | undefined {
  let best: Pos | undefined;
  let bestDist = Infinity;
  for (const p of food) {
    const d = manhattan(from, p);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

const manhattan = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const clone = (f: [FighterState, FighterState]): [FighterState, FighterState] => [{ ...f[0] }, { ...f[1] }];
const toCircuit = (b: Brain): CompiledCircuit => ('run' in b ? b : compileGenome(b));
