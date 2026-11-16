import { useEffect, useState } from 'react';

export const SPEEDS = [
  { label: '1×', ms: 450 },
  { label: '2×', ms: 220 },
  { label: '4×', ms: 90 },
] as const;

/** Playback over `length` frames. Restarts from 0 whenever `resetKey` changes. */
export function useReplay(length: number, resetKey: string) {
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0);

  // New battle: rewind and autoplay. Keyed on the battle identity, not on `length`.
  useEffect(() => {
    setTick(0);
    setPlaying(true);
  }, [resetKey]);

  useEffect(() => {
    if (!playing) return;
    if (tick >= length - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setTick((x) => Math.min(x + 1, length - 1)), SPEEDS[speed].ms);
    return () => window.clearTimeout(t);
  }, [playing, tick, length, speed]);

  return {
    tick,
    playing,
    speed,
    done: tick >= length - 1,
    setSpeed,
    seek: (t: number) => {
      setPlaying(false);
      setTick(Math.max(0, Math.min(t, length - 1)));
    },
    toggle: () => {
      if (tick >= length - 1) setTick(0);
      setPlaying((p) => !p);
    },
  };
}
