import { firstGateSignal, type Gate } from './netlist';

export const ZERO = 0;
export const ONE = 1;

/**
 * Append-only NAND circuit builder with constant folding, double-negation
 * removal and structural hashing (identical gates are created once).
 * Every circuit Lineage produces goes through here, which keeps genomes small
 * and therefore cheap to tape out (TapeOut burns one transistor per gate).
 */
export class CircuitBuilder {
  readonly gates: Gate[] = [];
  private readonly table = new Map<string, number>();
  /** gate signal -> the signal it negates, for NAND(x, x) gates. */
  private readonly notOf = new Map<number, number>();

  constructor(readonly nIn: number) {}

  input(i: number): number {
    if (!Number.isInteger(i) || i < 0 || i >= this.nIn) throw new RangeError(`input ${i} out of range`);
    return 2 + i;
  }

  nand(a: number, b: number): number {
    this.assertKnown(a);
    this.assertKnown(b);
    if (a === ZERO || b === ZERO) return ONE;
    if (a === ONE) a = b;
    if (b === ONE) b = a;
    if (a === ONE && b === ONE) return ZERO;
    // NOT(NOT(x)) = x
    if (a === b && this.notOf.has(a)) return this.notOf.get(a)!;

    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo},${hi}`;
    const existing = this.table.get(key);
    if (existing !== undefined) return existing;

    const signal = firstGateSignal(this.nIn) + this.gates.length;
    this.gates.push({ a: lo, b: hi });
    this.table.set(key, signal);
    if (lo === hi) this.notOf.set(signal, lo);
    return signal;
  }

  not(x: number): number {
    return this.nand(x, x);
  }

  and(x: number, y: number): number {
    return this.not(this.nand(x, y));
  }

  or(x: number, y: number): number {
    return this.nand(this.not(x), this.not(y));
  }

  /** if (sel) then t else f */
  mux(sel: number, t: number, f: number): number {
    return this.nand(this.nand(sel, t), this.nand(this.not(sel), f));
  }

  private assertKnown(s: number) {
    const limit = firstGateSignal(this.nIn) + this.gates.length;
    if (!Number.isInteger(s) || s < 0 || s >= limit) throw new RangeError(`unknown signal ${s}`);
  }
}
