import { createPublicClient, createWalletClient, custom, http, numberToHex, type Address, type EIP1193Provider, type WalletClient } from 'viem';
import { chain } from './config';

export const publicClient = createPublicClient({ chain, transport: http() });

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
    okxwallet?: EIP1193Provider;
  }
}

/** OKX Wallet first (the X Layer audience), then any injected wallet. */
export function injectedProvider(): EIP1193Provider | null {
  if (typeof window === 'undefined') return null;
  return window.okxwallet ?? window.ethereum ?? null;
}

export interface Connection {
  account: Address;
  wallet: WalletClient;
}

export async function connectWallet(): Promise<Connection> {
  const provider = injectedProvider();
  if (!provider) throw new Error('No wallet found. Install OKX Wallet (or any browser wallet) to breed on-chain.');
  const [account] = (await provider.request({ method: 'eth_requestAccounts' })) as Address[];
  if (!account) throw new Error('No account was shared by the wallet.');
  await ensureChain(provider);
  return { account, wallet: createWalletClient({ account, chain, transport: custom(provider) }) };
}

/** Switches to X Layer, adding it to the wallet first if needed (EIP-3085 error 4902). */
async function ensureChain(provider: EIP1193Provider) {
  const chainId = numberToHex(chain.id);
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (err) {
    if ((err as { code?: number }).code !== 4902) throw err;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [...chain.rpcUrls.default.http],
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
        },
      ],
    });
  }
}
