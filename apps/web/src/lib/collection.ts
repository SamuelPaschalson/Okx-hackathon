import { FOUNDERS, identityOf, type Gate, type Identity, type Mutation, type Parent } from '@lineage/core';
import { useCallback, useEffect, useState } from 'react';

/**
 * A creature as the app sees it. In this milestone bred creatures live in the
 * browser ("local"); once hatched through the Lineage contract they become
 * "chain" creatures identified by their TapeOut circuit id.
 */
export interface Creature {
  id: string;
  gates: Gate[];
  generation: number;
  source: 'founder' | 'local' | 'chain';
  /** Display name for founders; bred creatures use their genome-derived name. */
  title?: string;
  epithet?: string;
  parents?: [string, string];
  inherited?: Parent[];
  mutations?: Mutation[];
  /** Breeding seed (bytes32 hex). Re-running breed(parents, seed) reproduces this creature. */
  seed?: string;
  bornAt: number;
}

export const nameOf = (c: Creature, id: Identity = identityOf(c.gates)) => c.title ?? id.name;

const FOUNDER_CREATURES: Creature[] = FOUNDERS.map((f, i) => ({
  id: `F${i + 1}`,
  gates: f.gates,
  generation: 0,
  source: 'founder',
  title: f.name,
  epithet: f.epithet,
  bornAt: 0,
}));

const STORAGE_KEY = 'lineage.local-creatures.v1';

function loadLocal(): Creature[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isCreature) : [];
  } catch {
    return [];
  }
}

function saveLocal(creatures: Creature[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creatures));
  } catch {
    // Storage full or blocked (private mode): creatures survive until reload.
  }
}

function isCreature(x: unknown): x is Creature {
  const c = x as Creature;
  return (
    !!c &&
    typeof c.id === 'string' &&
    Array.isArray(c.gates) &&
    c.gates.every((g) => Number.isInteger(g?.a) && Number.isInteger(g?.b)) &&
    typeof c.generation === 'number'
  );
}

export function useCollection() {
  const [local, setLocal] = useState<Creature[]>(loadLocal);

  useEffect(() => saveLocal(local), [local]);

  const add = useCallback((c: Creature) => setLocal((prev) => [...prev, c]), []);
  const release = useCallback((id: string) => setLocal((prev) => prev.filter((c) => c.id !== id)), []);

  return { creatures: [...FOUNDER_CREATURES, ...local], add, release };
}

/** 32 random bytes as hex. Local stand-in for the seed the Lineage contract assigns to an egg. */
export function randomSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return '0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
