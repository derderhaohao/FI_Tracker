import { getLang } from '@/i18n';

/** Space left of and right of the plot area, so the event track below can share its age axis. */
export function plotInsets(): { left: number; right: number } {
  return { left: getLang() === 'zh-TW' ? 76 : 64, right: 12 };
}

const CHIP_GAP = 6;

/** Assigns each chip a row so chips that would overlap sit on separate lines. */
export function assignLanes(items: readonly { x: number; width: number }[]): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].x - items[b].x);
  const ends: number[] = [];
  const lanes = new Array<number>(items.length).fill(0);
  for (const i of order) {
    const { x, width } = items[i];
    let lane = ends.findIndex((end) => end + CHIP_GAP <= x);
    if (lane < 0) lane = ends.length;
    ends[lane] = x + width;
    lanes[i] = lane;
  }
  return lanes;
}

/** Month for a horizontal position on the plot, snapped to whole months. */
export function monthAt(x: number, left: number, plotWidth: number, months: number): number {
  if (plotWidth <= 0) return 0;
  return Math.max(0, Math.min(months, Math.round(((x - left) / plotWidth) * months)));
}
