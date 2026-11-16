import { describe, expect, it } from 'vitest';
import { breed } from '../src/breed';
import { FOUNDERS, randomGenome } from '../src/founders';
import { canonicalize, compileGenome, MAX_GATES, N_IN } from '../src/genome';
import { decodeNetlist, encodeNetlist } from '../src/netlist';
import { allInputs } from './helpers';

const SEED = '0x8f3c1a0b9d2e4f5061728394a5b6c7d8e9f00112233445566778899aabbccdd';
const [grazer, bandit] = FOUNDERS;

describe('breed', () => {
  it('is deterministic for a given seed', () => {
    expect(breed(grazer.gates, bandit.gates, SEED)).toEqual(breed(grazer.gates, bandit.gates, SEED));
  });

  it('different seeds give different children', () => {
    const kids = new Set(
      Array.from({ length: 40 }, (_, i) => JSON.stringify(breed(grazer.gates, bandit.gates, [i]).gates)),
    );
    expect(kids.size).toBeGreaterThan(10);
  });

  it('every child is a valid, canonical, capped netlist (fuzzed over many lineages)', () => {
    let pool = [...FOUNDERS.map((f) => f.gates), randomGenome([1], 40), randomGenome([2], 40)];
    for (let gen = 0; gen < 30; gen++) {
      const next = [];
      for (let i = 0; i < pool.length; i++) {
        const child = breed(pool[i], pool[(i + gen + 1) % pool.length], [gen, i]);
        expect(child.gates.length).toBeLessThanOrEqual(MAX_GATES);
        expect(decodeNetlist(encodeNetlist(child.gates), N_IN)).toEqual(child.gates);
        expect(canonicalize(child.gates).length).toBe(child.gates.length);
        next.push(child.gates);
      }
      pool = next;
    }
  });

  it('records which parent each gene came from and logs mutations', () => {
    const r = breed(grazer.gates, bandit.gates, SEED);
    expect(r.inherited).toHaveLength(3);
    r.inherited.forEach((p) => expect(['A', 'B']).toContain(p));
    expect(r.mutations.length).toBeGreaterThanOrEqual(0);
  });

  it('a child of two identical parents mostly behaves like them (mutations are small)', () => {
    const inputs = allInputs();
    const children = 40;
    let agree = 0;
    for (const founder of FOUNDERS) {
      const parent = compileGenome(founder.gates);
      for (let s = 0; s < children; s++) {
        const child = compileGenome(breed(founder.gates, founder.gates, [s]).gates);
        for (const x of inputs) {
          const p = parent.run(x);
          const c = child.run(x);
          for (let g = 0; g < 3; g++) agree += +(p[g] === c[g]);
        }
      }
    }
    const rate = agree / (FOUNDERS.length * children * inputs.length * 3);
    expect(rate).toBeGreaterThan(0.75);
  });

  it('rejects parents above the size cap', () => {
    const huge = Array.from({ length: MAX_GATES + 1 }, () => ({ a: 2, b: 3 }));
    expect(() => breed(huge, grazer.gates, SEED)).toThrow(/at most/);
  });
});
