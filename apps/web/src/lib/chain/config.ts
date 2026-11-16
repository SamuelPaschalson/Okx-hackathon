import { defineChain, getAddress, isAddress, type Address } from 'viem';
import { xLayer } from 'viem/chains';

/**
 * Chain configuration from Vite env. Without VITE_LINEAGE_ADDRESS the app runs
 * in local sandbox mode only, so it never breaks for someone who just clones and runs it.
 *
 * Local testing uses a mainnet fork under its OWN chain id (31337). Reusing 196
 * would be dangerous: the wallet would route "test" transactions to real X Layer.
 */
const rawAddress = import.meta.env.VITE_LINEAGE_ADDRESS as string | undefined;
const rpcOverride = import.meta.env.VITE_RPC_URL as string | undefined;
const chainIdOverride = Number(import.meta.env.VITE_CHAIN_ID ?? xLayer.id);

export const LINEAGE_ADDRESS: Address | null = rawAddress && isAddress(rawAddress) ? getAddress(rawAddress) : null;

export const isLocalFork = chainIdOverride !== xLayer.id;

if (isLocalFork && !rpcOverride) {
  throw new Error('VITE_CHAIN_ID is set to a local chain, so VITE_RPC_URL must point at the local fork.');
}

export const chain = isLocalFork
  ? defineChain({
      id: chainIdOverride,
      name: 'Lineage local (X Layer fork)',
      nativeCurrency: xLayer.nativeCurrency,
      rpcUrls: { default: { http: [rpcOverride!] } },
      // The fork has mainnet's Multicall3; battle verification batches eval() through it.
      contracts: xLayer.contracts,
    })
  : rpcOverride
    ? defineChain({ ...xLayer, rpcUrls: { default: { http: [rpcOverride] } } })
    : xLayer;

export const chainEnabled = LINEAGE_ADDRESS !== null;

const EXPLORER = 'https://www.okx.com/web3/explorer/xlayer';
/** Explorer link, or null on a local fork (nothing to link to). */
export const explorerTx = (hash: string): string | null => (isLocalFork ? null : `${EXPLORER}/tx/${hash}`);
