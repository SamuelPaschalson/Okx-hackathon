import { CircuitBuilder, ONE, ZERO } from './builder';
import { compile, firstGateSignal, validateGates, type CompiledCircuit, type Gate } from './netlist';

/**
 * Every Lineage creature has the same pinout, so any two can breed and fight.
 * The genome IS the TapeOut netlist taped out on X Layer — no off-chain copy.
 */
export const SENSORS = [
  'food east',
  'food west',
  'food south',
  'food north',
  'rival east',
  'rival west',
  'rival south',
  'rival north',
  'richer than rival',
  'rival adjacent',
] as const;

/**
 * Outputs ("genes"). Bits 0-1 pick a direction (N=0, E=1, S=2, W=3),
 * bit 2 raises the shell (guard instead of moving).
 */
export const GENES = ['Stride', 'Bearing', 'Shell'] as const;

export const N_IN = SENSORS.length; // 10
export const N_OUT = GENES.length; // 3
/** Upper bound on taped-out size: keeps tapeout cost and eval gas predictable. */
export const MAX_GATES = 64;

export const GATE_BASE = firstGateSignal(N_IN);

/**
 * Working form of a genome: gates in topological order plus the three output
 * pins, which may point at any signal (gate, input or constant). Convert to a
 * taped-out netlist with `toNetlist`.
 */
export interface Genome {
  gates: Gate[];
  outputs: number[];
}

/** Reads a taped-out netlist (outputs = last N_OUT signals) as a genome. */
export function fromNetlist(gates: readonly Gate[]): Genome {
  validateGates(gates, N_IN);
  if (gates.length < N_OUT) throw new Error('too few signals for outputs');
  const last = GATE_BASE + gates.length;
  return {
    gates: gates.map((g) => ({ ...g })),
    outputs: Array.from({ length: N_OUT }, (_, i) => last - N_OUT + i),
  };
}

/**
 * Produces a minimal netlist that is valid for `tapeout(nl, N_IN, N_OUT)`:
 * dead gates are pruned, duplicates merged, and the three output pins are
 * guaranteed to be the last three signals (a contract requirement).
 */
export function toNetlist(genome: Genome): Gate[] {
  const simplified = simplify(genome);
  const b = new CircuitBuilder(N_IN);
  const map = rebuildActive(simplified, b);
  const outs = simplified.outputs.map((s) => map(s));

  // Pins wired straight to an input need NOT(NOT(x)); create the inner NOT now
  // so it is structurally shared with any identical gate already present.
  type Pin =
    | { kind: 'move'; idx: number }
    | { kind: 'copy'; idx: number }
    | { kind: 'not'; of: number }
    | { kind: 'const'; value: 0 | 1 };
  const pinPlan: ({ kind: 'gate'; s: number } | { kind: 'not'; of: number } | { kind: 'const'; value: 0 | 1 })[] =
    outs.map((s) => {
      if (s === ZERO) return { kind: 'const', value: 0 };
      if (s === ONE) return { kind: 'const', value: 1 };
      if (s < GATE_BASE) return { kind: 'not', of: b.nand(s, s) };
      return { kind: 'gate', s };
    });

  const internal = b.gates;
  const referenced = new Uint8Array(internal.length);
  const mark = (s: number) => {
    if (s >= GATE_BASE) referenced[s - GATE_BASE] = 1;
  };
  for (const g of internal) {
    mark(g.a);
    mark(g.b);
  }
  for (const p of pinPlan) if (p.kind === 'not') mark(p.of);

  // A root gate nothing else reads can simply become the output gate.
  // Anything else gets a 1-gate copy (or NOT-NOT for raw inputs).
  const moved = new Set<number>();
  const pins: Pin[] = pinPlan.map((p) => {
    if (p.kind !== 'gate') return p;
    const idx = p.s - GATE_BASE;
    if (!referenced[idx] && !moved.has(idx)) {
      moved.add(idx);
      return { kind: 'move', idx };
    }
    return { kind: 'copy', idx };
  });

  // Final layout: surviving internal gates, then the output layer in pin order.
  const finalIndex = new Int32Array(internal.length).fill(-1);
  let next = 0;
  internal.forEach((_, i) => {
    if (!moved.has(i)) finalIndex[i] = next++;
  });
  pins.forEach((p, i) => {
    if (p.kind === 'move') finalIndex[p.idx] = next + i;
  });
  const remap = (s: number) => (s < GATE_BASE ? s : GATE_BASE + finalIndex[s - GATE_BASE]);

  const result: Gate[] = [];
  internal.forEach((g, i) => {
    if (!moved.has(i)) result.push({ a: remap(g.a), b: remap(g.b) });
  });
  for (const p of pins) {
    if (p.kind === 'move' || p.kind === 'copy') {
      const g = internal[p.idx];
      result.push({ a: remap(g.a), b: remap(g.b) });
    } else if (p.kind === 'not') {
      result.push({ a: remap(p.of), b: remap(p.of) });
    } else {
      // NAND(1,1) = 0, NAND(0,0) = 1
      result.push(p.value === 0 ? { a: ONE, b: ONE } : { a: ZERO, b: ZERO });
    }
  }

  validateGates(result, N_IN);
  return result;
}

/** Normalises any netlist (e.g. a hand-written or legacy one) into canonical form. */
export const canonicalize = (gates: readonly Gate[]): Gate[] => toNetlist(fromNetlist(gates));

export const compileGenome = (gates: readonly Gate[]): CompiledCircuit => compile(gates, N_IN, N_OUT);

/**
 * Prune + fold until nothing changes. One pass is not enough: folding a gate
 * to a constant can orphan the gates that fed it. Size strictly decreases
 * each round, so this terminates.
 */
function simplify(genome: Genome): Genome {
  let current = genome;
  for (;;) {
    const b = new CircuitBuilder(N_IN);
    const map = rebuildActive(current, b);
    const next = { gates: b.gates, outputs: current.outputs.map(map) };
    if (next.gates.length === current.gates.length) return next;
    current = next;
  }
}

/**
 * Copies only the gates that feed an output into `b` (in topological order)
 * and returns the old-signal -> new-signal mapping.
 */
function rebuildActive(genome: Genome, b: CircuitBuilder): (s: number) => number {
  const active = activeSet(genome);
  const mapped = new Int32Array(genome.gates.length).fill(-1);
  const map = (s: number) => (s < GATE_BASE ? s : mapped[s - GATE_BASE]);
  genome.gates.forEach((g, i) => {
    if (active[i]) mapped[i] = b.nand(map(g.a), map(g.b));
  });
  return map;
}

/** Marks gates reachable from the outputs (the "expressed" DNA). */
export function activeSet(genome: Genome): Uint8Array {
  const active = new Uint8Array(genome.gates.length);
  const stack = genome.outputs.filter((s) => s >= GATE_BASE);
  while (stack.length) {
    const idx = stack.pop()! - GATE_BASE;
    if (active[idx]) continue;
    active[idx] = 1;
    const g = genome.gates[idx];
    if (g.a >= GATE_BASE) stack.push(g.a);
    if (g.b >= GATE_BASE) stack.push(g.b);
  }
  return active;
}
