# Lineage

Creatures whose DNA is a real NAND circuit taped out on **X Layer** with
**TapeOut**. Breed two creatures and their child is a brand-new circuit. Send it
to the Pit and watch it think, gate by gate. Every decision is reproducible
with a free `eval()` call on-chain.

X Layer TapeOut Accelerate hackathon entry. Design and roadmap: [docs/DESIGN.md](docs/DESIGN.md). **Step-by-step local testing: [docs/TESTING.md](docs/TESTING.md).**

## Quick start

Requires Node 20+.

```bash
npm install
npm run dev          # web app at http://localhost:5173
npm test             # core unit + fuzz tests
npm run build        # production build -> apps/web/dist
```

Conformance against the live TapeOut contracts (read-only, needs network):

```bash
npm run test:onchain --workspace @lineage/core
```

Contracts ([Foundry](https://book.getfoundry.sh)):

```bash
cd contracts
forge test                                               # unit tests (offline)
XLAYER_RPC=https://rpc.xlayer.tech forge test --match-contract Fork   # real TapeOut on a fork
```

On-chain mode for the web app: copy `apps/web/.env.example` to `.env.local` and
set `VITE_LINEAGE_ADDRESS`. Without it the app runs in sandbox mode.

## Layout

| Path | What |
|---|---|
| `packages/core` | All game logic. Pure TypeScript, no runtime dependencies. |
| `packages/core/src/netlist.ts` | TapeOut wire format + evaluator (matches on-chain `eval`). |
| `packages/core/src/genome.ts` | Pinout, canonical netlist form. |
| `packages/core/src/breed.ts` | Crossover + mutation (deterministic from a seed). |
| `packages/core/src/arena.ts` | The Pit: battle rules. |
| `packages/core/src/tournament.ts` | Round-robin seasons. |
| `packages/core/src/founders.ts` | Generation-0 creatures. |
| `apps/web` | React + Vite + Tailwind UI; `src/lib/chain/` is the viem layer. |
| `contracts/src/Lineage.sol` | Eggs, hatching, lineage records, breed and stud fees. |
| `contracts/script/Deploy.s.sol` | Creates the processor, deploys, stocks NAND, seeds founders. |

## Status

- [x] Core engine, verified against 33 live circuits on X Layer mainnet
- [x] Web app: hatchery, battle replay with brain scan, season rankings
- [x] `Lineage.sol` + wallet flow: lay, hatch, lineage verification, on-chain battle verification (tested on a mainnet fork)
- [ ] Mainnet deploy (needs the operator wallet with ~0.01 OKB + 0.11 BEM)
- [ ] Host the frontend on TapeOut DeWEB
