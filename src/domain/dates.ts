/** String date helpers. Months are `YYYY-MM`, days `YYYY-MM-DD`; no Date objects in storage. */

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function yearOf(dateOrMonth: string): number {
  return Number(dateOrMonth.slice(0, 4));
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(mon).padStart(2, '0')}`;
}

/** Whole months from `from` to `to` (negative when `to` is earlier). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** Inclusive list of months from `from` to `to`. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** Today in local time as `YYYY-MM-DD`. */
export function today(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** `YYYY-MM-DD` plus `n` days. */
export function addDays(date: string, n: number): string {
  const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Age reached during the year of `date`. */
export function ageAt(birthYear: number, date: string): number {
  return yearOf(date) - birthYear;
}
