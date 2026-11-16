import { describe, expect, it } from 'vitest';
import { ARENA, battle, decode, sense } from '../src/arena';
import { FOUNDERS } from '../src/founders';
import { compileGenome, toNetlist } from '../src/genome';
import { roundRobin } from '../src/tournament';

const byName = (n: string) => FOUNDERS.find((f) => f.name === n)!.gates;

/** A creature that always guards: shell output = constant 1. */
const turtleOnly = toNetlist({ gates: [], outputs: [0, 0, 1] });

describe('battle', () => {
  it('is fully deterministic', () => {
    const a = battle(byName('Grazer'), byName('Bandit'), ['s1'], { record: true });
    const b = battle(byName('Grazer'), byName('Bandit'), ['s1'], { record: true });
    expect(a).toEqual(b);
  });

  it('records frames whose outputs are exactly the circuit evaluated on the recorded inputs', () => {
    const brain = compileGenome(byName('Opportunist'));
    const r = battle(byName('Opportunist'), byName('Ambusher'), ['replay'], { record: true });
    expect(r.frames.length).toBe(r.ticks);
    for (const f of r.frames) {
      expect(Array.from(brain.run(f.inputs[0]))).toEqual(Array.from(f.outputs[0]));
      expect(decode(f.outputs[0])).toEqual(f.actions[0]);
    }
  });

  it('a creature that only guards starves to a knockout', () => {
    const r = battle(turtleOnly, byName('Grazer'), ['starve']);
    expect(r.knockout).toBe(true);
    expect(r.winner).toBe(1);
    expect(r.ticks).toBeLessThanOrEqual(ARENA.startEnergy);
  });

  it('a grazer out-eats a creature walking into the wall', () => {
    const northOnly = toNetlist({ gates: [], outputs: [0, 0, 0] });
    const r = battle(byName('Grazer'), northOnly, ['wall']);
    expect(r.winner).toBe(0);
  });

  it('energy never goes negative', () => {
    for (let s = 0; s < 30; s++) {
      const r = battle(byName('Bandit'), byName('Tortoise'), [s], { record: true });
      for (const f of r.frames) for (const p of f.fighters) expect(p.energy).toBeGreaterThanOrEqual(0);
      expect(Math.min(...r.energy)).toBeGreaterThanOrEqual(0);
    }
  });

  it('sensors encode relative positions', () => {
    const bits = sense(
      [
        { x: 1, y: 4, energy: 10 },
        { x: 2, y: 4, energy: 5 },
      ],
      [{ x: 0, y: 0 }],
      0,
    );
    // food west + north, rival east, richer, adjacent
    expect(Array.from(bits)).toEqual([0, 1, 0, 1, 1, 0, 0, 0, 1, 1]);
  });
});

describe('roundRobin', () => {
  const entrants = FOUNDERS.map((f, i) => ({ id: String(i + 1), gates: f.gates }));

  it('is deterministic and plays every pairing twice', () => {
    const a = roundRobin(entrants, 'season-1');
    expect(a).toEqual(roundRobin(entrants, 'season-1'));
    const games = a.reduce((n, s) => n + s.wins + s.draws + s.losses, 0);
    expect(games).toBe(entrants.length * (entrants.length - 1) * 2);
  });

  it('rejects duplicate ids', () => {
    expect(() => roundRobin([entrants[0], entrants[0]], 's')).toThrow(/duplicate/);
  });
});
