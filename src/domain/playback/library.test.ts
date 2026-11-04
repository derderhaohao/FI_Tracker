import type { CustomEvent } from '../entities';
import { setLang } from '@/i18n';
import {
  customToEvent,
  EVENTS,
  eventLength,
  findEvent,
  impactText,
  LUMP_EVENT,
  scaleShock,
  shockMultiplier,
} from './library';

/**
 * The event library behind playback and the Strategy Lab: your own events, how long each
 * event lasts, and the one-line impact text shown on every tile.
 */

const ev = (id: string) => EVENTS.find((e) => e.id === id)!;

describe('your own events', () => {
  const rally: CustomEvent = {
    id: 'c1',
    name: 'TW rally',
    story: '',
    shocks: [{ factor: 'tw_equity', d: -0.2, a: 6, h: 0, r: 0, p: 1 }],
  };
  const crash: CustomEvent = {
    id: 'c2',
    name: 'Mixed',
    story: 'Shares fall, yen rises',
    shocks: [
      { factor: 'us_equity', d: 0.3, a: 3, h: 2, r: 12, p: 0 },
      { factor: 'jpy', d: -0.1, a: 3, h: 0, r: 6, p: 0 },
      // A factor this version does not know is dropped, not crashed on.
      { factor: 'gold' as never, d: 0.1, a: 1, h: 0, r: 0, p: 0 },
    ],
  };

  it('become an event in the palette, good or bad by their direction', () => {
    const good = customToEvent(rally);
    expect(good).toMatchObject({ id: 'c1', name: 'TW rally', group: 'custom', palette: 'good' });
    expect(good.story).toBe('Your own event.');
    const bad = customToEvent(crash);
    expect(bad.palette).toBe('bad');
    expect(bad.story).toBe('Shares fall, yen rises');
    expect(bad.shocks.map((s) => s.factor)).toEqual(['us_equity', 'jpy']);
  });

  it('are found by id ahead of the library, next to the lump-sum tile', () => {
    expect(findEvent('lump')).toBe(LUMP_EVENT);
    expect(findEvent('gfc')).toBe(ev('gfc'));
    expect(findEvent('c2', [rally, crash])?.name).toBe('Mixed');
    expect(findEvent('c2')).toBeUndefined();
    expect(findEvent('no-such-event', [rally])).toBeUndefined();
  });
});

describe('the shock shape', () => {
  it('caps falls at 95%, scales rises freely, and keeps an instant move instant', () => {
    expect(scaleShock({ factor: 'tw_equity', d: 0.8, a: 6, h: 0, r: 0, p: 0 }, 'severe').d).toBe(0.95);
    expect(scaleShock({ factor: 'tw_equity', d: -0.8, a: 6, h: 0, r: 0, p: 0 }, 'severe').d).toBeCloseTo(
      -1.2,
    );
    expect(scaleShock({ factor: 'usd', d: 0.1, a: 0, h: 2, r: 2, p: 0 }, 'mild').a).toBe(0);
    // A short fall never shrinks to zero months.
    expect(scaleShock({ factor: 'usd', d: 0.1, a: 1, h: 0, r: 0, p: 0 }, 'mild').a).toBe(1);
  });

  it('jumps straight to the kept share when there is no recovery', () => {
    const s = { factor: 'bonds' as const, d: 0.2, a: 2, h: 1, r: 0, p: 0.5 };
    expect(shockMultiplier(s, 0)).toBe(1);
    expect(shockMultiplier(s, 1)).toBeCloseTo(0.9);
    expect(shockMultiplier(s, 2)).toBeCloseTo(0.8);
    expect(shockMultiplier(s, 3)).toBeCloseTo(0.9);
    expect(shockMultiplier(s, 50)).toBeCloseTo(0.9);
  });
});

describe('how long an event lasts', () => {
  it('takes the longest of its shocks, rates and pay change', () => {
    expect(eventLength(ev('normal'), 'typical')).toBe(1);
    expect(eventLength(ev('lucky_decade'), 'typical')).toBe(120);
    expect(eventLength(ev('lucky_decade'), 'severe')).toBe(180);
    expect(eventLength(ev('job_loss'), 'typical')).toBeGreaterThanOrEqual(12);
    expect(eventLength(ev('job_loss'), 'mild')).toBeLessThan(eventLength(ev('job_loss'), 'typical'));
  });

  it('ignores a rate change that lasts for good', () => {
    // Rate cuts change loan rates "forever" (1200 months), but the event itself ends.
    expect(eventLength(ev('rate_cuts'), 'typical')).toBeLessThan(100);
    // A pay rise with no end date has no pay end either.
    expect(eventLength(ev('pay_rise'), 'typical')).toBe(1);
  });

  it('is at least a month for every event in the library', () => {
    for (const e of EVENTS)
      for (const s of ['mild', 'typical', 'severe'] as const)
        expect(eventLength(e, s)).toBeGreaterThanOrEqual(1);
  });
});

describe('the impact text', () => {
  afterEach(() => setLang('en'));

  it('describes each kind of rate change', () => {
    expect(impactText(ev('lucky_decade'))).toBe('shares +2 pts a year for 10 years');
    expect(impactText(ev('unlucky_decade'))).toBe('shares -2 pts a year for 10 years');
    expect(impactText(ev('lost_decades'))).toMatch(
      /shares flat after inflation for 12 years, cash earns ~0% for 12 years$/,
    );
    expect(impactText(ev('us_housing'))).toMatch(/cash -1 pts for 4 years$/);
    expect(impactText(ev('rate_shock'))).toMatch(/floating loans \+3 pts for 3 years$/);
    // A change for good has no "for …".
    expect(impactText(ev('rate_cuts'))).toMatch(/floating loans -1\.5 pts$/);
    expect(impactText(ev('stagflation'))).toMatch(
      /inflation \+5 pts for 6 years, pay lags inflation by 2 pts$/,
    );
  });

  it('scales rates, pay and amounts by severity', () => {
    expect(impactText(ev('pandemic'), 'mild')).toMatch(/cash -0\.5 pts for 6 months, pay −5% for 3 months$/);
    expect(impactText(ev('pay_rise'))).toBe('pay +20%');
    expect(impactText(ev('windfall'))).toBe('+NT$2M cash');
    expect(impactText(ev('windfall'), 'severe')).toBe('+NT$3M cash');
    expect(impactText(ev('earthquake'), 'mild')).toMatch(/NT\$250k cost$/);
    expect(impactText(ev('medical'))).toBe('pay −30% for 12 months, NT$1M cost');
  });

  it('uses the amount you typed for the lump-sum tile and a pay event', () => {
    expect(impactText(LUMP_EVENT, 'typical', 150_000)).toBe('+NT$150k cash');
    expect(impactText(LUMP_EVENT, 'typical', -2_500_000)).toBe('NT$2.5M cost');
    expect(impactText(LUMP_EVENT, 'typical', 0)).toBe('');
    expect(impactText(ev('job_loss'), 'typical', 0.5)).toBe('pay −50% for 12 months');
  });

  it('writes amounts the Taiwan way in Chinese', () => {
    setLang('zh-TW');
    const text = impactText(ev('windfall'));
    expect(text).not.toBe('+NT$2M cash');
    expect(text).toMatch(/200/);
  });
});
