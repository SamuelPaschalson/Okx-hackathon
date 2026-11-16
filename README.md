# Lineage

Creatures whose DNA is a real NAND circuit taped out on **X Layer** with
**TapeOut**. Breed two creatures and their child is a brand-new circuit. Send it
to the Pit and watch it think, gate by gate. Every decision is reproducible
with a free `eval()` call on-chain.

X Layer TapeOut Accelerate hackathon entry. Design and roadmap: [docs/DESIGN.md](docs/DESIGN.md).

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
| `apps/web` | React + Vite + Tailwind UI. |

## Status

- [x] Core engine, verified against 33 live circuits on X Layer mainnet
- [x] Web app: hatchery, battle replay with brain scan, season rankings (local mode)
- [ ] `Lineage.sol` + wallet: lay eggs / hatch on-chain (milestone 2)
- [ ] Deploy to TapeOut DeWEB
