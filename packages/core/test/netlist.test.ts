import { describe, expect, it } from 'vitest';
import { compile, decodeNetlist, encodeNetlist, fromHex, packBits, toHex, unpackBits } from '../src/netlist';

describe('netlist codec (TapeOut wire format)', () => {
  // TapeOut's AND neuron as published on X Layer: NAND(3,2) then NOT.
  const AND_HEX = '0x0000000300000200000004000004';

  it('decodes the on-chain AND circuit and evaluates its truth table', () => {
    const gates = decodeNetlist(fromHex(AND_HEX), 2);
    expect(gates).toEqual([
      { a: 3, b: 2 },
      { a: 4, b: 4 },
    ]);
    const and = compile(gates, 2, 1);
    expect([0, 1, 2, 3].map((v) => and.run([v & 1, v >> 1])[0])).toEqual([0, 0, 0, 1]);
  });

  it('round-trips encode/decode byte-for-byte', () => {
    const gates = decodeNetlist(fromHex(AND_HEX), 2);
    expect(toHex(encodeNetlist(gates))).toBe(AND_HEX);
  });

  it('matches the 4-NAND XOR layout TapeOut uses (output on last signal)', () => {
    // n4 = NAND(a,b); n5 = NAND(a,n4); n6 = NAND(b,n4); n7 = NAND(n5,n6)
    const xor = compile(
      [
        { a: 2, b: 3 },
        { a: 2, b: 4 },
        { a: 3, b: 4 },
        { a: 5, b: 6 },
      ],
      2,
      1,
    );
    expect([0, 1, 2, 3].map((v) => xor.run([v & 1, v >> 1])[0])).toEqual([0, 1, 1, 0]);
  });

  it('rejects the same netlists the contract rejects', () => {
    // NAND reading its own output -> "NAND: future signal"
    expect(() => decodeNetlist(fromHex('0x00000004000002'), 2)).toThrow(/future signal/);
    // LATCH / REF are not part of a Lineage genome
    expect(() => decodeNetlist(fromHex('0x01000002000000'), 2)).toThrow(/unsupported opcode/);
    // truncated
    expect(() => decodeNetlist(fromHex('0x000000'), 2)).toThrow(/multiple/);
    // fewer gates than outputs -> "too few signals for outputs"
    expect(() => compile([{ a: 2, b: 2 }], 2, 2)).toThrow(/too few/);
  });

  it('packs eval I/O least-significant-bit first', () => {
    // From the X Layer half adder: eval(0x03) -> inputs a=1, b=1
    expect(Array.from(unpackBits(fromHex('0x03'), 2))).toEqual([1, 1]);
    expect(toHex(packBits([0, 1]))).toBe('0x02');
    expect(toHex(packBits([1, 0, 0, 0, 0, 0, 0, 0, 0, 1]))).toBe('0x0102');
  });
});
