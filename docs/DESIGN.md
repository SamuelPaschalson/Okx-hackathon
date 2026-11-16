# Lineage — Design

Creatures whose DNA is a real TapeOut circuit on X Layer. Players breed them
(every child is a newly taped-out circuit), and the creatures fight in a
deterministic arena where every decision is the circuit's own `eval()`.

## Why this exists (product)

| | |
|---|---|
| **Problem** | Every TapeOut product so far assumes you can design logic circuits. That caps the ecosystem at hardware nerds. |
| **Insight** | You don't have to *design* circuits to *produce* them. Breeding is a design tool anyone already understands. |
| **Users** | Web3 gamers (OKX Wallet / X Layer users) first; collectors of on-chain generative art; CS/EE students who want to see logic come alive. |
| **Reach** | X Layer + TapeOut community channels, Demo Day, shareable battle replays (every replay is a link that re-simulates from chain data). |
| **Revenue** | (1) Breeding fee per egg. (2) Lineage processor's transistor `mintPrice`: every birth burns our NAND, so TapeOut pays the creator per gate. (3) Stud fees: owners set a price to breed with their champion, the protocol takes a cut. (4) Season entry / prize pools. |
| **Retention** | The meta never settles: the founders form a counter-cycle (Grazer → Tortoise → Ambusher → Grazer), and evolution keeps finding counters to whatever is on top. Seasons reset the leaderboard. |
| **Ecosystem value** | Every birth = 1 tapeout + N transistors burned. Non-engineers become circuit producers. |

## Core rules (the contract between components)

* **Pinout** (fixed, so any two creatures can breed and fight): 10 sensor inputs,
  3 outputs. See `SENSORS` / `GENES` in `packages/core/src/genome.ts`.
* **Genome = netlist.** The NAND-only netlist taped out on X Layer is the only
  source of truth. Max 64 gates (cost + gas bound).
* **Canonical form.** `toNetlist()` prunes dead gates, folds constants, merges
  duplicates, and guarantees the outputs are the last 3 signals (a TapeOut rule).
* **Breeding** (`breed(parentA, parentB, seed)`): each gene's whole logic cone
  comes from one parent; then 1–3 small mutations. Fully deterministic from
  the seed → lineage is verifiable by anyone.
* **Arena** (`battle(a, b, seed)`): 9×9 grid, 60 ticks, simultaneous moves.
  Food +3, steal 3 and grab the victim, shell bounces attackers (−3) but costs
  2 per tick, head-on clash −1 each, contested cells go to the stronger.
* **Tournament** (`roundRobin(entrants, seasonSeed)`): every pair twice with
  sides swapped. Pure function → the leaderboard needs no server.

## Verification story

1. `packages/core` evaluator ≡ TapeOut `eval()` — checked against **33 live
   circuits on X Layer mainnet** (`npm run test:onchain --workspace @lineage/core`).
2. A battle replay records each tick's input bits; the UI prints the exact
   `eval(id, inputs) → outputs` call, so any decision can be checked on-chain
   with a free view call.
3. Children are reproducible from (parents, seed); the seed comes from the
   contract when the egg is laid, so breeders can't reroll.

## Architecture

```
packages/core   pure TS, zero runtime deps — netlist codec, builder, genome,
                breed, arena, tournament, identity. Unit + fuzz + on-chain tests.
apps/web        React + Vite + Tailwind. Imports core source directly.
contracts/      (milestone 2) Lineage.sol — eggs, hatching, lineage, fees.
```

No backend. Chain is the database; everything else is a deterministic function of it.

## Milestone 2 — on-chain (next)

**Setup (once, by us):** `createCPU("Lineage", "LNG", story, supply, mintPrice)`
on the TapeOut factory → our transistors + circuits contracts. Tape out the 5
founders as circuit ids 1–5.

**`Lineage.sol`** (small, non-upgradeable):

```
layEgg(parentA, parentB) payable        // fee + stud fees; requires both are Lineage creatures
  -> eggId; seed = keccak(prevrandao, blockhash(n-1), parents, sender, eggId)
hatch(eggId, bytes netlist) payable     // only egg owner, within N blocks
  -> mints NAND on our CPU, tapeout(netlist, 10, 3), records parents+seed,
     transfers the Circuit NFT to the breeder
setStudFee(circuitId, price)            // owner of a creature
creature(circuitId) view -> (parentA, parentB, generation, seed, eggId)
```

* The contract does not re-run `breed()` (too costly). Instead the client
  re-derives every child from (parents, seed) and marks mismatches
  "unverified lineage". Honest UI, zero extra gas.
* Hatching through the contract = 2 transactions for the user (lay, hatch),
  which is also the natural game loop (egg → hatch).
* Gate cap enforced on hatch via `circuitInfo(id).gateCount <= 64`.

**Web:** wallet connect (OKX Wallet / injected, viem + wagmi), read creatures via
`TapedOut` events + `netlist(id)`, "Verify on-chain" button that replays a
battle through `eval` (multicall per tick).

**Deploy:** static build (59 kB gzip) to TapeOut **DeWEB** (`tape://`), so the
game itself lives on X Layer.

## Known trade-offs

* Combinational brains only (no LATCH memory) — simpler, `eval` instead of
  `step`, and evolution still finds varied strategies. LATCH "memory genes"
  are a natural v2.
* Season results vary with the seed (2 legs per pair). More legs = more stable
  ranks at linear cost; tune once there are real populations.
* TapeOut's X Layer contracts are upgradeable/unaudited and not on testnet;
  development uses an anvil mainnet fork.
