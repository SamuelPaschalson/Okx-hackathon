import { GATE_BASE, N_IN, type Genome } from '../src/genome';
import { compileGenome } from '../src/genome';
import type { Gate } from '../src/netlist';

/** Reference evaluator for a working genome (outputs may point anywhere). */
export function evalGenome(g: Genome, inputs: ArrayLike<number>): number[] {
  const signals = new Uint8Array(GATE_BASE + g.gates.length);
  signals[1] = 1;
  for (let i = 0; i < N_IN; i++) signals[2 + i] = inputs[i] ? 1 : 0;
  g.gates.forEach((gate, i) => {
    signals[GATE_BASE + i] = signals[gate.a] & signals[gate.b] ? 0 : 1;
  });
  return g.outputs.map((s) => signals[s]);
}

export function allInputs(): Uint8Array[] {
  return Array.from({ length: 1 << N_IN }, (_, v) => Uint8Array.from({ length: N_IN }, (_, i) => (v >> i) & 1));
}

/** Full truth table of a taped-out netlist as a string, for equality checks. */
export function truthTable(gates: readonly Gate[]): string {
  const c = compileGenome(gates);
  return allInputs()
    .map((x) => c.run(x).join(''))
    .join(',');
}
