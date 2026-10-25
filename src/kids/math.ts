// Beginner mode's own tiny calculator (PRD Part D, "Kid math"): whole NT$, once-a-year growth,
// no inflation, tax or simulations. Rates are "coins for every 100 each year", never percents.

export type Jar = 'spend' | 'save' | 'grow';
export interface Split {
  spend: number;
  save: number;
  grow: number;
}

/** Default jar split: 5, 3 and 2 coins of every 10. */
export const DEFAULT_SPLIT: Split = { spend: 50, save: 30, grow: 20 };

/** Coins for every 100 each year: piggy bank, bank, money tree (parent can change bank and tree). */
export const DEFAULT_GROWTH = { piggy: 0, bank: 1, tree: 6 } as const;

/** "Weather": a fixed repeating 10-year pattern averaging about 6 (KD-12), so replays match. */
export const WEATHER = [15, 8, -10, 20, 4, -5, 12, 6, -2, 12] as const;

/** Splits whole coins across the jars by the split (out of 100); rounding leftovers go to Spend. */
export function splitAmount(amount: number, split: Split): Record<Jar, number> {
  const save = Math.floor((amount * split.save) / 100);
  const grow = Math.floor((amount * split.grow) / 100);
  return { spend: amount - save - grow, save, grow };
}

/** Weeks to reach a goal at a weekly saving pace, rounded up; undefined when not saving. */
export function weeksToGoal(price: number, saved: number, weekly: number): number | undefined {
  if (saved >= price) return 0;
  if (weekly <= 0) return undefined;
  return Math.ceil((price - saved) / weekly);
}

export interface TreeYear {
  year: number;
  /** Coins put in so far. */
  put: number;
  /** Coins the tree grew so far. */
  grew: number;
  total: number;
}

/**
 * Plants `coinsPerWeek` for `years`: tree_y = round(tree_{y−1} × (1 + g/100)) + 52 × coins.
 * `growth` is coins for every 100 each year, or 'weather' for the bumpy pattern.
 */
export function growTree(coinsPerWeek: number, years: number, growth: number | 'weather'): TreeYear[] {
  const out: TreeYear[] = [];
  let tree = 0;
  for (let y = 1; y <= years; y++) {
    const g = growth === 'weather' ? WEATHER[(y - 1) % WEATHER.length] : growth;
    tree = Math.round(tree * (1 + g / 100)) + 52 * coinsPerWeek;
    const put = 52 * coinsPerWeek * y;
    out.push({ year: y, put, grew: tree - put, total: tree });
  }
  return out;
}

/** The freedom number: what a grown-up's life costs a year, times 25 (4 coins for every 100). */
export function freedomNumber(yearlyCost: number): number {
  return yearlyCost * 25;
}

/**
 * The first age at which the tree reaches the freedom number, planting `perMonth` from `fromAge`
 * and growing once a year at `growth` coins for every 100. Undefined if not by `maxAge`.
 */
export function freeAtAge(
  yearlyCost: number,
  perMonth: number,
  fromAge: number,
  growth: number = DEFAULT_GROWTH.tree,
  maxAge = 100,
): { age: number; years: number[] } | undefined {
  const target = freedomNumber(yearlyCost);
  const years: number[] = [];
  let tree = 0;
  for (let age = fromAge + 1; age <= maxAge; age++) {
    tree = Math.round(tree * (1 + growth / 100)) + 12 * perMonth;
    years.push(tree);
    if (tree >= target) return { age, years };
  }
  return undefined;
}

/** A tree picture size, 0 (seed) to 4 (big tree), from the coins in the Grow jar. */
export function treeSize(growCoins: number): 0 | 1 | 2 | 3 | 4 {
  return growCoins >= 10_000 ? 4 : growCoins >= 3_000 ? 3 : growCoins >= 1_000 ? 2 : growCoins > 0 ? 1 : 0;
}
