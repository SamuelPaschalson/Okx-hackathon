import { CircuitBuilder, ZERO } from './builder';
import { N_IN, toNetlist } from './genome';
import type { Gate } from './netlist';
import { Rng, type Seed } from './rng';

/**
 * Generation 0. Hand-designed brains with distinct instincts, written as plain
 * boolean logic and compiled to NAND. Everything after them is bred.
 *
 * Direction encoding (outputs 0-1): N=00, E=10, S=01, W=11 (bit0, bit1).
 */
export interface FounderSpec {
  name: string;
  epithet: string;
  gates: Gate[];
}

type Sensors = ReturnType<typeof sensorsOf>;

function sensorsOf(b: CircuitBuilder) {
  const s = (i: number) => b.input(i);
  return {
    foodE: s(0),
    foodW: s(1),
    foodS: s(2),
    foodN: s(3),
    rivalE: s(4),
    rivalW: s(5),
    rivalS: s(6),
    rivalN: s(7),
    richer: s(8),
    adjacent: s(9),
  };
}

/** Steering toward a target given its 4 direction bits: prefers E/W, then S, else N. */
function steer(b: CircuitBuilder, e: number, w: number, s: number): [number, number] {
  const bit0 = b.or(e, w); // E or W
  const bit1 = b.and(b.not(e), b.or(w, s)); // W or (S and not E/W)
  return [bit0, bit1];
}

function build(logic: (b: CircuitBuilder, s: Sensors) => [number, number, number]): Gate[] {
  const b = new CircuitBuilder(N_IN);
  const outputs = logic(b, sensorsOf(b));
  return toNetlist({ gates: b.gates, outputs });
}

export const FOUNDERS: FounderSpec[] = [
  {
    name: 'Grazer',
    epithet: 'Follows its nose to the nearest food. Never fights.',
    gates: build((b, s) => [...steer(b, s.foodE, s.foodW, s.foodS), ZERO]),
  },
  {
    name: 'Bandit',
    epithet: 'Grazes while ahead; when behind, hunts the rival to steal back.',
    gates: build((b, s) => {
      const [f0, f1] = steer(b, s.foodE, s.foodW, s.foodS);
      const [r0, r1] = steer(b, s.rivalE, s.rivalW, s.rivalS);
      return [b.mux(s.richer, f0, r0), b.mux(s.richer, f1, r1), ZERO];
    }),
  },
  {
    name: 'Tortoise',
    epithet: 'Grazes, but raises its shell whenever the rival is close.',
    gates: build((b, s) => [...steer(b, s.foodE, s.foodW, s.foodS), s.adjacent]),
  },
  {
    name: 'Opportunist',
    epithet: 'Grazes when poor, hunts when rich.',
    gates: build((b, s) => {
      const [f0, f1] = steer(b, s.foodE, s.foodW, s.foodS);
      const [r0, r1] = steer(b, s.rivalE, s.rivalW, s.rivalS);
      return [b.mux(s.richer, r0, f0), b.mux(s.richer, r1, f1), ZERO];
    }),
  },
  {
    name: 'Ambusher',
    epithet: 'Grazes, but strikes the moment the rival is adjacent.',
    gates: build((b, s) => {
      const [f0, f1] = steer(b, s.foodE, s.foodW, s.foodS);
      const [r0, r1] = steer(b, s.rivalE, s.rivalW, s.rivalS);
      return [b.mux(s.adjacent, r0, f0), b.mux(s.adjacent, r1, f1), ZERO];
    }),
  },
];

/** A random but valid genome, for "wild" creatures and fuzz tests. */
export function randomGenome(seed: Seed, size = 24): Gate[] {
  const rng = new Rng(seed);
  const b = new CircuitBuilder(N_IN);
  const pool = Array.from({ length: N_IN }, (_, i) => b.input(i));
  for (let i = 0; i < size; i++) pool.push(b.nand(rng.pick(pool), rng.pick(pool)));
  const tail = pool.slice(-6);
  return toNetlist({ gates: b.gates, outputs: [rng.pick(tail), rng.pick(tail), rng.pick(tail)] });
}
