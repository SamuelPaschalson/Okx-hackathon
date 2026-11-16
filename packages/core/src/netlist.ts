/**
 * TapeOut netlist codec and evaluator (NAND-only subset).
 *
 * Wire format, verified against the X Layer contracts:
 *   NAND  = 0x00 · a:u24 · b:u24        (7 bytes)
 *   LATCH = 0x01 · d:u24                (not used by Lineage)
 *   REF   = 0x02 · cpu · id · pins ...  (not used by Lineage)
 *
 * Signals: 0 = const 0, 1 = const 1, inputs are 2..1+nIn, then each gate
 * appends one signal. The circuit's outputs are the LAST nOut signals.
 * A NAND may only read signals strictly before its own output, otherwise the
 * contract reverts "NAND: future signal".
 *
 * eval() I/O is bit-packed least-significant-bit first.
 */

export const OP_NAND = 0x00;
const NAND_BYTES = 7;
const U24_MAX = 0xffffff;

/** A NAND gate reading two earlier signals. */
export interface Gate {
  a: number;
  b: number;
}

/** First signal index produced by a gate, for a circuit with `nIn` inputs. */
export const firstGateSignal = (nIn: number): number => 2 + nIn;

export function encodeNetlist(gates: readonly Gate[]): Uint8Array {
  const out = new Uint8Array(gates.length * NAND_BYTES);
  gates.forEach((g, i) => {
    const o = i * NAND_BYTES;
    out[o] = OP_NAND;
    writeU24(out, o + 1, g.a);
    writeU24(out, o + 4, g.b);
  });
  return out;
}

/**
 * Decodes a NAND-only netlist and validates it with the same rules the
 * contract enforces at tapeout. Throws on LATCH/REF, truncation or bad refs.
 */
export function decodeNetlist(bytes: Uint8Array, nIn: number): Gate[] {
  if (bytes.length % NAND_BYTES !== 0) {
    throw new Error(`netlist length ${bytes.length} is not a multiple of ${NAND_BYTES}`);
  }
  const gates: Gate[] = [];
  for (let o = 0; o < bytes.length; o += NAND_BYTES) {
    if (bytes[o] !== OP_NAND) {
      throw new Error(`unsupported opcode 0x${bytes[o].toString(16)} at byte ${o} (Lineage genomes are NAND-only)`);
    }
    gates.push({ a: readU24(bytes, o + 1), b: readU24(bytes, o + 4) });
  }
  validateGates(gates, nIn);
  return gates;
}

/** Throws if any gate reads a signal at or after its own output. */
export function validateGates(gates: readonly Gate[], nIn: number): void {
  const base = firstGateSignal(nIn);
  gates.forEach((g, i) => {
    const self = base + i;
    if (!isIndex(g.a) || !isIndex(g.b) || g.a >= self || g.b >= self) {
      throw new Error(`NAND: future signal at gate ${i} (a=${g.a}, b=${g.b}, self=${self})`);
    }
  });
}

/**
 * A netlist compiled for fast repeated evaluation (the arena calls this
 * thousands of times per tournament). Mirrors TapeOut's `eval` exactly.
 */
export interface CompiledCircuit {
  readonly nIn: number;
  readonly nOut: number;
  readonly gateCount: number;
  /** Evaluates one input vector (array of 0/1, LSB = input 0) into output bits. */
  run(inputs: ArrayLike<number>): Uint8Array;
}

export function compile(gates: readonly Gate[], nIn: number, nOut: number): CompiledCircuit {
  validateGates(gates, nIn);
  if (nOut < 1) throw new Error('no outputs');
  if (gates.length < nOut) throw new Error('too few signals for outputs');

  const base = firstGateSignal(nIn);
  const n = gates.length;
  const as = Int32Array.from(gates, (g) => g.a);
  const bs = Int32Array.from(gates, (g) => g.b);
  const signals = new Uint8Array(base + n);
  signals[1] = 1;

  return {
    nIn,
    nOut,
    gateCount: n,
    run(inputs) {
      for (let i = 0; i < nIn; i++) signals[2 + i] = inputs[i] ? 1 : 0;
      for (let i = 0; i < n; i++) {
        signals[base + i] = signals[as[i]] & signals[bs[i]] ? 0 : 1;
      }
      return signals.slice(base + n - nOut, base + n);
    },
  };
}

/** Packs bits LSB-first into bytes, the format `eval(id, inputs)` expects. */
export function packBits(bits: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) out[i >> 3] |= 1 << (i & 7);
  return out;
}

/** Unpacks `count` bits LSB-first, the format `eval` returns. */
export function unpackBits(bytes: Uint8Array, count: number): Uint8Array {
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) out[i] = ((bytes[i >> 3] ?? 0) >> (i & 7)) & 1;
  return out;
}

export function toHex(bytes: Uint8Array): `0x${string}` {
  let s = '0x';
  for (const byte of bytes) s += byte.toString(16).padStart(2, '0');
  return s as `0x${string}`;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) throw new Error('invalid hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const isIndex = (x: number) => Number.isInteger(x) && x >= 0 && x <= U24_MAX;

function writeU24(buf: Uint8Array, at: number, v: number) {
  if (!isIndex(v)) throw new RangeError(`signal index out of u24 range: ${v}`);
  buf[at] = (v >>> 16) & 0xff;
  buf[at + 1] = (v >>> 8) & 0xff;
  buf[at + 2] = v & 0xff;
}

function readU24(buf: Uint8Array, at: number): number {
  return (buf[at] << 16) | (buf[at + 1] << 8) | buf[at + 2];
}
