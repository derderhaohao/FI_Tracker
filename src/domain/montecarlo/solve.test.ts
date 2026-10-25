import { makeInput } from '../testFixtures';
import type { ProjectionInput } from '../projection';
import { cholesky, correlate, identity } from './cholesky';
import { lognormalReturn, medianReturn, mulberry32, normalSource, runSeed } from './rng';
import { monteCarloChance, solveLever, withLever } from './solve';

/** L · Lᵀ. */
const multiply = (L: number[][]) =>
  L.map((row) => L.map((other) => row.reduce((s, v, k) => s + v * other[k], 0)));

describe('Cholesky factor', () => {
  it('rebuilds a positive definite correlation matrix', () => {
    const C = [
      [1, 0.6, 0.3],
      [0.6, 1, 0.5],
      [0.3, 0.5, 1],
    ];
    const L = cholesky(C);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(L[i][j]).toBe(0);
    const back = multiply(L);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(back[i][j]).toBeCloseTo(C[i][j], 12);
  });

  it('shrinks an impossible matrix until it factors, and keeps the diagonal', () => {
    const bad = [
      [1, 0.9, -0.9],
      [0.9, 1, 0.9],
      [-0.9, 0.9, 1],
    ];
    const back = multiply(cholesky(bad));
    for (let i = 0; i < 3; i++) expect(back[i][i]).toBeCloseTo(1, 12);
    expect(Math.abs(back[0][1])).toBeLessThan(0.9);
  });

  it('falls back to the identity when even zero correlation fails', () => {
    expect(cholesky([[0]])).toEqual(identity(1));
    expect(identity(2)).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it('applies L to a vector of draws', () => {
    const L = [
      [1, 0],
      [0.5, Math.sqrt(0.75)],
    ];
    const out = correlate(L, [2, 4], new Float64Array(2));
    expect(out[0]).toBe(2);
    expect(out[1]).toBeCloseTo(1 + 4 * Math.sqrt(0.75), 12);
  });
});

describe('random numbers', () => {
  it('gives the same uniform stream for a seed, in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(xs.reduce((s, x) => s + x, 0) / xs.length).toBeCloseTo(0.5, 1);
  });

  it('mixes run seeds so neighbouring runs differ', () => {
    const seeds = new Set(Array.from({ length: 1000 }, (_, i) => runSeed(7, i)));
    expect(seeds.size).toBe(1000);
    expect(runSeed(7, 3)).toBe(runSeed(7, 3));
  });

  it('draws standard normals with mean 0 and variance 1', () => {
    const z = normalSource(mulberry32(1));
    const xs = Array.from({ length: 50_000 }, z);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(variance).toBeCloseTo(1, 1);
  });

  it('keeps the lognormal’s arithmetic mean and puts its median below it', () => {
    const z = normalSource(mulberry32(5));
    const xs = Array.from({ length: 50_000 }, () => lognormalReturn(0.07, 0.18, z()));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeCloseTo(0.07, 2);
    expect(Math.min(...xs)).toBeGreaterThan(-1);
    const median = medianReturn(0.07, 0.18);
    expect(median).toBeLessThan(0.07);
    expect(median).toBeCloseTo(0.07 - 0.18 ** 2 / 2, 1);
    expect(medianReturn(0.05, 0)).toBe(0.05);
  });
});

describe('solving for a lever', () => {
  const input = makeInput({ fiSpending: 500_000 });

  it('sets each lever on the input', () => {
    expect(withLever({ ...input, retireAtAge: 55 }, 'stopAge', 58, 55).retireAtAge).toBe(58);
    expect(withLever(input, 'stopAge', 58, 55).workExtraYears).toBe(3);
    const spend = withLever(input, 'fiSpending', 400_000, 55);
    expect(spend.fiSpending).toBe(400_000);
    expect(spend.targetSpending).toBe(500_000);
    expect(withLever(input, 'partTime', 200_000, 52).barista).toEqual({
      annual: 200_000,
      untilAge: 60,
      inTarget: false,
    });
    expect(withLever(input, 'partTime', 1, 58).barista?.untilAge).toBe(63);
  });

  // A smooth stand-in for Monte Carlo: the chance rises with the lever.
  const byStop = (i: ProjectionInput) => Math.min(1, ((i.retireAtAge ?? 0) - 40) / 25);
  const bySpending = (i: ProjectionInput) => Math.min(1, Math.max(0, 1 - (i.fiSpending - 200_000) / 400_000));
  const byPartTime = (i: ProjectionInput) => Math.min(1, (i.barista?.annual ?? 0) / 400_000);

  it('finds the earliest stop age that reaches the target', () => {
    const r = solveLever({ ...input, retireAtAge: 50 }, 'stopAge', 0.8, 50, byStop);
    expect(r).toEqual({ lever: 'stopAge', reachable: true, value: 60, chance: 0.8 });
    expect(solveLever({ ...input, retireAtAge: 62 }, 'stopAge', 0.8, 62, byStop).value).toBe(62);
    expect(solveLever({ ...input, retireAtAge: 50 }, 'stopAge', 1.1, 50, byStop).reachable).toBe(false);
  });

  it('finds the highest FI spending that still reaches the target, in whole thousands', () => {
    const r = solveLever(input, 'fiSpending', 0.85, 55, bySpending);
    expect(r.reachable).toBe(true);
    // 1 − (S − 200k) ÷ 400k ≥ 0.85 → S ≤ 260k.
    expect(r.value).toBeLessThanOrEqual(260_000);
    expect(r.value).toBeGreaterThanOrEqual(259_000);
    expect(r.value! % 1000).toBe(0);
    expect(solveLever(input, 'fiSpending', 0.1, 55, bySpending).value).toBe(500_000);
    expect(solveLever(input, 'fiSpending', 1.1, 55, bySpending).reachable).toBe(false);
  });

  it('finds the least part-time income that reaches the target', () => {
    const r = solveLever(input, 'partTime', 0.5, 55, byPartTime);
    // a ÷ 400k ≥ 0.5 → a ≥ 200k, rounded up to whole thousands.
    expect(r.value).toBeGreaterThanOrEqual(200_000);
    expect(r.value).toBeLessThanOrEqual(201_000);
    expect(r.chance).toBeGreaterThanOrEqual(0.5);
    expect(solveLever(input, 'partTime', 0, 55, byPartTime).value).toBe(0);
    expect(solveLever(input, 'partTime', 0.99, 55, () => 0.2).reachable).toBe(false);
  });

  it('measures the chance with a real Monte Carlo run', () => {
    const chance = monteCarloChance({ runs: 20, seed: 1 });
    const rich = makeInput({ liquid: [{ assetClass: 'cash', currency: 'TWD', value: 30_000_000 }] });
    expect(chance(rich)).toBe(1);
  });
});
