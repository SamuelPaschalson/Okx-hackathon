import { CircuitBuilder } from './builder';
import { fromNetlist, GATE_BASE, GENES, MAX_GATES, N_IN, N_OUT, toNetlist, type Genome } from './genome';
import type { Gate } from './netlist';
import { Rng, type Seed } from './rng';

export type Parent = 'A' | 'B';

export interface Mutation {
  kind: 'rewire' | 'insert' | 'delete' | 'repin';
  /** Human-readable note for the hatchery log. */
  note: string;
}

export interface BreedResult {
  /** Child netlist, ready for tapeout(nl, N_IN, N_OUT). */
  gates: Gate[];
  /** Which parent each gene (output cone) came from, indexed like GENES. */
  inherited: Parent[];
  mutations: Mutation[];
}

/**
 * Breeds two taped-out genomes. Deterministic: the same parents and seed
 * always produce the same child, so anyone can verify a creature's lineage by
 * re-running this with the seed the Lineage contract recorded for its egg.
 *
 * 1. Crossover: each gene's entire logic cone is inherited from one parent.
 * 2. Mutation: 1-3 small structural edits.
 * 3. Canonicalisation: dead gates pruned, duplicates merged.
 */
export function breed(parentA: readonly Gate[], parentB: readonly Gate[], seed: Seed): BreedResult {
  if (parentA.length > MAX_GATES || parentB.length > MAX_GATES) {
    throw new Error(`parents must have at most ${MAX_GATES} gates`);
  }
  const rng = new Rng(seed);
  const a = fromNetlist(parentA);
  const b = fromNetlist(parentB);

  let { genome, inherited } = crossover(a, b, rng);
  let baseline = toNetlist(genome);

  // Two large parents can merge into an over-cap child. Then the parent who
  // passed down the first gene is dominant and passes down every gene.
  if (baseline.length > MAX_GATES) {
    const dominant = inherited[0];
    inherited = inherited.map(() => dominant);
    baseline = toNetlist(dominant === 'A' ? a : b);
  }

  const mutations: Mutation[] = [];
  const gates = toNetlist(mutate(fromNetlist(baseline), rng, mutations));

  // A mutation that grows the child past the cap is discarded.
  if (gates.length > MAX_GATES) return { gates: baseline, inherited, mutations: [] };
  return { gates, inherited, mutations };
}

function crossover(a: Genome, b: Genome, rng: Rng): { genome: Genome; inherited: Parent[] } {
  const builder = new CircuitBuilder(N_IN);
  const memo = { A: new Map<number, number>(), B: new Map<number, number>() };
  const inherited: Parent[] = [];
  const outputs: number[] = [];
  for (let i = 0; i < N_OUT; i++) {
    const from: Parent = rng.chance(500) ? 'A' : 'B';
    inherited.push(from);
    const src = from === 'A' ? a : b;
    outputs.push(importCone(src, src.outputs[i], builder, memo[from]));
  }
  return { genome: { gates: builder.gates, outputs }, inherited };
}

/** Copies the cone driving `signal` from `src` into `builder` (post-order). */
function importCone(src: Genome, signal: number, builder: CircuitBuilder, memo: Map<number, number>): number {
  if (signal < GATE_BASE) return signal;
  const cached = memo.get(signal);
  if (cached !== undefined) return cached;
  const g = src.gates[signal - GATE_BASE];
  const result = builder.nand(importCone(src, g.a, builder, memo), importCone(src, g.b, builder, memo));
  memo.set(signal, result);
  return result;
}

const MUTATION_WEIGHTS: [Mutation['kind'], number][] = [
  ['rewire', 45],
  ['insert', 25],
  ['delete', 15],
  ['repin', 15],
];

function mutate(genome: Genome, rng: Rng, log: Mutation[]): Genome {
  let g = genome;
  // Usually one edit, sometimes two or three: children resemble parents but drift.
  const count = 1 + (rng.chance(300) ? 1 : 0) + (rng.chance(80) ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const kind = weighted(rng, g.gates.length >= MAX_GATES - 8 ? MUTATION_WEIGHTS.filter(([k]) => k !== 'insert') : MUTATION_WEIGHTS);
    g = applyMutation(g, kind, rng, log);
  }
  return g;
}

function applyMutation(g: Genome, kind: Mutation['kind'], rng: Rng, log: Mutation[]): Genome {
  const n = g.gates.length;
  if (n === 0 || kind === 'repin') {
    const pin = rng.int(N_OUT);
    const target = randomSignal(rng, GATE_BASE + n);
    log.push({ kind: 'repin', note: `${GENES[pin]} gene rewired to ${describeSignal(target)}` });
    const outputs = [...g.outputs];
    outputs[pin] = target;
    return { gates: g.gates, outputs };
  }

  const idx = rng.int(n);
  const self = GATE_BASE + idx;
  const slot = rng.chance(500) ? 'a' : 'b';

  if (kind === 'rewire') {
    const target = randomSignal(rng, self);
    log.push({ kind, note: `gate ${idx} now reads ${describeSignal(target)}` });
    const gates = g.gates.map((gate, i) => (i === idx ? { ...gate, [slot]: target } : gate));
    return { gates, outputs: g.outputs };
  }

  if (kind === 'insert') {
    // New gate NAND(old input, random earlier signal) spliced in front of gate idx.
    const other = randomSignal(rng, self);
    log.push({ kind, note: `new gate grown before gate ${idx}` });
    const shift = (s: number) => (s >= self ? s + 1 : s);
    const gates: Gate[] = [];
    g.gates.forEach((gate, i) => {
      if (i === idx) {
        gates.push({ a: gate[slot], b: other });
        gates.push({ a: slot === 'a' ? self : shift(gate.a), b: slot === 'b' ? self : shift(gate.b) });
      } else {
        gates.push({ a: shift(gate.a), b: shift(gate.b) });
      }
    });
    return { gates, outputs: g.outputs.map(shift) };
  }

  // delete: gate idx is replaced everywhere by one of its own inputs.
  const replacement = g.gates[idx][slot];
  log.push({ kind: 'delete', note: `gate ${idx} dropped` });
  const fix = (s: number) => (s === self ? replacement : s > self ? s - 1 : s);
  const gates = g.gates.filter((_, i) => i !== idx).map((gate) => ({ a: fix(gate.a), b: fix(gate.b) }));
  return { gates, outputs: g.outputs.map(fix) };
}

/** Random signal below `limit`, biased toward sensors so mutations stay meaningful. */
function randomSignal(rng: Rng, limit: number): number {
  const gateCount = limit - GATE_BASE;
  if (gateCount <= 0 || rng.chance(550)) return 2 + rng.int(N_IN);
  return GATE_BASE + rng.int(gateCount);
}

function describeSignal(s: number): string {
  if (s === 0) return 'constant 0';
  if (s === 1) return 'constant 1';
  if (s < GATE_BASE) return `sensor #${s - 2}`;
  return `gate ${s - GATE_BASE}`;
}

function weighted<T>(rng: Rng, table: [T, number][]): T {
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng.int(total);
  for (const [item, w] of table) {
    if (roll < w) return item;
    roll -= w;
  }
  return table[table.length - 1][0];
}
