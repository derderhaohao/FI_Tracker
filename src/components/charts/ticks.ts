/**
 * Round axis ticks (UI-7): steps of 1, 2, 2.5 or 5 × 10ⁿ, so an axis reads NT$0, NT$5M,
 * NT$10M… rather than the data range split in four.
 */

const STEPS = [1, 2, 2.5, 5, 10];

/** The smallest round step that splits `span` into at most `count` intervals. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const s of STEPS) if (s * mag >= raw * (1 - 1e-9)) return s * mag;
  return 10 * mag;
}

/** Strip floating-point dust: 0.30000000000000004 → 0.3. */
const clean = (v: number) => Number(v.toPrecision(12));

/**
 * Ticks covering [min, max] with about `count` intervals. The axis domain is the first and
 * last tick, so the top tick is always labelled.
 */
export function niceTicks(
  min: number,
  max: number,
  count = 5,
): { ticks: number[]; domain: [number, number] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], domain: [0, 1] };
  if (min > max) [min, max] = [max, min];
  if (min === max) {
    if (min === 0) return { ticks: [0, 1], domain: [0, 1] };
    const step = niceStep(Math.abs(min), 1);
    const lo = min > 0 ? 0 : Math.floor(min / step) * step;
    const hi = min > 0 ? Math.ceil(min / step) * step : 0;
    return niceTicks(lo, hi, count);
  }
  const step = niceStep(max - min, count);
  const lo = clean(Math.floor(min / step + 1e-9) * step);
  const hi = clean(Math.ceil(max / step - 1e-9) * step);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(clean(v));
  return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] };
}

/** Ages every 5 years on round values (35, 40, 45…); every 10 when the span is long. */
export function ageTicks(min: number, max: number): number[] {
  const step = max - min > 60 ? 10 : 5;
  const out: number[] = [];
  for (let a = Math.ceil(min / step) * step; a <= max; a += step) out.push(a);
  return out;
}

/** Whole years every 1, 2, 5 or 10 years, with at most `count` ticks. */
export function yearTicks(min: number, max: number, count = 8): number[] {
  const span = max - min;
  const step = [1, 2, 5, 10, 20, 25, 50].find((s) => span / s <= count) ?? 50;
  const out: number[] = [];
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) out.push(y);
  return out;
}

/**
 * Reference-line labels (UI-8) sit in a band above the plot. Labels that would overlap the
 * previous one on their row move to the next row. `x` is the label's left edge in pixels.
 * Returns each label's row (0 = first).
 */
export function staggerLabels(items: readonly { x: number; width: number }[], gap = 6): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].x - items[b].x);
  const rowEnds: number[] = [];
  const rows = new Array<number>(items.length).fill(0);
  for (const i of order) {
    const { x, width } = items[i];
    let row = rowEnds.findIndex((end) => x >= end + gap);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = x + width;
    rows[i] = row;
  }
  return rows;
}

/** About how wide a label is at 12 px, for staggering without measuring the DOM. */
export function labelWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 12 : 6.6;
  return w + 4;
}

/**
 * Month axes tick on January, or on quarters when the range is under two years (UI-7). `values`
 * are `YYYY-MM` or `YYYY-MM-DD` strings in order; returns the ones to label, or undefined to
 * let the chart choose when too few qualify.
 */
export function monthTicks(values: readonly string[]): string[] | undefined {
  if (values.length < 2) return undefined;
  const month = (v: string) => Number(v.slice(5, 7));
  const index = (v: string) => Number(v.slice(0, 4)) * 12 + month(v) - 1;
  const span = index(values[values.length - 1]) - index(values[0]);
  const pick = (ok: (m: number) => boolean) => {
    const seen = new Set<string>();
    return values.filter((v) => {
      const key = v.slice(0, 7);
      if (!ok(month(v)) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  let out = span >= 24 ? pick((m) => m === 1) : pick((m) => m % 3 === 1);
  // Long ranges: keep at most about eight Januaries.
  if (out.length > 8) {
    const every = Math.ceil(out.length / 8);
    out = out.filter((_, i) => i % every === 0);
  }
  return out.length >= 2 ? out : undefined;
}

/** Y-axis ticks and domain for the plotted series: round steps, top tick labelled (UI-7). */
export function yAxisFor<T extends object>(data: T[], keys: string[], fromZero = true) {
  let lo = fromZero ? 0 : Infinity;
  let hi = fromZero ? 0 : -Infinity;
  for (const row of data)
    for (const k of keys) {
      const v = Number((row as Record<string, unknown>)[k]);
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
  return niceTicks(lo, hi);
}

/** X ticks on round ages (every 5), round years, or Januaries / quarters for months (UI-7). */
export function xTicksFor<T extends object>(data: T[], xKey: string): (number | string)[] | undefined {
  const values = data.map((r) => (r as Record<string, unknown>)[xKey]);
  if (values.length < 2) return undefined;
  if (typeof values[0] === 'number') {
    const nums = values as number[];
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    if (xKey === 'age') return ageTicks(min, max);
    if (xKey === 'year' && min > 1000) return yearTicks(min, max);
    return undefined;
  }
  if (typeof values[0] === 'string' && /^\d{4}-\d{2}/.test(values[0])) return monthTicks(values as string[]);
  return undefined;
}

/** Axis labels drop trailing zeros that round ticks don't need: "NT$5.00M" → "NT$5M", "2.50M" → "2.5M". */
export function trimZeros(label: string): string {
  return label.replace(/(\d)\.(\d*?)0+(?=\D*$)/, (_, d: string, keep: string) => (keep ? `${d}.${keep}` : d));
}
