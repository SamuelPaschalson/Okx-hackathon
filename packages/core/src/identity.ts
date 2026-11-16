import { encodeNetlist, type Gate } from './netlist';
import { Rng } from './rng';

/**
 * Cosmetic identity derived from the genome bytes, so a creature looks and is
 * named the same everywhere, with nothing stored off-chain.
 */
export interface Identity {
  name: string;
  /** HSL hues for body and accent. */
  hue: number;
  accentHue: number;
  /** 0-3, picks the body silhouette. */
  shape: number;
  /** Short hex fingerprint of the genome. */
  fingerprint: string;
}

const ONSETS = ['b', 'k', 'v', 'z', 'm', 'r', 'th', 'sk', 'gl', 'n', 'p', 'dr', 'qu', 'x', 'l', 's'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ae', 'y', 'oo'];
const CODAS = ['', 'n', 'x', 'r', 'th', 'k', 'l', 's'];

export function identityOf(gates: readonly Gate[]): Identity {
  const fp = fnv1a(encodeNetlist(gates));
  const rng = new Rng([fp, gates.length]);
  const syllables = 2 + rng.int(2);
  let name = '';
  for (let i = 0; i < syllables; i++) name += rng.pick(ONSETS) + rng.pick(VOWELS) + (i === syllables - 1 ? rng.pick(CODAS) : '');
  return {
    name: name[0].toUpperCase() + name.slice(1),
    hue: rng.int(360),
    accentHue: rng.int(360),
    shape: rng.int(4),
    fingerprint: fp.toString(16).padStart(8, '0'),
  };
}

function fnv1a(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (const byte of bytes) h = Math.imul(h ^ byte, 0x01000193);
  return h >>> 0;
}
