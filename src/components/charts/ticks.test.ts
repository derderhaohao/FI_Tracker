import { ageTicks, labelWidth, niceStep, niceTicks, staggerLabels, trimZeros, yearTicks } from './ticks';

/** True when v is a multiple of 1, 2, 2.5 or 5 × 10ⁿ. */
function isRound(v: number): boolean {
  if (v === 0) return true;
  const a = Math.abs(v);
  const mag = Math.pow(10, Math.floor(Math.log10(a)));
  const m = Number((a / mag).toPrecision(10));
  // A multiple of the step: 1.5 × 10ⁿ is a multiple of 0.5 × 10ⁿ, and so on.
  return [1, 2, 2.5, 5].some((s) => {
    for (let e = -1; e <= 1; e++) {
      const step = s * Math.pow(10, e);
      const q = m / step;
      if (Math.abs(q - Math.round(q)) < 1e-9) return true;
    }
    return false;
  });
}

describe('niceTicks (UI-7)', () => {
  it.each([
    [0, 22_000_000],
    [0, 5_098_012],
    [392_200, 11_228],
    [0, 377_479],
    [-0.27, 0.76],
    [0.97, 1.03],
    [3, 3_000_000_000],
    [-50, -10],
  ])('gives round steps that cover %d to %d', (min, max) => {
    const { ticks, domain } = niceTicks(min, max);
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    expect(domain[0]).toBeLessThanOrEqual(lo);
    expect(domain[1]).toBeGreaterThanOrEqual(hi);
    expect(domain).toEqual([ticks[0], ticks.at(-1)]);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(7);
    const step = ticks[1] - ticks[0];
    expect(isRound(step)).toBe(true);
    // Every tick is a whole multiple of that round step.
    for (const t of ticks) expect(Math.abs(t / step - Math.round(t / step))).toBeLessThan(1e-6);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeCloseTo(step, 9);
  });

  it('reads NT$0, 5M, 10M… for the projection range', () => {
    expect(niceTicks(0, 22_000_000).ticks).toEqual([0, 5e6, 10e6, 15e6, 20e6, 25e6]);
    expect(niceTicks(0, 8_000_000).ticks).toEqual([0, 2e6, 4e6, 6e6, 8e6]);
  });

  it('handles a flat or empty range', () => {
    expect(niceTicks(0, 0)).toEqual({ ticks: [0, 1], domain: [0, 1] });
    expect(niceTicks(400, 400).domain[0]).toBe(0);
    expect(niceTicks(400, 400).domain[1]).toBeGreaterThanOrEqual(400);
    expect(niceTicks(Number.NaN, 5)).toEqual({ ticks: [0, 1], domain: [0, 1] });
  });

  it('picks the smallest round step', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(12, 5)).toBe(2.5);
    expect(niceStep(23, 5)).toBe(5);
    expect(niceStep(0, 5)).toBe(1);
  });
});

describe('age and year ticks', () => {
  it('ticks ages every 5 years on round values', () => {
    expect(ageTicks(37, 95)).toEqual([40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95]);
    expect(ageTicks(20, 100)).toEqual([20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('ticks years on round steps', () => {
    expect(yearTicks(2010, 2026)).toEqual([2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026]);
    expect(yearTicks(2000, 2026)).toEqual([2000, 2005, 2010, 2015, 2020, 2025]);
  });
});

describe('reference label stagger (UI-8)', () => {
  it('keeps apart labels on one row and moves overlapping ones down', () => {
    expect(
      staggerLabels([
        { x: 0, width: 50 },
        { x: 100, width: 50 },
      ]),
    ).toEqual([0, 0]);
    expect(
      staggerLabels([
        { x: 0, width: 80 },
        { x: 40, width: 80 },
        { x: 200, width: 30 },
      ]),
    ).toEqual([0, 1, 0]);
    // Rows are reused once free.
    expect(
      staggerLabels([
        { x: 0, width: 100 },
        { x: 50, width: 40 },
        { x: 95, width: 40 },
        { x: 120, width: 40 },
      ]),
    ).toEqual([0, 1, 2, 0]);
  });

  it('estimates wider labels for Chinese text', () => {
    expect(labelWidth('勞退')).toBeGreaterThan(labelWidth('ab'));
  });
});

describe('trimZeros', () => {
  it('drops zeros a round tick does not need', () => {
    expect(trimZeros('NT$5.00M')).toBe('NT$5M');
    expect(trimZeros('NT$2.50M')).toBe('NT$2.5M');
    expect(trimZeros('NT$392.2K')).toBe('NT$392.2K');
    expect(trimZeros('$100K')).toBe('$100K');
    expect(trimZeros('25%')).toBe('25%');
    expect(trimZeros('1,500萬')).toBe('1,500萬');
    expect(trimZeros('NT$1.50億')).toBe('NT$1.5億');
  });
});
