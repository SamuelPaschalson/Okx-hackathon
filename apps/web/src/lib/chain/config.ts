import { defineChain, getAddress, isAddress, type Address } from 'viem';
import { xLayer } from 'viem/chains';

/**
 * Chain configuration from Vite env. Without VITE_LINEAGE_ADDRESS the app runs
 * in local sandbox mode only (milestone 1 behaviour), so it never breaks for
 * someone who just clones and runs it.
 */
const rawAddress = import.meta.env.VITE_LINEAGE_ADDRESS as string | undefined;
const rpcOverride = import.meta.env.VITE_RPC_URL as string | undefined;

export const LINEAGE_ADDRESS: Address | null = rawAddress && isAddress(rawAddress) ? getAddress(rawAddress) : null;

export const chain = rpcOverride
  ? defineChain({ ...xLayer, name: 'X Layer (custom RPC)', rpcUrls: { default: { http: [rpcOverride] } } })
  : xLayer;

export const chainEnabled = LINEAGE_ADDRESS !== null;

export const EXPLORER = 'https://www.okx.com/web3/explorer/xlayer';
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
