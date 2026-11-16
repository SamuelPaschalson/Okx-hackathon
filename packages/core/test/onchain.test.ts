/**
 * Conformance against the real TapeOut contracts on X Layer mainnet:
 * every NAND-only circuit on a processor is fetched, and our evaluator must
 * agree with the on-chain `eval()` on random inputs. Read-only (eth_call).
 *
 * Opt-in because it needs the network:  npm run test:onchain --workspace @lineage/core
 * Override target with LINEAGE_RPC / LINEAGE_CIRCUITS.
 */
import { describe, expect, it } from 'vitest';
import { compile, decodeNetlist, fromHex, packBits, toHex, unpackBits } from '../src/netlist';
import { Rng } from '../src/rng';

const RPCS = process.env.LINEAGE_RPC ? [process.env.LINEAGE_RPC] : ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'];
// Cerebr's processor: a public, diverse set of taped-out circuits.
const CIRCUITS = process.env.LINEAGE_CIRCUITS ?? '0xB04EB79D1A5EECaabAAfF7B77d7c27578EE693FF';
const enabled = import.meta.env.MODE === 'onchain' || process.env.LINEAGE_ONCHAIN === '1';

const SEL = { netlist: '3fc4be56', eval: '934d06ea', circuitInfo: '084d60f1', nextId: '61b8ce8c' };

describe.skipIf(!enabled)('on-chain conformance (X Layer mainnet)', () => {
  it('our evaluator matches TapeOut eval() bit-for-bit', { timeout: 300_000 }, async () => {
    const count = Number(BigInt(await call(SEL.nextId)));
    const rng = new Rng(['conformance']);
    let checked = 0;

    for (let id = 1; id <= count; id++) {
      const info = await call(SEL.circuitInfo + word(id));
      const [nIn, nOut, nState] = [0, 1, 2].map((k) => Number(BigInt('0x' + info.slice(2 + k * 64, 2 + (k + 1) * 64))));
      if (nState > 0) continue; // sequential: needs step(), out of scope

      const netlist = abiBytes(await call(SEL.netlist + word(id)));
      let gates;
      try {
        gates = decodeNetlist(netlist, nIn);
      } catch {
        continue; // uses REF; Lineage genomes never do
      }
      const circuit = compile(gates, nIn, nOut);

      for (let t = 0; t < 6; t++) {
        const bits = Uint8Array.from({ length: nIn }, () => rng.int(2));
        const packed = packBits(bits);
        const data = SEL.eval + word(id) + word(64) + word(packed.length) + toHex(packed).slice(2).padEnd(64, '0');
        const onchain = unpackBits(abiBytes(await call(data)), nOut);
        expect(Array.from(circuit.run(bits)), `circuit #${id} input ${toHex(packed)}`).toEqual(Array.from(onchain));
      }
      checked++;
    }
    console.log(`checked ${checked} NAND-only circuits of ${count}`);
    expect(checked).toBeGreaterThan(0);
  });
});

async function call(data: string, attempt = 0): Promise<string> {
  try {
    const res = await fetch(RPCS[attempt % RPCS.length], {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: CIRCUITS, data: '0x' + data }, 'latest'] }),
    });
    const json = (await res.json()) as { result?: string; error?: { message: string } };
    if (json.error) throw new Error(json.error.message);
    return json.result!;
  } catch (err) {
    if (attempt >= 4) throw err;
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return call(data, attempt + 1);
  }
}

const word = (n: number) => n.toString(16).padStart(64, '0');

/** Decodes an ABI-encoded single `bytes` return value. */
function abiBytes(hex: string): Uint8Array {
  const raw = fromHex(hex);
  const offset = Number(BigInt(toHex(raw.slice(0, 32))));
  const len = Number(BigInt(toHex(raw.slice(offset, offset + 32))));
  return raw.slice(offset + 32, offset + 32 + len);
}
