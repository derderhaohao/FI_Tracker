/** Seeded random numbers, so the same seed always gives the same simulation. */

export type Rng = () => number;

/** mulberry32: small, fast 32-bit PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes a base seed and a run index into an independent 32-bit seed. */
export function runSeed(seed: number, run: number): number {
  let h = (seed ^ Math.imul(run + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Standard normal draws by Box–Muller, using both values of each pair. */
export function normalSource(rng: Rng): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = rng();
    const v = rng();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

/**
 * Lognormal annual return with arithmetic mean `mean` and standard deviation `sd`,
 * from a standard normal draw z. Returns `mean` exactly when sd is 0.
 */
export function lognormalReturn(mean: number, sd: number, z: number): number {
  if (sd === 0) return mean;
  const gross = 1 + mean;
  const sigma2 = Math.log(1 + (sd * sd) / (gross * gross));
  const mu = Math.log(gross) - sigma2 / 2;
  return Math.exp(mu + Math.sqrt(sigma2) * z) - 1;
}
