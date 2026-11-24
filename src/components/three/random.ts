/**
 * Deterministic Park-Miller PRNG. Particle fields use it instead of `Math.random` so a scene
 * renders identically on every mount, which keeps render functions pure and screenshots stable.
 */

const MODULUS = 2147483647;

/**
 * Returns a generator of draws in [0, 1). Any seed is accepted: it is mapped into the
 * generator's valid state range 1..2^31-2, so zero, negative or oversized seeds cannot stall it
 * or push draws out of range.
 */
export function seededRandom(seed: number): () => number {
  let s = ((Math.trunc(seed) % MODULUS) + MODULUS) % MODULUS || 1;
  return () => {
    s = (s * 16807) % MODULUS;
    return (s - 1) / (MODULUS - 1);
  };
}
