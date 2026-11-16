# Testing Lineage locally

Everything here runs on your machine. **Nothing costs real money** and nothing
touches real X Layer. The on-chain part uses a local copy ("fork") of X Layer
mainnet, with the real TapeOut contracts in it, under its own network id 31337.

Run every command from the **repo root** (`C:\Work\Okx-hackathon`), in
PowerShell, cmd or Git Bash. If you run them from `apps/web`, npm can't find
the scripts.

---

## 0. What you need (one time)

| Tool | Check | Get it |
|---|---|---|
| Node.js 20+ | `node -v` | https://nodejs.org |
| Foundry (anvil, forge) | `Test-Path $env:USERPROFILE\.foundry\bin\anvil.exe` | https://book.getfoundry.sh/getting-started/installation |
| A browser wallet | — | OKX Wallet extension (recommended) or MetaMask |
| Internet | — | the fork downloads mainnet state on demand |

Then install dependencies once:

```powershell
npm install
```

---

## Part A: Sandbox mode (2 minutes, no wallet)

This is the game without any blockchain. It's the quickest way to check the
gameplay.

> If `apps/web/.env.local` exists, rename or delete it first, otherwise the app
> starts in on-chain mode.

```powershell
npm run dev
```

Open **http://localhost:5173** and check:

- [ ] **Hatchery** shows 5 founders (Grazer, Bandit, Tortoise, Opportunist, Ambusher).
- [ ] Pick two, **Lay egg** → **Hatch** → a child appears with gene sources and mutations.
- [ ] **Send to the Pit** → the battle plays; senses, genes and `eval(...)` update every tick.
- [ ] Pause, scrub the slider, change speed, **Rematch**.
- [ ] **Rankings** → **Run season** → a table appears within a second.
- [ ] Reload the page → your bred child is still there.
- [ ] Narrow the browser window (or use phone view in DevTools) → the layout still works.

Stop with `Ctrl+C`.

---

## Part B: On-chain mode on the local fork (10 minutes)

You need **two terminals**, both in the repo root.

### B1. Terminal 1: start the local chain (leave it running)

```powershell
npm run local:chain
```

Wait until it prints `Listening on 127.0.0.1:8545`.

### B2. Terminal 2: deploy, fund your wallet, start the app

```powershell
npm run local:deploy
npm run local:fund -- 0xYOUR_WALLET_ADDRESS
npm run dev
```

- `local:deploy` creates the Lineage processor on TapeOut, deploys the contract,
  stocks it with NAND, tapes out the 5 founders, and writes `apps/web/.env.local`.
- `local:fund` gives your wallet 10 **test** OKB on the local chain only.
  Copy your address from the wallet; you don't need any private key.

### B3. Connect your wallet

1. Open **http://localhost:5173**. You should see an amber banner: *"Local test network…"*.
2. Click **Connect wallet** and approve.
3. The wallet asks to **add and switch to "Lineage local (X Layer fork)"**. Approve.

If your wallet won't add it automatically, add a custom network by hand:

| Field | Value |
|---|---|
| Network name | Lineage local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `OKB` |

> Never test with the network set to the real "X Layer" (chain 196). The app
> only talks to 31337 in this mode, and that's deliberate.

### B4. Test checklist

- [ ] The founders show **Circuit #1–#5** badges (loaded from the chain).
- [ ] Pick two founders → the button reads **Lay egg on X Layer · 0.002 OKB**.
- [ ] Click it → confirm in the wallet → a wobbling egg shows `egg #N · seed 0x…`.
- [ ] **Hatch on X Layer · 0.0013 OKB** → confirm → *"… is born"* with a circuit number.
- [ ] Reload → the child is listed with **Circuit #6** and **Lineage verified**.
- [ ] Breed the child with a founder → its child is **Gen 2**.
- [ ] **The Pit** with two on-chain creatures → **Verify on X Layer** →
      *"✓ All N decisions match TapeOut's on-chain eval()"*.
- [ ] **Recovery:** lay an egg, then reload **before** hatching → the hatchery shows
      *"You have an unhatched egg"* → **resume** → hatch.
- [ ] **Cancel:** start a lay, reject it in the wallet → *"You cancelled the request…"* and nothing breaks.
- [ ] **Sandbox still works:** **Try a free sandbox breed first** → the child shows *"Local · not on-chain"*.
- [ ] Wallet balance dropped by about 0.0033 OKB per breed (test OKB).

### B5. Stopping and restarting

- `Ctrl+C` in both terminals. **Stopping the chain wipes all local state.**
- After a restart, run `npm run local:deploy` and `npm run local:fund -- 0x…` again.
- If the wallet then says **"nonce too high"** or a transaction hangs, the wallet
  remembers the old chain. Clear its activity for that network: in MetaMask,
  *Settings → Advanced → Clear activity tab data*; in OKX Wallet, remove and
  re-add the "Lineage local" network.

---

## Part C: Automated checks (optional, about 1 minute)

```powershell
npm test                 # game engine: 27 tests (genome, breeding, arena, seasons)
npm run test:contracts   # Lineage.sol: 16 unit tests
npm run test:fork        # Lineage against the REAL TapeOut contracts on a mainnet fork (needs internet)
```

All three should end with every test passing.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing script: "local:deploy"` | You're not in the repo root. `cd C:\Work\Okx-hackathon`. |
| `No local chain at http://127.0.0.1:8545` | Terminal 1 isn't running `npm run local:chain`, or it stopped. |
| `anvil not found` / `forge not found` | Install Foundry, then open a new terminal. |
| Banner *"Couldn't load creatures from X Layer"* | The chain was restarted: run `local:deploy` again, then reload. |
| Port 8545 or 5173 already in use | Close the other program, or set `LOCAL_PORT=8546` for the local:* commands. |
| `local:chain` fails to fork | Internet or X Layer RPC hiccup. Try again, or set `XLAYER_RPC` to another X Layer RPC URL. |
| Wallet shows real X Layer balances | You're on chain 196. Switch to "Lineage local" (31337). |

---

## What to send back after testing

- Which checklist items failed, with a screenshot.
- Anything confusing in the flow (wording, steps, waiting).
- Your wallet (OKX or MetaMask) and browser.

Once you're happy, the next steps are the mainnet deploy and the submission (see `docs/DESIGN.md`).
