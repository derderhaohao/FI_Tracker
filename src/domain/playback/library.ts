import type { CustomEvent, Severity } from '../entities';

/**
 * The scenario library (PRD "Projection Playback & Scenario Events"): market factors,
 * the shock shape, and 29 hypothetical stress stories. Depths are the PRD's indicative
 * starting values at Typical severity: illustrations, not forecasts or probabilities.
 * Shared by the Projection playback and the Strategy Lab (EN-8).
 */

export const FACTORS = [
  'tw_equity',
  'us_equity',
  'jp_equity',
  'eu_equity',
  'em_equity',
  'bonds',
  'taipei_property',
  'tw_property',
  'jp_property',
  'us_property',
  'usd',
  'jpy',
] as const;
export type Factor = (typeof FACTORS)[number];

export const FACTOR_LABELS: Record<Factor, string> = {
  tw_equity: 'TW shares',
  us_equity: 'US shares',
  jp_equity: 'Japan shares',
  eu_equity: 'Europe shares',
  em_equity: 'China/EM shares',
  bonds: 'Bonds',
  taipei_property: 'Taipei property',
  tw_property: 'Other TW property',
  jp_property: 'Japan property',
  us_property: 'US property',
  usd: 'USD',
  jpy: 'JPY',
};

export const EQUITY_FACTORS: Factor[] = ['tw_equity', 'us_equity', 'jp_equity', 'eu_equity', 'em_equity'];
const ALL_EQUITY = EQUITY_FACTORS;
const NON_TW_EQUITY: Factor[] = ['us_equity', 'jp_equity', 'eu_equity', 'em_equity'];
const ALL_PROPERTY: Factor[] = ['taipei_property', 'tw_property', 'jp_property', 'us_property'];

/**
 * A factor's shock: falls by `d` over `a` months (negative `d` = a rise), holds for `h`
 * months, recovers over `r` months, and keeps the share `p` of the move for good.
 */
export interface LevelShock {
  factor: Factor;
  d: number;
  a: number;
  h: number;
  r: number;
  p: number;
}

export type RateKind =
  /** Extra inflation, yearly points. */
  | 'inflation'
  /** Change to cash returns, yearly points. */
  | 'cash'
  /** Cash returns set to this yearly level. */
  | 'cashLevel'
  /** Change to floating loan rates, yearly points. */
  | 'mortgage'
  /** Extra yearly return on all shares (backdrops). */
  | 'equityTrend'
  /** Shares return only inflation (lost decades). */
  | 'equityRealZero'
  /** Take-home pay grows this many points a year slower than usual. */
  | 'payTrend';

export interface RateShock {
  kind: RateKind;
  pts: number;
  months: number;
}

export type Timing =
  | { kind: 'inYears'; years: number }
  | { kind: 'afterStop' }
  | { kind: 'beforeStop'; months: number }
  | { kind: 'age'; age: number };

export type EventGroup =
  'backdrop' | 'geopolitical' | 'financial' | 'currency' | 'health' | 'lucky' | 'personal' | 'custom';

export interface EventDef {
  id: string;
  /** Number in the PRD library. */
  n: number;
  name: string;
  group: EventGroup;
  /** Palette section; backdrops are not in the palette. */
  palette?: 'good' | 'bad' | 'personal';
  /** Lucide icon name. */
  icon: string;
  story: string;
  analogue?: string;
  defaultStart: Timing;
  shocks: LevelShock[];
  rates?: RateShock[];
  /** Take-home pay × factor for `months` (permanent when absent). */
  pay?: { factor: number; months?: number };
  /** One-off amount in today's TWD (negative = a cost). */
  lump?: number;
  /** First release phase that ships the event. */
  phase: 1 | 2;
}

const shock = (factor: Factor, d: number, a: number, h: number, r: number, p = 0): LevelShock => ({
  factor,
  d,
  a,
  h,
  r,
  p,
});
const each = (factors: Factor[], d: number, a: number, h: number, r: number, p = 0) =>
  factors.map((f) => shock(f, d, a, h, r, p));

export const EVENTS: EventDef[] = [
  {
    id: 'normal',
    n: 1,
    name: 'Normal',
    group: 'backdrop',
    icon: 'Minus',
    story: 'Markets return their typical amount every year, as in your projection.',
    defaultStart: { kind: 'inYears', years: 0 },
    shocks: [],
    phase: 1,
  },
  {
    id: 'lucky_decade',
    n: 2,
    name: 'Lucky decade',
    group: 'backdrop',
    icon: 'Sun',
    story: 'Shares return 2 points a year more than usual for 10 years.',
    analogue: 'US 1990s bull market',
    defaultStart: { kind: 'inYears', years: 1 },
    shocks: [],
    rates: [{ kind: 'equityTrend', pts: 0.02, months: 120 }],
    phase: 1,
  },
  {
    id: 'unlucky_decade',
    n: 3,
    name: 'Unlucky decade',
    group: 'backdrop',
    icon: 'CloudRain',
    story: 'Shares return 2 points a year less than usual for 10 years.',
    analogue: 'US 2000–09, roughly flat stocks',
    defaultStart: { kind: 'inYears', years: 1 },
    shocks: [],
    rates: [{ kind: 'equityTrend', pts: -0.02, months: 120 }],
    phase: 1,
  },
  {
    id: 'lost_decades',
    n: 4,
    name: 'Japan-style lost decades',
    group: 'backdrop',
    icon: 'Hourglass',
    story:
      'Shares only keep up with inflation for 12 years, property loses 40% over 10 years, and cash earns almost nothing.',
    analogue: 'Japan after 1990',
    defaultStart: { kind: 'inYears', years: 1 },
    shocks: each(ALL_PROPERTY, 0.4, 120, 0, 0, 1),
    rates: [
      { kind: 'equityRealZero', pts: 0, months: 144 },
      { kind: 'cashLevel', pts: 0.002, months: 144 },
    ],
    phase: 2,
  },
  {
    id: 'blockade',
    n: 5,
    name: 'Taiwan Strait blockade',
    group: 'geopolitical',
    palette: 'bad',
    icon: 'Ship',
    story:
      'A blockade disrupts trade: Taiwan shares and property fall, TWD weakens, and Asian and US markets follow.',
    analogue: '1995–96 Strait crisis, 2022 Ukraine shock',
    defaultStart: { kind: 'inYears', years: 5 },
    shocks: [
      shock('tw_equity', 0.35, 3, 12, 48, 0.3),
      shock('usd', -0.1, 3, 12, 48, 0.3),
      shock('taipei_property', 0.2, 3, 12, 48, 0.3),
      shock('jp_equity', 0.2, 3, 12, 48),
      shock('us_equity', 0.15, 3, 12, 48),
    ],
    phase: 1,
  },
  {
    id: 'strait_conflict',
    n: 6,
    name: 'Taiwan Strait conflict',
    group: 'geopolitical',
    palette: 'bad',
    icon: 'Flame',
    story:
      'A severe regional conflict: deep, long losses in Taiwan, a weak TWD, global markets down and higher inflation.',
    analogue: 'None; hypothetical severe stress',
    defaultStart: { kind: 'inYears', years: 5 },
    shocks: [
      shock('tw_equity', 0.6, 2, 24, 96, 0.5),
      shock('taipei_property', 0.4, 2, 24, 96, 0.5),
      shock('tw_property', 0.4, 2, 24, 96, 0.5),
      shock('usd', -0.25, 2, 24, 96, 0.5),
      ...each(NON_TW_EQUITY, 0.3, 2, 24, 96),
    ],
    rates: [{ kind: 'inflation', pts: 0.03, months: 36 }],
    phase: 2,
  },
  {
    id: 'oil_shock',
    n: 7,
    name: 'Middle East war, oil shock',
    group: 'geopolitical',
    palette: 'bad',
    icon: 'Fuel',
    story: 'An oil shock lifts prices and knocks shares; the USD firms and bonds slip.',
    analogue: '1973 oil embargo, 1990 Gulf War',
    defaultStart: { kind: 'inYears', years: 3 },
    shocks: [
      ...each(ALL_EQUITY, 0.15, 2, 6, 24),
      shock('usd', -0.05, 2, 6, 24),
      shock('bonds', 0.05, 2, 6, 24),
    ],
    rates: [{ kind: 'inflation', pts: 0.02, months: 24 }],
    phase: 2,
  },
  {
    id: 'decoupling',
    n: 8,
    name: 'US–China decoupling',
    group: 'geopolitical',
    palette: 'bad',
    icon: 'Unlink',
    story: 'Tariffs and export bans split supply chains: China/EM shares fall hardest, Taiwan half recovers.',
    analogue: '2018–19 tariff war',
    defaultStart: { kind: 'inYears', years: 2 },
    shocks: [
      shock('em_equity', 0.3, 12, 12, 36),
      shock('tw_equity', 0.2, 12, 12, 36, 0.5),
      shock('us_equity', 0.1, 12, 12, 36),
    ],
    rates: [{ kind: 'inflation', pts: 0.01, months: 24 }],
    phase: 2,
  },
  {
    id: 'europe_war',
    n: 9,
    name: 'Europe war widens',
    group: 'geopolitical',
    palette: 'bad',
    icon: 'ShieldAlert',
    story: 'A wider war in Europe hits European shares, lifts energy prices and the USD.',
    analogue: '2022 Russia–Ukraine war',
    defaultStart: { kind: 'inYears', years: 4 },
    shocks: [
      shock('eu_equity', 0.3, 3, 12, 36),
      ...each(['tw_equity', 'us_equity', 'jp_equity', 'em_equity'], 0.15, 3, 12, 36),
      shock('usd', -0.05, 3, 12, 36),
    ],
    rates: [{ kind: 'inflation', pts: 0.02, months: 24 }],
    phase: 2,
  },
  {
    id: 'gfc',
    n: 10,
    name: 'Global financial crisis',
    group: 'financial',
    palette: 'bad',
    icon: 'TrendingDown',
    story:
      'A banking crisis halves share prices over 15 months, US property falls 30%, and cash pays almost nothing.',
    analogue: '2007–09',
    defaultStart: { kind: 'afterStop' },
    shocks: [
      ...each(ALL_EQUITY, 0.5, 15, 6, 60),
      shock('us_property', 0.3, 15, 6, 60),
      shock('usd', -0.05, 15, 6, 60),
    ],
    rates: [{ kind: 'cashLevel', pts: 0.002, months: 60 }],
    phase: 1,
  },
  {
    id: 'tech_bubble',
    n: 11,
    name: 'Tech bubble bursts',
    group: 'financial',
    palette: 'bad',
    icon: 'Cpu',
    story: 'Overpriced tech shares slide for two and a half years; bonds rally as rates fall.',
    analogue: '2000–02 dot-com crash',
    defaultStart: { kind: 'inYears', years: 3 },
    shocks: [
      shock('us_equity', 0.45, 30, 6, 84),
      shock('tw_equity', 0.4, 30, 6, 84),
      shock('bonds', -0.1, 30, 6, 84),
    ],
    phase: 1,
  },
  {
    id: 'us_housing',
    n: 12,
    name: 'US housing crash',
    group: 'financial',
    palette: 'bad',
    icon: 'Home',
    story: 'US house prices fall 30% over two years; US shares follow and rates are cut.',
    analogue: '2006–11 US housing bust',
    defaultStart: { kind: 'inYears', years: 4 },
    shocks: [shock('us_property', 0.3, 24, 24, 72), shock('us_equity', 0.2, 24, 24, 72)],
    rates: [{ kind: 'cash', pts: -0.01, months: 48 }],
    phase: 2,
  },
  {
    id: 'tw_housing',
    n: 13,
    name: 'Taiwan housing correction',
    group: 'financial',
    palette: 'bad',
    icon: 'Building',
    story: 'Taiwan property cools for three years: Taipei −25%, elsewhere −15%, and a dip in Taiwan shares.',
    analogue: 'Taiwan property slump of the 1990s',
    defaultStart: { kind: 'inYears', years: 3 },
    shocks: [
      shock('taipei_property', 0.25, 36, 24, 96),
      shock('tw_property', 0.15, 36, 24, 96),
      shock('tw_equity', 0.1, 36, 24, 96),
    ],
    phase: 2,
  },
  {
    id: 'asian_currency',
    n: 14,
    name: 'Asian currency crisis',
    group: 'financial',
    palette: 'bad',
    icon: 'Coins',
    story: 'Capital flees Asia: TWD drops 20% against USD, Taiwan shares −30%, China/EM shares halve.',
    analogue: '1997–98',
    defaultStart: { kind: 'inYears', years: 4 },
    shocks: [
      shock('usd', -0.2, 12, 6, 36),
      shock('tw_equity', 0.3, 12, 6, 36),
      shock('em_equity', 0.5, 12, 6, 36),
    ],
    phase: 2,
  },
  {
    id: 'rate_shock',
    n: 15,
    name: 'Rate shock, bond crash',
    group: 'financial',
    palette: 'bad',
    icon: 'Percent',
    story:
      'Interest rates jump: bonds −15%, shares −20%, property −10%, and floating mortgages cost 3 points more.',
    analogue: '2022 bond rout',
    defaultStart: { kind: 'inYears', years: 2 },
    shocks: [
      shock('bonds', 0.15, 12, 6, 36),
      ...each(ALL_EQUITY, 0.2, 12, 6, 36),
      ...each(ALL_PROPERTY, 0.1, 12, 6, 36),
    ],
    rates: [{ kind: 'mortgage', pts: 0.03, months: 36 }],
    phase: 2,
  },
  {
    id: 'stagflation',
    n: 16,
    name: '1970s-style stagflation',
    group: 'currency',
    palette: 'bad',
    icon: 'Thermometer',
    story:
      'Inflation runs 5 points higher for six years while shares and bonds lose ground and pay lags prices.',
    analogue: '1973–82',
    defaultStart: { kind: 'inYears', years: 3 },
    shocks: [...each(ALL_EQUITY, 0.25, 24, 36, 60), shock('bonds', 0.15, 24, 36, 60)],
    rates: [
      { kind: 'inflation', pts: 0.05, months: 72 },
      { kind: 'payTrend', pts: -0.02, months: 72 },
    ],
    phase: 2,
  },
  {
    id: 'twd_surge',
    n: 17,
    name: 'TWD surges',
    group: 'currency',
    palette: 'bad',
    icon: 'ArrowUpRight',
    story:
      'TWD strengthens 20% against USD and JPY over two years, so foreign holdings are worth less in TWD.',
    analogue: 'TWD appreciation 1986–92',
    defaultStart: { kind: 'inYears', years: 2 },
    shocks: [shock('usd', 0.2, 24, 0, 0, 1), shock('jpy', 0.2, 24, 0, 0, 1)],
    phase: 1,
  },
  {
    id: 'yen_collapse',
    n: 18,
    name: 'Yen collapse',
    group: 'currency',
    palette: 'bad',
    icon: 'JapaneseYen',
    story:
      'The yen loses 30% against TWD over three years, half of it coming back later; Japan shares rise in yen.',
    analogue: 'Yen slide 2012–24',
    defaultStart: { kind: 'inYears', years: 2 },
    shocks: [shock('jpy', 0.3, 36, 0, 60, 0.5), shock('jp_equity', -0.1, 36, 0, 60, 1)],
    phase: 2,
  },
  {
    id: 'pandemic',
    n: 19,
    name: 'Pandemic shock',
    group: 'health',
    palette: 'bad',
    icon: 'Biohazard',
    story:
      'A pandemic crashes markets 30% in two months, cuts pay 10% for six months; markets recover within a year.',
    analogue: '2020 COVID crash',
    defaultStart: { kind: 'inYears', years: 2 },
    shocks: each(ALL_EQUITY, 0.3, 2, 1, 12),
    rates: [{ kind: 'cash', pts: -0.01, months: 12 }],
    pay: { factor: 0.9, months: 6 },
    phase: 2,
  },
  {
    id: 'earthquake',
    n: 20,
    name: 'Major Taiwan earthquake',
    group: 'health',
    palette: 'bad',
    icon: 'Activity',
    story:
      'A big earthquake damages homes: property in the area −15%, a short dip in Taiwan shares, and a repair bill.',
    analogue: '1999 Chi-Chi earthquake',
    defaultStart: { kind: 'inYears', years: 3 },
    shocks: [
      shock('tw_property', 0.15, 1, 3, 24),
      shock('taipei_property', 0.08, 1, 3, 24),
      shock('tw_equity', 0.1, 1, 1, 6),
    ],
    lump: -500_000,
    phase: 2,
  },
  {
    id: 'ai_boom',
    n: 21,
    name: 'AI productivity boom',
    group: 'lucky',
    palette: 'good',
    icon: 'Sparkles',
    story:
      'An AI boom lifts US shares 60% and Taiwan shares 50% above normal over four years; 30% is given back later.',
    analogue: 'Late 1990s; 2023–24 AI rally',
    defaultStart: { kind: 'inYears', years: 1 },
    shocks: [shock('us_equity', -0.6, 48, 0, 24, 0.7), shock('tw_equity', -0.5, 48, 0, 24, 0.7)],
    phase: 2,
  },
  {
    id: 'semis_supercycle',
    n: 22,
    name: 'Semiconductor supercycle',
    group: 'lucky',
    palette: 'good',
    icon: 'CircuitBoard',
    story: 'A chip boom lifts Taiwan shares 40%, TWD 8% and Taipei property 15% over three years.',
    analogue: '2020–21 chip boom',
    defaultStart: { kind: 'inYears', years: 1 },
    shocks: [
      shock('tw_equity', -0.4, 36, 0, 0, 1),
      shock('usd', 0.08, 36, 0, 0, 1),
      shock('taipei_property', -0.15, 36, 0, 0, 1),
    ],
    phase: 2,
  },
  {
    id: 'job_loss',
    n: 23,
    name: 'Job loss',
    group: 'personal',
    palette: 'personal',
    icon: 'BriefcaseBusiness',
    story:
      'No take-home pay for 12 months while spending carries on, so savings stop and the gap comes from investments.',
    defaultStart: { kind: 'inYears', years: 3 },
    shocks: [],
    pay: { factor: 0, months: 12 },
    phase: 1,
  },
  {
    id: 'medical',
    n: 24,
    name: 'Major medical cost',
    group: 'personal',
    palette: 'personal',
    icon: 'HeartPulse',
    story: 'A NT$1.0M medical bill and pay down 30% for a year.',
    defaultStart: { kind: 'inYears', years: 8 },
    shocks: [],
    pay: { factor: 0.7, months: 12 },
    lump: -1_000_000,
    phase: 2,
  },
  {
    id: 'strong_rally',
    n: 25,
    name: 'Strong recovery rally',
    group: 'lucky',
    palette: 'good',
    icon: 'Rocket',
    story: 'Shares everywhere rise 25% above normal over a year.',
    defaultStart: { kind: 'inYears', years: 1 },
    shocks: each(ALL_EQUITY, -0.25, 12, 0, 0, 1),
    phase: 2,
  },
  {
    id: 'japan_revival',
    n: 26,
    name: 'Japan revival',
    group: 'lucky',
    palette: 'good',
    icon: 'Sunrise',
    story: 'Japan shares +40%, the yen +10% against TWD and Tokyo property +15% over three years.',
    defaultStart: { kind: 'inYears', years: 1 },
    shocks: [
      shock('jp_equity', -0.4, 36, 0, 0, 1),
      shock('jpy', -0.1, 36, 0, 0, 1),
      shock('jp_property', -0.15, 36, 0, 0, 1),
    ],
    phase: 2,
  },
  {
    id: 'rate_cuts',
    n: 27,
    name: 'Rate cuts lift property',
    group: 'lucky',
    palette: 'good',
    icon: 'BadgePercent',
    story: 'Lower rates lift property 10% and bonds 5%; floating mortgages cost 1.5 points less.',
    defaultStart: { kind: 'inYears', years: 1 },
    shocks: [...each(ALL_PROPERTY, -0.1, 18, 0, 0, 1), shock('bonds', -0.05, 18, 0, 0, 1)],
    rates: [{ kind: 'mortgage', pts: -0.015, months: 1200 }],
    phase: 2,
  },
  {
    id: 'pay_rise',
    n: 28,
    name: 'Pay rise or promotion',
    group: 'personal',
    palette: 'personal',
    icon: 'TrendingUp',
    story: 'Take-home pay rises 20% from this month, for good.',
    defaultStart: { kind: 'inYears', years: 1 },
    shocks: [],
    pay: { factor: 1.2 },
    phase: 2,
  },
  {
    id: 'windfall',
    n: 29,
    name: 'Windfall',
    group: 'personal',
    palette: 'personal',
    icon: 'Gift',
    story: 'A one-off NT$2M arrives (an inheritance, a bonus) and is invested by your target mix.',
    defaultStart: { kind: 'inYears', years: 1 },
    shocks: [],
    lump: 2_000_000,
    phase: 2,
  },
];

export const BACKDROPS = EVENTS.filter((e) => e.group === 'backdrop');
export const PALETTE_EVENTS = EVENTS.filter((e) => e.palette);

/** The quick lump-sum tile (LE-13): any amount at the playhead. */
export const LUMP_EVENT: EventDef = {
  id: 'lump',
  n: 0,
  name: 'One-off amount',
  group: 'personal',
  palette: 'personal',
  icon: 'Banknote',
  story: 'Money in or out this month: a bonus, a wedding, a car.',
  defaultStart: { kind: 'inYears', years: 1 },
  shocks: [],
  lump: 0,
  phase: 2,
};

/** One-tap combinations (PRD library). */
export const COMBOS: { id: string; name: string; events: { id: string; start: Timing }[] }[] = [
  {
    id: 'perfect_storm',
    name: 'Perfect storm',
    events: [
      { id: 'gfc', start: { kind: 'afterStop' } },
      { id: 'job_loss', start: { kind: 'beforeStop', months: 12 } },
    ],
  },
  {
    id: 'tw_double_hit',
    name: 'Taiwan double hit',
    events: [
      { id: 'blockade', start: { kind: 'inYears', years: 5 } },
      { id: 'tw_housing', start: { kind: 'inYears', years: 5 } },
    ],
  },
  {
    id: 'lucky_streak',
    name: 'Lucky streak',
    events: [
      { id: 'ai_boom', start: { kind: 'inYears', years: 1 } },
      { id: 'semis_supercycle', start: { kind: 'inYears', years: 1 } },
    ],
  },
];

export function customToEvent(c: CustomEvent): EventDef {
  return {
    id: c.id,
    n: 0,
    name: c.name,
    group: 'custom',
    palette: c.shocks.every((s) => s.d <= 0) ? 'good' : 'bad',
    icon: 'Wand2',
    story: c.story || 'Your own event.',
    defaultStart: { kind: 'inYears', years: 1 },
    shocks: c.shocks.filter((s) => (FACTORS as readonly string[]).includes(s.factor)) as LevelShock[],
    phase: 2,
  };
}

export function findEvent(id: string, custom: readonly CustomEvent[] = []): EventDef | undefined {
  if (id === LUMP_EVENT.id) return LUMP_EVENT;
  const c = custom.find((x) => x.id === id);
  return c ? customToEvent(c) : EVENTS.find((e) => e.id === id);
}

export const SEVERITY_SCALE: Record<Severity, number> = { mild: 0.5, typical: 1, severe: 1.5 };
export const SEVERITY_LABELS: Record<Severity, string> = {
  mild: 'Mild',
  typical: 'Typical',
  severe: 'Severe',
};

/** Scales depth and length by severity; falls are capped at 95%. */
export function scaleShock(s: LevelShock, severity: Severity): LevelShock {
  const k = SEVERITY_SCALE[severity];
  const d = s.d > 0 ? Math.min(0.95, s.d * k) : s.d * k;
  return {
    ...s,
    d,
    a: Math.max(s.a === 0 ? 0 : 1, Math.round(s.a * k)),
    h: Math.round(s.h * k),
    r: Math.round(s.r * k),
  };
}

/** The shock shape m(t), t in months since the event started. */
export function shockMultiplier(s: LevelShock, t: number): number {
  if (t <= 0) return 1;
  const { d, a, h, r, p } = s;
  if (t < a) return 1 - (d * t) / a;
  if (t < a + h) return 1 - d;
  if (r > 0 && t < a + h + r) return 1 - d + ((d - p * d) * (t - a - h)) / r;
  return 1 - p * d;
}

/** Last month any part of the event is still moving (for "Active" and recovery notes). */
export function eventLength(e: EventDef, severity: Severity): number {
  const k = SEVERITY_SCALE[severity];
  const shockEnd = Math.max(
    0,
    ...e.shocks.map((s) => {
      const x = scaleShock(s, severity);
      return x.a + x.h + x.r;
    }),
  );
  const rateEnd = Math.max(
    0,
    ...(e.rates ?? []).filter((r) => r.months < 1200).map((r) => Math.round(r.months * k)),
  );
  const payEnd = e.pay?.months !== undefined ? Math.round(e.pay.months * k) : 0;
  return Math.max(1, shockEnd, rateEnd, payEnd);
}

const pctText = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;

/** "TW shares −35%, TWD −10% vs USD, Taipei property −20%" at a severity (PB-21, LE-1). */
export function impactText(e: EventDef, severity: Severity = 'typical', amount?: number): string {
  const k = SEVERITY_SCALE[severity];
  const parts: string[] = [];
  const shocks = e.shocks.map((s) => scaleShock(s, severity));
  const equities = shocks.filter((s) => EQUITY_FACTORS.includes(s.factor));
  const allEquitySame =
    equities.length === EQUITY_FACTORS.length && equities.every((s) => s.d === equities[0].d);
  for (const s of shocks) {
    if (allEquitySame && EQUITY_FACTORS.includes(s.factor)) continue;
    if (s.factor === 'usd' || s.factor === 'jpy') {
      const cur = s.factor === 'usd' ? 'USD' : 'JPY';
      parts.push(s.d < 0 ? `TWD −${pctText(s.d)} vs ${cur}` : `${cur} −${pctText(s.d)} vs TWD`);
    } else parts.push(`${FACTOR_LABELS[s.factor]} ${s.d > 0 ? '−' : '+'}${pctText(s.d)}`);
  }
  if (allEquitySame) parts.unshift(`All shares ${equities[0].d > 0 ? '−' : '+'}${pctText(equities[0].d)}`);
  for (const r of e.rates ?? []) {
    const pts = (r.pts * k * 100).toFixed(1).replace(/\.0$/, '');
    const months = Math.round(r.months * k);
    const span =
      months >= 1200 ? '' : ` for ${months >= 24 ? `${Math.round(months / 12)} years` : `${months} months`}`;
    if (r.kind === 'inflation') parts.push(`inflation +${pts} pts${span}`);
    else if (r.kind === 'cashLevel') parts.push(`cash earns ~0%${span}`);
    else if (r.kind === 'cash') parts.push(`cash ${r.pts > 0 ? '+' : ''}${pts} pts${span}`);
    else if (r.kind === 'mortgage') parts.push(`floating loans ${r.pts > 0 ? '+' : ''}${pts} pts${span}`);
    else if (r.kind === 'equityTrend') parts.push(`shares ${r.pts > 0 ? '+' : ''}${pts} pts a year${span}`);
    else if (r.kind === 'equityRealZero') parts.push(`shares flat after inflation${span}`);
    else if (r.kind === 'payTrend') parts.push(`pay lags inflation by ${pts.replace('-', '')} pts`);
  }
  if (e.pay) {
    const f = amount !== undefined && e.lump === undefined ? amount : e.pay.factor;
    const scaled = f < 1 ? 1 - (1 - f) * k : 1 + (f - 1) * k;
    const months = e.pay.months !== undefined ? Math.round(e.pay.months * k) : undefined;
    const change = scaled === 0 ? 'no pay' : `pay ${scaled > 1 ? '+' : '−'}${pctText(scaled - 1)}`;
    parts.push(`${change}${months !== undefined ? ` for ${months} months` : ''}`);
  }
  const lump =
    amount !== undefined && e.lump !== undefined ? amount : e.lump !== undefined ? e.lump * k : undefined;
  if (lump !== undefined && lump !== 0) {
    const m =
      Math.abs(lump) >= 1e6
        ? `NT$${(Math.abs(lump) / 1e6).toFixed(1).replace(/\.0$/, '')}M`
        : `NT$${Math.round(Math.abs(lump) / 1000)}k`;
    parts.push(lump > 0 ? `+${m} cash` : `${m} cost`);
  }
  return parts.join(', ');
}
