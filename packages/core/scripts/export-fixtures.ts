/**
 * Writes contracts/fixtures/lineage.json from @lineage/core, the single source
 * of truth for founder genomes. Used by the Foundry fork test (which checks
 * TapeOut's on-chain eval against these vectors) and by the deploy script.
 *
 *   npm run fixtures --workspace @lineage/core
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGenome, encodeNetlist, FOUNDERS, N_IN, packBits, Rng, toHex } from '../src';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../contracts/fixtures/lineage.json');
const rng = new Rng(['fixtures']);

const founders = FOUNDERS.map((f) => {
  const circuit = compileGenome(f.gates);
  const vectors = Array.from({ length: 8 }, () => {
    const bits = Uint8Array.from({ length: N_IN }, () => rng.int(2));
    return { input: toHex(packBits(bits)), output: toHex(packBits(circuit.run(bits))) };
  });
  return { name: f.name, gates: f.gates.length, netlist: toHex(encodeNetlist(f.gates)), vectors };
});

mkdirSync(dirname(out), { recursive: true });
// Foundry's vm.parseJson needs keys in a stable shape; arrays of objects are fine.
writeFileSync(out, JSON.stringify({ founders }, null, 2) + '\n');
console.log(`wrote ${founders.length} founders to ${out}`);
