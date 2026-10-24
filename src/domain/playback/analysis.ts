import { ASSET_CLASS_LABELS, type AssetClass } from '../entities';
import { BASE_CURRENCY } from '../fx';
import { EQUITY_FACTORS } from './library';
import { REGION_KEY_LABELS, type PlaybackPath, type RegionKey, type ResolvedEvent } from './engine';

/** Pure helpers for the playback screen: pacing, stats, groups, impact, milestones. */

export interface Milestone {
  month: number;
  label: string;
  kind: 'stop' | 'pension' | 'insurance' | 'eventStart' | 'eventEnd' | 'runOut';
  uid?: string;
}

export function milestones(path: PlaybackPath): Milestone[] {
  const { input } = path.setup;
  const out: Milestone[] = [];
  const atAge = (age: number) => (age - path.startAge) * 12;
  if (path.retireMonth !== undefined) out.push({ month: path.retireMonth, label: 'Stop work', kind: 'stop' });
  const pensionAge = input.pension.accessAge;
  if (path.setup.accounts.some((a) => a.pension) && atAge(pensionAge) > 0 && atAge(pensionAge) < path.months)
    out.push({ month: atAge(pensionAge), label: `勞退 unlocks (${pensionAge})`, kind: 'pension' });
  if (
    input.laborInsurance &&
    atAge(input.laborInsurance.claimAge) > 0 &&
    atAge(input.laborInsurance.claimAge) < path.months
  )
    out.push({
      month: atAge(input.laborInsurance.claimAge),
      label: `勞保 starts (${input.laborInsurance.claimAge})`,
      kind: 'insurance',
    });
  for (const e of path.events) {
    if (e.source === 'backdrop' && e.def.id === 'normal') continue;
    out.push({ month: e.start, label: e.def.name, kind: 'eventStart', uid: e.uid });
    const end = e.start + e.length;
    if (e.shocks.length && end < path.months)
      out.push({ month: end, label: `${e.def.name} ends`, kind: 'eventEnd', uid: e.uid });
  }
  if (path.depletionMonth !== undefined)
    out.push({ month: path.depletionMonth, label: 'Money runs out', kind: 'runOut' });
  return out.sort((a, b) => a.month - b.month);
}

/** Events running at a month (backdrops excluded). */
export function activeEvents(path: PlaybackPath, m: number): ResolvedEvent[] {
  return path.events.filter((e) => e.source !== 'backdrop' && m >= e.start && m < e.start + e.length);
}

/**
 * Smart pacing (PRD): slow (1 month a second) around milestones and event starts, a little
 * faster through an event, and quick through quiet stretches, scaled so the whole story
 * plays in about two minutes. Returns months per second for each month.
 */
export function smartPace(path: PlaybackPath, targetSeconds = 120): Float64Array {
  const pace = new Float64Array(path.months + 1);
  const slow = new Uint8Array(path.months + 1);
  const mid = new Uint8Array(path.months + 1);
  for (const ms of milestones(path)) {
    for (
      let m = Math.max(0, ms.month - 3);
      m <= Math.min(path.months, ms.month + (ms.kind === 'eventStart' ? 6 : 3));
      m++
    )
      slow[m] = 1;
  }
  for (const e of path.events) {
    if (e.source === 'backdrop') continue;
    for (let m = e.start; m <= Math.min(path.months, e.start + Math.min(e.length, 36)); m++) mid[m] = 1;
  }
  let fixed = 0;
  let quiet = 0;
  for (let m = 0; m <= path.months; m++) {
    if (slow[m]) fixed += 1;
    else if (mid[m]) fixed += 1 / 4;
    else quiet += 1;
  }
  // Quiet months take what is left of the target, between 6 and 24 months a second.
  const left = Math.max(10, targetSeconds - fixed);
  const quietSpeed = Math.min(24, Math.max(6, quiet / left));
  for (let m = 0; m <= path.months; m++) pace[m] = slow[m] ? 1 : mid[m] ? 4 : quietSpeed;
  return pace;
}

export function playSeconds(pace: Float64Array): number {
  let s = 0;
  for (let m = 0; m < pace.length - 1; m++) s += 1 / pace[m];
  return s;
}

export interface PathStats {
  finalInvestable: number;
  finalTotal: number;
  lowest: number;
  lowestMonth: number;
  /** Worst market fall of the portfolio from a peak (time-weighted, so saving and spending don't count). */
  drawdown: number;
  drawdownPeakMonth: number;
  drawdownTroughMonth: number;
  /** Months from the trough until the portfolio's returns make up the fall; undefined if they never do. */
  recoveryMonths?: number;
}

/** Growth of NT$1 invested at the start, ignoring money added or taken out. */
export function returnIndex(path: PlaybackPath): Float64Array {
  const idx = new Float64Array(path.months + 1);
  idx[0] = 1;
  for (let m = 0; m < path.months; m++) {
    const before = path.investable[m];
    const flow = path.flow[m + 1];
    // Flows land mid-month: half of them earn the month's return.
    const base = before + flow / 2;
    const r = base > 1 ? (path.investable[m + 1] - before - flow) / base : 0;
    idx[m + 1] = idx[m] * (1 + r);
  }
  return idx;
}

export function pathStats(path: PlaybackPath): PathStats {
  const v = path.investable;
  let lowest = Infinity;
  let lowestMonth = 0;
  for (let m = 0; m <= path.months; m++)
    if (v[m] < lowest) {
      lowest = v[m];
      lowestMonth = m;
    }
  const idx = returnIndex(path);
  let peak = idx[0];
  let peakMonth = 0;
  let drawdown = 0;
  let ddPeak = 0;
  let ddTrough = 0;
  for (let m = 0; m <= path.months; m++) {
    if (idx[m] > peak) {
      peak = idx[m];
      peakMonth = m;
    }
    const dd = (peak - idx[m]) / peak;
    if (dd > drawdown) {
      drawdown = dd;
      ddPeak = peakMonth;
      ddTrough = m;
    }
  }
  let recoveryMonths: number | undefined;
  if (drawdown > 0)
    for (let m = ddTrough; m <= path.months; m++)
      if (idx[m] >= idx[ddPeak]) {
        recoveryMonths = m - ddTrough;
        break;
      }
  return {
    finalInvestable: v[path.months],
    finalTotal: path.total[path.months],
    lowest,
    lowestMonth,
    drawdown,
    drawdownPeakMonth: ddPeak,
    drawdownTroughMonth: ddTrough,
    recoveryMonths,
  };
}

/** How many of 100 simulated futures this value beats (sorted ascending input). */
export function rankOutOf100(sorted: readonly number[], value: number): number {
  if (sorted.length === 0) return 0;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((lo / sorted.length) * 100);
}

export interface Impact {
  /** Change in investable at the horizon. */
  horizon: number;
  /** Change in FI date in months (positive = later), if FI was still ahead. */
  fiMonths?: number;
  runOutBefore?: number;
  runOutAfter?: number;
}

export function impactOf(before: PlaybackPath, after: PlaybackPath, atMonth: number): Impact {
  const fiBefore = before.yearsToFi !== undefined ? before.yearsToFi * 12 : undefined;
  const fiAfter = after.yearsToFi !== undefined ? after.yearsToFi * 12 : undefined;
  const ahead = fiBefore === undefined || fiBefore > atMonth;
  return {
    horizon: after.investable[after.months] - before.investable[before.months],
    fiMonths: ahead && fiBefore !== undefined && fiAfter !== undefined ? fiAfter - fiBefore : undefined,
    runOutBefore: before.depletionMonth,
    runOutAfter: after.depletionMonth,
  };
}

export function ageAtMonth(path: PlaybackPath, m: number): number {
  return path.startAge + m / 12;
}

/** "−NT$4.1M at 95 · money now runs out at 88" */
export function impactText(path: PlaybackPath, i: Impact, money: (v: number) => string): string {
  const parts = [
    `${i.horizon >= 0 ? '+' : '−'}${money(Math.abs(i.horizon))} at ${path.setup.input.horizonAge}`,
  ];
  if (i.fiMonths !== undefined && Math.abs(i.fiMonths) >= 1)
    parts.push(`FI ${Math.round(Math.abs(i.fiMonths))} months ${i.fiMonths > 0 ? 'later' : 'earlier'}`);
  if (i.runOutAfter !== undefined && i.runOutAfter !== i.runOutBefore)
    parts.push(`money now runs out at ${Math.floor(ageAtMonth(path, i.runOutAfter))}`);
  else if (i.runOutAfter === undefined && i.runOutBefore !== undefined) parts.push('money now lasts');
  return parts.join(' · ');
}

/** Lowest combined level of share prices across the story (1 = no loss). */
export function worstEquityLevel(path: PlaybackPath): number {
  let worst = 1;
  for (let m = 0; m <= path.months; m++) {
    const lvl = Math.min(...EQUITY_FACTORS.map((f) => path.factorLevels[f][m]));
    if (lvl < worst) worst = lvl;
  }
  return worst;
}

export type Grouping = 'class' | 'region' | 'currency';

export interface GroupRow {
  key: string;
  label: string;
  /** Real TWD at each requested month. */
  value: number;
  accounts: { id: string; name: string; value: number; currency: string }[];
}

const CLASS_ORDER: (AssetClass | 'pension' | 'insurance' | 'loans')[] = [
  'cash',
  'tw_equity',
  'us_equity',
  'global_equity',
  'bond',
  'property',
  'pension',
  'insurance',
  'other',
  'loans',
];

function classKey(a: PlaybackPath['setup']['accounts'][number]): (typeof CLASS_ORDER)[number] {
  if (a.bucket === 'liability') return 'loans';
  if (a.pension) return 'pension';
  if (a.insurance) return 'insurance';
  return a.cls;
}

const CLASS_GROUP_LABELS: Record<string, string> = {
  ...ASSET_CLASS_LABELS,
  pension: '勞退 pension',
  insurance: 'Savings insurance',
  loans: 'Loans',
};

/**
 * Splits month m's net worth into display groups (PB-11, PB-12, PB-30). Funds with a region
 * split spread across regions; loans count as negative. Rows add up to total net worth.
 */
export function groupRows(path: PlaybackPath, m: number, grouping: Grouping): GroupRow[] {
  const values = path.values[m];
  const rows = new Map<string, GroupRow>();
  const add = (key: string, label: string, v: number, acc?: GroupRow['accounts'][number]) => {
    const r = rows.get(key) ?? { key, label, value: 0, accounts: [] };
    r.value += v;
    if (acc && Math.abs(acc.value) > 0.5) r.accounts.push(acc);
    rows.set(key, r);
  };
  path.setup.accounts.forEach((a, i) => {
    const sign = a.bucket === 'liability' ? -1 : 1;
    const v = sign * values[i];
    if (Math.abs(v) < 0.5) return;
    const acc = { id: a.id, name: a.name, value: v, currency: a.currency };
    if (grouping === 'class') {
      const k = classKey(a);
      add(k, CLASS_GROUP_LABELS[k] ?? k, v, acc);
    } else if (grouping === 'currency') add(a.currency, a.currency, v, acc);
    else {
      for (const [r, w] of Object.entries(a.regions)) {
        if (!w) continue;
        add(r, REGION_KEY_LABELS[r as RegionKey], v * w, { ...acc, value: v * w });
      }
    }
  });
  const order = (k: string) => {
    if (grouping === 'class') return CLASS_ORDER.indexOf(k as (typeof CLASS_ORDER)[number]);
    if (grouping === 'currency') return k === BASE_CURRENCY ? -1 : k.charCodeAt(0);
    return Object.keys(REGION_KEY_LABELS).indexOf(k);
  };
  return [...rows.values()].sort((a, b) => order(a.key) - order(b.key));
}

/** Keys of every group that appears at any point in the story (for a stable stacked chart). */
export function allGroupKeys(path: PlaybackPath, grouping: Grouping): { key: string; label: string }[] {
  const seen = new Map<string, string>();
  for (let m = 0; m <= path.months; m += 12)
    for (const r of groupRows(path, m, grouping)) seen.set(r.key, r.label);
  for (const r of groupRows(path, path.months, grouping)) seen.set(r.key, r.label);
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}

/** Month investable assets get back to their level just before an event, if they do (PB-22). */
export function recoveryMonth(path: PlaybackPath, e: ResolvedEvent): number | undefined {
  const before = path.investable[e.start];
  let fell = false;
  for (let m = e.start + 1; m <= path.months; m++) {
    if (path.investable[m] < before * 0.99) fell = true;
    if (fell && path.investable[m] >= before) return m;
  }
  return undefined;
}

/** "4 years 3 months" */
export function spanText(months: number): string {
  const y = Math.floor(months / 12);
  const mo = Math.round(months % 12);
  const parts: string[] = [];
  if (y) parts.push(`${y} year${y === 1 ? '' : 's'}`);
  if (mo || !y) parts.push(`${mo} month${mo === 1 ? '' : 's'}`);
  return parts.join(' ');
}
