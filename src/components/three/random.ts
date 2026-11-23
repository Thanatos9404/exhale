/**
 * Deterministic Park-Miller PRNG. Particle fields use it instead of `Math.random` so a scene
 * renders identically on every mount, which keeps render functions pure and screenshots stable.
 */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
