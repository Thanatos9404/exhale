import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { seededRandom } from './random';

/** Largest seed the Park-Miller generator is defined for (its modulus minus one). */
const MAX_SEED = 2_147_483_646;

function take(seed: number, count: number): number[] {
  const rand = seededRandom(seed);
  return Array.from({ length: count }, () => rand());
}

describe('seededRandom', () => {
  it('gives the same sequence for the same seed', () => {
    expect(take(42, 200)).toEqual(take(42, 200));
  });

  it('keeps each generator independent of the others', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const fromA = [a(), a(), a()];
    // Drawing from `a` must not have moved `b` along.
    expect([b(), b(), b()]).toEqual(fromA);
  });

  it('gives different sequences for different seeds', () => {
    expect(take(7, 20)).not.toEqual(take(42, 20));
    expect(take(7, 20)).not.toEqual(take(11, 20));
  });

  it('is the minimal-standard generator: seed 1 reaches 1043618065 after 10,000 draws', () => {
    // The published check value for Park-Miller (multiplier 16807, modulus 2^31 - 1).
    const draws = take(1, 10_000);
    expect(draws[0]).toBe(16_806 / MAX_SEED);
    expect(draws.at(-1)).toBe((1_043_618_065 - 1) / MAX_SEED);
  });

  it('does not repeat itself over a particle field worth of draws', () => {
    const draws = take(42, 5000);
    expect(new Set(draws).size).toBe(draws.length);
  });

  it('spreads its draws evenly enough to fill a scene', () => {
    const draws = take(7, 20_000);
    const mean = draws.reduce((sum, v) => sum + v, 0) / draws.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
    for (let decile = 0; decile < 10; decile++) {
      const inDecile = draws.filter((v) => Math.floor(v * 10) === decile).length;
      expect(inDecile).toBeGreaterThan(1700);
      expect(inDecile).toBeLessThan(2300);
    }
  });

  it('stays in [0, 1) and is deterministic for every valid seed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_SEED }), (seed) => {
        const draws = take(seed, 64);
        for (const value of draws) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1);
        }
        expect(take(seed, 64)).toEqual(draws);
      }),
    );
  });

  it('can return exactly 0 but never 1, at the two ends of its state', () => {
    // 1407677000 is the inverse of 16807 modulo 2^31 - 1, so the first state is 1, the lowest.
    expect(seededRandom(1_407_677_000)()).toBe(0);
    // 2^31 - 2 is the highest state a draw can leave behind; this seed leads straight to it.
    const highest = seededRandom(MAX_SEED - 1_407_677_000 + 1)();
    expect(highest).toBe((MAX_SEED - 1) / MAX_SEED);
    expect(highest).toBeLessThan(1);
  });

  // Regression test for a bug fixed on 24 Nov 2026 (src/components/three/random.ts:6-9): the state is never brought into 1..2^31-2, so a
  // seed of 0 (or any multiple of 2147483647) sticks at state 0 and every draw is the constant
  // -1/2147483646: negative, outside [0, 1) and not random at all. Negative seeds give negative
  // draws too, because `%` keeps the sign. No caller passes such a seed today (7, 11 and 42).
  it('stays in [0, 1) for a seed of zero, a negative seed or the modulus itself', () => {
    for (const seed of [0, -1, -42, 2_147_483_647]) {
      for (const value of take(seed, 8)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });
});
