import { useCallback, useEffect, useState } from 'react';
import type { Creature } from '../collection';
import { chainEnabled } from './config';
import { describeChainError, loadChainCreatures } from './lineage';
import { connectWallet, injectedProvider, type Connection } from './wallet';

export function useWallet() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      setConnection(await connectWallet());
    } catch (err) {
      setError(describeChainError(err));
    } finally {
      setConnecting(false);
    }
  }, []);

  // An account or network switch in the wallet invalidates the session; ask to reconnect.
  useEffect(() => {
    const provider = injectedProvider();
    if (!provider) return;
    const reset = () => setConnection(null);
    provider.on('accountsChanged', reset);
    provider.on('chainChanged', reset);
    return () => {
      provider.removeListener('accountsChanged', reset);
      provider.removeListener('chainChanged', reset);
    };
  }, []);

  return { connection, connecting, error, connect };
}

type Status = 'disabled' | 'loading' | 'ready' | 'error';

export function useChainCreatures() {
  const [creatures, setCreatures] = useState<Creature[]>([]);
  const [status, setStatus] = useState<Status>(chainEnabled ? 'loading' : 'disabled');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!chainEnabled) return;
    setStatus('loading');
    try {
      setCreatures(await loadChainCreatures());
      setError(null);
      setStatus('ready');
    } catch (err) {
      setError(describeChainError(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { creatures, status, error, refresh };
}
