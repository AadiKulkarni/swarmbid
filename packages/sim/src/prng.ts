/**
 * Seeded PRNG (mulberry32).
 *
 * Every stochastic choice in the simulation (initial placement, message
 * drops, delays, reorder) must go through this generator so that identical
 * seeds produce identical event logs.
 */

export type Rng = () => number;

/**
 * Create a mulberry32 generator from a 32-bit seed.
 * Returns floats in [0, 1).
 */
export function createMulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [min, max] inclusive. */
export function nextInt(rng: Rng, min: number, max: number): number {
  if (max < min) {
    throw new Error(`nextInt: max (${max}) < min (${min})`);
  }
  return min + Math.floor(rng() * (max - min + 1));
}

/** Bernoulli trial with success probability p. */
export function nextBool(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** Fisher–Yates shuffle in place using the seeded RNG. */
export function shuffleInPlace<T>(items: T[], rng: Rng): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
}
