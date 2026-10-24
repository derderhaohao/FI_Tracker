import { describe, expect, it } from 'vitest';
import { buildDemoBackup } from '../../io/demo';
import { baselineContext, buildProjectionInput, BASELINE_SPEC, type PlanData } from '../baseline';
import { runMonteCarlo } from '../montecarlo/runner';
import { runProjection } from '../projection';
import {
  groupRows,
  impactOf,
  milestones,
  pathStats,
  playSeconds,
  rankOutOf100,
  smartPace,
  worstEquityLevel,
} from './analysis';
import { playbackSetup, resolveStory, resolveTiming, runPlayback, type PlaybackStory } from './engine';
import { EVENTS, impactText, PALETTE_EVENTS, scaleShock, shockMultiplier } from './library';

const raw = buildDemoBackup().data;
const data: PlanData = { ...raw, settings: raw.settings[0] };
const assumptions = raw.assumptionSets[0];
const ctx = baselineContext(data);
const setup = playbackSetup(data, assumptions, BASELINE_SPEC, ctx);
const normal = runPlayback(setup, []);
const story = (events: PlaybackStory['events'], backdrop = 'normal'): PlaybackStory => ({
  backdrop,
  events,
  behaviour: { kind: 'keep' },
});
const at = (id: string, start: number, source: 'scheduled' | 'live' = 'scheduled') => ({
  uid: `${id}-${start}`,
  eventId: id,
  start,
  severity: 'typical' as const,
  source,
});
const resolve = (s: PlaybackStory) => resolveStory(s, [], normal.startAge, normal.retireMonth, normal.months);

describe('monthly engine (EN-1, EN-2)', () => {
  it('matches the yearly projection within 0.5% at every year end, and the FI date to the month', () => {
    const yearly = runProjection(setup.input);
    for (let k = 0; k < yearly.rows.length; k++) {
      const y = yearly.rows[k];
      if (y.investable > 100_000)
        expect(Math.abs(normal.investable[k * 12] - y.investable) / y.investable).toBeLessThan(0.005);
      if (Math.abs(y.totalNetWorth) > 100_000)
        expect(Math.abs(normal.total[k * 12] - y.totalNetWorth) / Math.abs(y.totalNetWorth)).toBeLessThan(
          0.005,
        );
    }
    expect(normal.fiAge).toBe(yearly.fiAge);
    expect(normal.retireAge).toBe(yearly.retireAge);
    expect(Math.abs(normal.yearsToFi! * 12 - yearly.yearsToFi! * 12)).toBeLessThan(1);
  });

  it('computes the whole path quickly (EN-4)', () => {
    const t0 = performance.now();
    runPlayback(setup, resolve(story([at('gfc', 180)])));
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('is deterministic, with and without noise (EN-5, SC-4)', () => {
    const ev = resolve(story([at('blockade', 60)]));
    const a = runPlayback(setup, ev, { kind: 'keep' }, 7);
    const b = runPlayback(setup, ev, { kind: 'keep' }, 7);
    expect(Array.from(a.investable)).toEqual(Array.from(b.investable));
    const c = runPlayback(setup, ev, { kind: 'keep' }, 8);
    expect(c.investable[300]).not.toBe(a.investable[300]);
  });
});

describe('live events (LE-2, LE-3, LE-6, LE-10)', () => {
  it('keeps every played month and recomputes only the future', () => {
    const before = normal;
    const after = runPlayback(
      setup,
      resolve(story([at('blockade', 100, 'live')])),
      { kind: 'keep' },
      undefined,
      {
        path: before,
        month: 100,
      },
    );
    for (let m = 0; m <= 100; m++) expect(after.investable[m]).toBe(before.investable[m]);
    expect(after.investable[130]).not.toBe(before.investable[130]);
    // Recomputing from a month gives the same story as computing it all at once.
    const full = runPlayback(setup, resolve(story([at('blockade', 100, 'live')])));
    for (const m of [101, 200, 400, normal.months])
      expect(after.investable[m]).toBeCloseTo(full.investable[m], 6);
    const impact = impactOf(before, after, 100);
    expect(impact.horizon).toBeCloseTo(after.investable[after.months] - before.investable[before.months], 6);
  });

  it('replays three events identically', () => {
    const ev = resolve(
      story([at('gfc', 200, 'live'), at('job_loss', 60, 'live'), at('windfall', 120, 'live')]),
    );
    const a = runPlayback(setup, ev);
    const b = runPlayback(setup, ev);
    expect(Array.from(a.total)).toEqual(Array.from(b.total));
    expect(
      milestones(a)
        .filter((x) => x.kind === 'eventStart')
        .map((x) => x.month),
    ).toEqual([60, 120, 200]);
  });
});

describe('library and shocks', () => {
  it('has 29 scenarios with the PRD shape', () => {
    expect(EVENTS).toHaveLength(29);
    expect(PALETTE_EVENTS.filter((e) => e.palette === 'good').length).toBeGreaterThanOrEqual(5);
    const s = { factor: 'tw_equity' as const, d: 0.35, a: 3, h: 12, r: 48, p: 0.3 };
    expect(shockMultiplier(s, 0)).toBe(1);
    expect(shockMultiplier(s, 3)).toBeCloseTo(0.65, 9);
    expect(shockMultiplier(s, 10)).toBeCloseTo(0.65, 9);
    expect(shockMultiplier(s, 15 + 24)).toBeCloseTo(0.65 + (0.35 - 0.105) / 2, 9);
    expect(shockMultiplier(s, 200)).toBeCloseTo(1 - 0.105, 9);
    expect(scaleShock(s, 'severe').d).toBeCloseTo(0.525, 9);
    expect(scaleShock(s, 'mild').r).toBe(24);
  });

  it('describes what an event hits in plain words (PB-21)', () => {
    const blockade = EVENTS.find((e) => e.id === 'blockade')!;
    expect(impactText(blockade)).toBe(
      'TW shares −35%, TWD −10% vs USD, Taipei property −20%, Japan shares −20%, US shares −15%',
    );
    expect(impactText(EVENTS.find((e) => e.id === 'job_loss')!)).toBe('no pay for 12 months');
    expect(impactText(EVENTS.find((e) => e.id === 'gfc')!)).toMatch(/^All shares −50%, US property −30%/);
  });

  it('resolves timing presets', () => {
    expect(resolveTiming({ kind: 'inYears', years: 5 }, 35, 180, 720)).toBe(60);
    expect(resolveTiming({ kind: 'afterStop' }, 35, 180, 720)).toBe(180);
    expect(resolveTiming({ kind: 'beforeStop', months: 12 }, 35, 180, 720)).toBe(168);
    expect(resolveTiming({ kind: 'age', age: 60 }, 35, 180, 720)).toBe(300);
  });
});

describe('the story on screen', () => {
  const gfc = runPlayback(setup, resolve(story([at('gfc', normal.retireMonth!)])));

  it('groups always add up to total net worth (acceptance 5)', () => {
    for (const grouping of ['class', 'region', 'currency'] as const)
      for (const m of [0, 77, 180, 400, gfc.months]) {
        const sum = groupRows(gfc, m, grouping).reduce((s, r) => s + r.value, 0);
        expect(sum).toBeCloseTo(gfc.total[m], 0);
      }
  });

  it('paces a whole story in 90 to 150 seconds (acceptance 2)', () => {
    for (const p of [normal, gfc]) {
      const s = playSeconds(smartPace(p));
      expect(s).toBeGreaterThanOrEqual(90);
      expect(s).toBeLessThanOrEqual(150);
    }
  });

  it('reports the lowest point, the market fall and the rank (acceptance 4)', () => {
    const s = pathStats(gfc);
    expect(s.drawdown).toBeGreaterThan(0.3);
    expect(s.recoveryMonths).toBeGreaterThan(12);
    expect(gfc.investable[gfc.months]).toBeLessThan(normal.investable[normal.months]);
    expect(worstEquityLevel(gfc)).toBeCloseTo(0.5, 6);
    const mc = runMonteCarlo(setup.input, { runs: 300, seed: 42 });
    const rank = rankOutOf100(mc.horizonSorted, gfc.investable[gfc.months]);
    expect(rank).toBeGreaterThanOrEqual(0);
    expect(rank).toBeLessThan(rankOutOf100(mc.horizonSorted, normal.investable[normal.months]));
    expect(rankOutOf100([1, 2, 3, 4], 3.5)).toBe(75);
  });

  it('a lucky decade ends higher and a pay rise saves more', () => {
    const lucky = runPlayback(setup, resolve(story([], 'lucky_decade')));
    expect(lucky.investable[lucky.months]).toBeGreaterThan(normal.investable[normal.months]);
    const pay = runPlayback(setup, resolve(story([at('pay_rise', 12)])));
    expect(pay.investable[120]).toBeGreaterThan(normal.investable[120]);
  });

  it('selling after a fall shows its cost (SC-6)', () => {
    const ev = resolve(story([at('gfc', normal.retireMonth!)]));
    const keep = runPlayback(setup, ev, { kind: 'keep' });
    const sell = runPlayback(setup, ev, { kind: 'sell', fall: 0.2 });
    expect(sell.investable[sell.months]).toBeLessThan(keep.investable[keep.months]);
  });
});

describe('the same events in the Strategy Lab (EN-8)', () => {
  it('lower the chance the money lasts when injected into the simulations', () => {
    const plain = buildProjectionInput(data, assumptions, BASELINE_SPEC, ctx);
    const stressed = buildProjectionInput(
      data,
      assumptions,
      {
        ...BASELINE_SPEC,
        overrides: { stressEvents: [{ eventId: 'gfc', timing: 'afterStop', severity: 'typical' }] },
      },
      ctx,
    );
    expect(stressed.stress).toHaveLength(1);
    const a = runMonteCarlo(plain, { runs: 300, seed: 1 });
    const b = runMonteCarlo(stressed, { runs: 300, seed: 1 });
    expect(b.successRate).toBeLessThan(a.successRate);
    const year = buildProjectionInput(
      data,
      assumptions,
      {
        ...BASELINE_SPEC,
        overrides: { stressEvents: [{ eventId: 'windfall', timing: 'year', years: 2, severity: 'typical' }] },
      },
      ctx,
    );
    expect(runProjection(year).rows[3].liquid).toBeGreaterThan(runProjection(plain).rows[3].liquid);
  });
});
