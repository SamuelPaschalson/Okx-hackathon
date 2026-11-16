import { describe, expect, it } from 'vitest';
import { CircuitBuilder } from '../src/builder';
import { FOUNDERS, randomGenome } from '../src/founders';
import { canonicalize, compileGenome, fromNetlist, GATE_BASE, MAX_GATES, N_IN, N_OUT, toNetlist, type Genome } from '../src/genome';
import { decodeNetlist, encodeNetlist } from '../src/netlist';
import { Rng } from '../src/rng';
import { allInputs, evalGenome, truthTable } from './helpers';

/** Random working genome with output pins that may hit inputs, constants or shared gates. */
function wildGenome(seed: number): Genome {
  const rng = new Rng([seed]);
  const gates = [];
  const size = 1 + rng.int(30);
  for (let i = 0; i < size; i++) {
    const limit = GATE_BASE + i;
    gates.push({ a: rng.int(limit), b: rng.int(limit) });
  }
  const limit = GATE_BASE + gates.length;
  return { gates, outputs: [rng.int(limit), rng.int(limit), rng.int(limit)] };
}

describe('toNetlist', () => {
  it('preserves behaviour exactly, for every input, across messy genomes', () => {
    const inputs = allInputs();
    for (let seed = 0; seed < 300; seed++) {
      const genome = wildGenome(seed);
      const netlist = toNetlist(genome);
      const c = compileGenome(netlist);
      const actual = inputs.map((x) => c.run(x).join('')).join(',');
      const expected = inputs.map((x) => evalGenome(genome, x).join('')).join(',');
      expect(actual, `seed ${seed}`).toBe(expected);
    }
  });

  it('always yields a contract-valid netlist (refs backwards, outputs = last signals)', () => {
    for (let seed = 0; seed < 300; seed++) {
      const netlist = toNetlist(wildGenome(seed));
      expect(netlist.length).toBeGreaterThanOrEqual(N_OUT);
      // decodeNetlist applies the contract's rules
      expect(decodeNetlist(encodeNetlist(netlist), N_IN)).toEqual(netlist);
    }
  });

  it('handles outputs wired to constants, raw inputs, and the same gate twice', () => {
    const b = new CircuitBuilder(N_IN);
    const g = b.nand(b.input(0), b.input(1));
    const genome: Genome = { gates: b.gates, outputs: [g, g, b.input(3)] };
    const netlist = toNetlist(genome);
    for (const x of allInputs()) expect(Array.from(compileGenome(netlist).run(x))).toEqual(evalGenome(genome, x));

    const constants = toNetlist({ gates: [], outputs: [0, 1, 0] });
    expect(Array.from(compileGenome(constants).run(new Uint8Array(N_IN)))).toEqual([0, 1, 0]);
  });

  it('is stable under re-canonicalisation (same size, same behaviour)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const once = toNetlist(wildGenome(seed));
      const twice = canonicalize(once);
      expect(twice.length).toBe(once.length);
      expect(truthTable(twice)).toBe(truthTable(once));
    }
  });

  it('prunes gates that do not reach an output', () => {
    const genome = fromNetlist(FOUNDERS[0].gates);
    const padded: Genome = { gates: [...genome.gates], outputs: genome.outputs };
    expect(toNetlist(padded).length).toBe(FOUNDERS[0].gates.length);
  });
});

describe('founders', () => {
  it('fit the size cap and are canonical', () => {
    for (const f of FOUNDERS) {
      expect(f.gates.length).toBeLessThanOrEqual(MAX_GATES);
      expect(canonicalize(f.gates)).toEqual(f.gates);
    }
  });

  it('Grazer steers toward food and never guards', () => {
    const grazer = compileGenome(FOUNDERS.find((f) => f.name === 'Grazer')!.gates);
    const at = (bits: number[]) => {
      const x = new Uint8Array(N_IN);
      bits.forEach((i) => (x[i] = 1));
      return Array.from(grazer.run(x));
    };
    expect(at([0])).toEqual([1, 0, 0]); // food east -> E
    expect(at([1])).toEqual([1, 1, 0]); // food west -> W
    expect(at([2])).toEqual([0, 1, 0]); // food south -> S
    expect(at([3])).toEqual([0, 0, 0]); // food north -> N
  });

  it('random genomes are valid and capped', () => {
    for (let s = 0; s < 50; s++) {
      const g = randomGenome([s]);
      expect(g.length).toBeLessThanOrEqual(MAX_GATES);
      expect(() => compileGenome(g)).not.toThrow();
    }
  });
});
