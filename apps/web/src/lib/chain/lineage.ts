import { breed, decodeNetlist, encodeNetlist, FOUNDERS, fromHex, N_IN, packBits, toHex, type Frame, type Gate } from '@lineage/core';
import {
  BaseError,
  ContractFunctionRevertedError,
  parseEventLogs,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import type { Creature } from '../collection';
import { circuitsAbi, lineageAbi } from './abi';
import { LINEAGE_ADDRESS } from './config';
import { publicClient, type Connection } from './wallet';

const PAGE = 50;
/** Never hang the UI on a dropped RPC response; X Layer blocks are ~1s. */
const RECEIPT_TIMEOUT_MS = 90_000;

function lineageAddress(): Address {
  if (!LINEAGE_ADDRESS) throw new Error('Lineage contract is not configured.');
  return LINEAGE_ADDRESS;
}

export const chainId = (circuitId: number | bigint) => `C${circuitId}`;

/**
 * Loads every creature from the Lineage contract (paged view, because X Layer
 * RPCs cap eth_getLogs at 100 blocks), then re-derives each bred creature from
 * its parents and seed to check its lineage is honest.
 */
export async function loadChainCreatures(): Promise<Creature[]> {
  const address = lineageAddress();
  const count = Number(await publicClient.readContract({ address, abi: lineageAbi, functionName: 'creatureCount' }));

  const pages = await Promise.all(
    Array.from({ length: Math.ceil(count / PAGE) }, (_, i) =>
      publicClient.readContract({ address, abi: lineageAbi, functionName: 'creatures', args: [BigInt(i * PAGE), BigInt(PAGE)] }),
    ),
  );

  const creatures: Creature[] = pages.flat().map((v) => {
    const bred = v.eggId > 0n;
    // Founders keep their names: match generation-0 genomes against the known founders.
    const founder = bred ? undefined : FOUNDERS.find((f) => toHex(encodeNetlist(f.gates)) === v.netlist.toLowerCase());
    return {
      id: chainId(v.id),
      circuitId: Number(v.id),
      owner: v.owner,
      gates: decodeNetlist(fromHex(v.netlist), N_IN),
      generation: v.generation,
      source: 'chain' as const,
      title: founder?.name,
      epithet: founder?.epithet,
      parents: bred ? ([chainId(v.parentA), chainId(v.parentB)] as [string, string]) : undefined,
      seed: bred ? v.seed : undefined,
      studFee: v.studFee,
      bornAt: 0,
    };
  });

  const byId = new Map(creatures.map((c) => [c.id, c]));
  for (const c of creatures) {
    if (!c.parents || !c.seed) continue;
    const [a, b] = c.parents.map((p) => byId.get(p));
    c.lineageVerified = !!a && !!b && sameGates(breed(a.gates, b.gates, c.seed).gates, c.gates);
  }
  return creatures;
}

export interface PendingEgg {
  eggId: bigint;
  parentA: string;
  parentB: string;
  seed: Hex;
}

/** Eggs this account laid but never hatched (e.g. the tab was closed in between). */
export async function loadPendingEggs(account: Address): Promise<PendingEgg[]> {
  const address = lineageAddress();
  const ids = await publicClient.readContract({ address, abi: lineageAbi, functionName: 'eggsOf', args: [account] });
  const eggs = await Promise.all(ids.map((id) => publicClient.readContract({ address, abi: lineageAbi, functionName: 'egg', args: [id] })));
  return eggs
    .map((e, i) => ({ e, eggId: ids[i] }))
    .filter(({ e }) => e.hatchedAs === 0n)
    .map(({ e, eggId }) => ({ eggId, parentA: chainId(e.parentA), parentB: chainId(e.parentB), seed: e.seed }));
}

export async function quoteLayEgg(parentA: number, parentB: number, account: Address): Promise<bigint> {
  return publicClient.readContract({
    address: lineageAddress(),
    abi: lineageAbi,
    functionName: 'layCost',
    args: [BigInt(parentA), BigInt(parentB), account],
  });
}

export async function quoteHatch(): Promise<bigint> {
  return publicClient.readContract({ address: lineageAddress(), abi: lineageAbi, functionName: 'hatchCost' });
}

export async function layEgg(conn: Connection, parentA: number, parentB: number): Promise<PendingEgg & { hash: Hash }> {
  const address = lineageAddress();
  const value = await quoteLayEgg(parentA, parentB, conn.account);
  const { request } = await publicClient.simulateContract({
    account: conn.account,
    address,
    abi: lineageAbi,
    functionName: 'layEgg',
    args: [BigInt(parentA), BigInt(parentB)],
    value,
  });
  const hash = await conn.wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
  const [laid] = parseEventLogs({ abi: lineageAbi, logs: receipt.logs, eventName: 'EggLaid' });
  if (!laid) throw new Error('Egg transaction succeeded but no EggLaid event was found.');
  return { hash, eggId: laid.args.eggId, parentA: chainId(laid.args.parentA), parentB: chainId(laid.args.parentB), seed: laid.args.seed };
}

export async function hatch(conn: Connection, eggId: bigint, gates: readonly Gate[]): Promise<{ hash: Hash; circuitId: number }> {
  const address = lineageAddress();
  const value = await quoteHatch();
  const { request } = await publicClient.simulateContract({
    account: conn.account,
    address,
    abi: lineageAbi,
    functionName: 'hatch',
    args: [eggId, toHex(encodeNetlist(gates))],
    value,
  });
  const hash = await conn.wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
  const [hatched] = parseEventLogs({ abi: lineageAbi, logs: receipt.logs, eventName: 'Hatched' });
  if (!hatched) throw new Error('Hatch transaction succeeded but no Hatched event was found.');
  return { hash, circuitId: Number(hatched.args.circuitId) };
}

export interface BattleVerification {
  checked: number;
  mismatches: number;
}

/**
 * Re-runs every decision of a recorded battle through TapeOut's on-chain
 * eval() (one multicall), and compares it with what the simulator used.
 */
export async function verifyBattleOnChain(circuitIds: [number, number], frames: readonly Frame[]): Promise<BattleVerification> {
  const circuits = await publicClient.readContract({ address: lineageAddress(), abi: lineageAbi, functionName: 'circuits' });
  const calls = frames.flatMap((f) =>
    ([0, 1] as const).map((who) => ({
      address: circuits,
      abi: circuitsAbi,
      functionName: 'eval' as const,
      args: [BigInt(circuitIds[who]), toHex(packBits(f.inputs[who]))] as const,
    })),
  );
  const results = await publicClient.multicall({ contracts: calls, allowFailure: false });
  let mismatches = 0;
  results.forEach((out, i) => {
    const frame = frames[Math.floor(i / 2)];
    if (out !== toHex(packBits(frame.outputs[i % 2]))) mismatches++;
  });
  return { checked: results.length, mismatches };
}

/** Turns wallet/contract errors into one readable sentence. */
export function describeChainError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return 'You cancelled the request in your wallet.';
    if (err.walk((e) => e instanceof WaitForTransactionReceiptTimeoutError))
      return 'Your transaction was sent but X Layer has not confirmed it yet. Refresh in a minute; eggs and creatures are never lost.';
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) {
      const messages: Record<string, string> = {
        OutOfNand: 'The hatchery is out of NAND transistors. Please try again later.',
        WrongPayment: 'Fees changed while you were confirming. Please try again.',
        AlreadyHatched: 'This egg has already hatched.',
        NotCreature: 'One of the parents is not a Lineage creature.',
        SameParent: 'Pick two different parents.',
      };
      return messages[revert.data.errorName] ?? `The contract rejected this (${revert.data.errorName}).`;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

function sameGates(a: readonly Gate[], b: readonly Gate[]): boolean {
  return a.length === b.length && a.every((g, i) => g.a === b[i].a && g.b === b[i].b);
}
