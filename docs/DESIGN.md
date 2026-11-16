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
contracts/      Foundry: Lineage.sol (eggs, hatching, lineage, fees), mocks,
                unit + mainnet-fork tests, deploy script. fixtures/ is generated
                from core (`npm run fixtures --workspace @lineage/core`).
```

No backend. Chain is the database; everything else is a deterministic function of it.

## On-chain (milestone 2)

### TapeOut facts that shaped the contract (checked on a mainnet fork, Nov 2026)

* TapeOut upgraded its factory after the Cerebr team's notes: **`createCPU` and
  transistor `mint` (for new CPUs) are now nonpayable and charged in BEM**
  (8 decimals; deploy 0.1 BEM, mint protocol fee 0.01 BEM per call).
* `tapeout` is unchanged: exactly `TAPEOUT_FEE` (0.0013 OKB), burns 1 NAND per gate from the caller.
* X Layer RPCs cap `eth_getLogs` at 100 blocks, so clients cannot rebuild state from events.

### `contracts/src/Lineage.sol` (non-upgradeable, ~300 lines)

```
layEgg(parentA, parentB) payable   breed fee + stud fees (pull payments), exact value
  -> eggId, seed = keccak(prevrandao, blockhash(n-1), parents, breeder, eggId, chainid)
hatch(eggId, bytes netlist) payable   egg's breeder only, exact TAPEOUT_FEE
  -> NAND-only 3..64 gates, tapeout from the contract's NAND stock,
     record (parents, generation, seed), NFT to the breeder
creatures(offset, limit) view      paged list incl. owner + netlist (replaces event scans)
seedFounder / setBreedFee / setStudFee / withdraw / eggsOf / layCost / hatchCost / nandStock
```

* **NAND stock instead of per-hatch minting.** Because minting costs BEM, the
  operator mints NAND in bulk once (mintPrice 0 → one 0.01 BEM fee for any
  amount) and deposits it into Lineage. Players only ever pay OKB.
  Top up when `nandStock()` runs low (each hatch uses 3–64).
* The contract does not re-run `breed()` (too costly). Clients re-derive every
  child from (parents, seed) and badge it "Lineage verified" or "unverified".
* The breeder cannot pick the seed. A sequencer could bias `prevrandao`, but
  every attempt costs a breed fee, which makes grinding uneconomic.

### Verified so far

| Check | Where |
|---|---|
| 16 unit tests incl. reentrancy, stock exhaustion, malformed netlists, fuzz | `contracts/test/Lineage.t.sol` |
| Real TapeOut on a mainnet fork: founders tape out; **on-chain `eval()` matches core on all 40 vectors**; lay + hatch | `contracts/test/LineageFork.t.sol` |
| Deploy script rehearsed on a fork: **≈0.0066 OKB + 0.11 BEM** total | `contracts/script/Deploy.s.sol` |
| Browser E2E on the fork: connect → lay → hatch → reload shows "Lineage verified" → battle verified on-chain | manual Playwright driver |

### Web

viem only (no wagmi). OKX Wallet first, then any injected wallet; adds/switches
to X Layer. Without `VITE_LINEAGE_ADDRESS` the app stays in sandbox mode.
Unhatched eggs are recovered from `eggsOf(account)`, so closing the tab between
laying and hatching loses nothing.

### Deploying (needs your wallet; not done yet)

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url xlayer --account <keystore> --broadcast   # XLAYER_RPC=https://rpc.xlayer.tech
```

Rehearse first without `--broadcast` (or on `anvil --fork-url https://rpc.xlayer.tech`).
Note: Anvil's default test account is EIP-7702-delegated on X Layer mainnet;
rehearse with a fresh key. Then set `VITE_LINEAGE_ADDRESS` and deploy the static
build to TapeOut **DeWEB**.

## Known trade-offs

* Combinational brains only (no LATCH memory) — simpler, `eval` instead of
  `step`, and evolution still finds varied strategies. LATCH "memory genes"
  are a natural v2.
* Season results vary with the seed (2 legs per pair). More legs = more stable
  ranks at linear cost; tune once there are real populations.
* TapeOut's X Layer contracts are upgradeable/unaudited and not on testnet;
  development uses an anvil mainnet fork. They changed fee mechanics during
  this hackathon, so `Lineage` reads every fee live and the fork test is the
  canary: run it before any deploy.
* The web bundle is 160 kB gzip with viem (59 kB without). Worth trimming
  before DeWEB if storage is priced per byte.
