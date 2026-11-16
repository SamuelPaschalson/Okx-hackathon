/**
 * Deterministic PRNG (xoshiro128**). Every random choice in breeding and in the
 * arena flows through this, so identical seeds reproduce identical children and
 * identical battles on every machine. Integer-only, no Math.random.
 */
export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: Seed) {
    const words = seedWords(seed);
    // Expand the seed with splitmix32 so similar seeds diverge immediately.
    let x = words.reduce((acc, w) => mix32(acc ^ w), 0x9e3779b9);
    const next = () => (x = mix32(x + 0x9e3779b9));
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** Uniform unsigned 32-bit integer. */
  u32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Integer in [0, n). Exact integer arithmetic (u32 * n < 2^53 for n < 2^21). */
  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n > 1 << 21) throw new RangeError(`bad range ${n}`);
    return Math.floor((this.u32() * n) / 0x100000000);
  }

  /** True with probability perMille / 1000. */
  chance(perMille: number): boolean {
    return this.int(1000) < perMille;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from empty list');
    return items[this.int(items.length)];
  }
}

/** A seed: a 0x-prefixed hex string (e.g. a bytes32 from the contract), or a list of integers/strings. */
export type Seed = string | readonly (number | string)[];

function seedWords(seed: Seed): number[] {
  if (typeof seed === 'string') return hexOrTextWords(seed);
  return seed.flatMap((part) => (typeof part === 'number' ? [part >>> 0, Math.floor(part / 0x100000000) >>> 0] : hexOrTextWords(part)));
}

function hexOrTextWords(s: string): number[] {
  if (/^0x[0-9a-fA-F]*$/.test(s)) {
    const hex = s.slice(2).padStart(Math.ceil((s.length - 2) / 8) * 8, '0');
    const words: number[] = [];
    for (let i = 0; i < hex.length; i += 8) words.push(parseInt(hex.slice(i, i + 8), 16) >>> 0);
    return words.length ? words : [0];
  }
  // Text: FNV-1a per char, folded into words. Used for ids and labels.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return [h >>> 0, s.length];
}

function mix32(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;
