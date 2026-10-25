import { describe, expect, it } from 'vitest';
import { freeAtAge, freedomNumber, growTree, splitAmount, treeSize, weeksToGoal, WEATHER } from './math';

describe('kid math (PRD Part D)', () => {
  it('NT$100 a week at 6 for 10 years follows the formula exactly; the piggy bank gives 52,000', () => {
    let tree = 0;
    for (let y = 1; y <= 10; y++) tree = Math.round(tree * 1.06) + 5_200;
    const years = growTree(100, 10, 6);
    expect(years.at(-1)!.total).toBe(tree);
    expect(years.at(-1)!.put).toBe(52_000);
    expect(years.at(-1)!.grew).toBe(tree - 52_000);
    expect(growTree(100, 10, 0).at(-1)!.total).toBe(52_000);
  });

  it('a yearly cost of NT$400,000 needs a freedom number of NT$10,000,000', () => {
    expect(freedomNumber(400_000)).toBe(10_000_000);
    // Planting NT$20,000 a month from 25 at 6: the tree first reaches 10,000,000 at this age.
    const r = freeAtAge(400_000, 20_000, 25)!;
    let tree = 0;
    let age = 25;
    while (tree < 10_000_000) {
      age++;
      tree = Math.round(tree * 1.06) + 240_000;
    }
    expect(r.age).toBe(age);
    expect(r.years.at(-1)).toBe(tree);
    expect(freeAtAge(400_000, 100, 25)).toBeUndefined();
  });

  it('the weather replays the same bumpy years, averaging about 6', () => {
    expect(growTree(50, 12, 'weather')).toEqual(growTree(50, 12, 'weather'));
    const avg = WEATHER.reduce((a, b) => a + b, 0) / WEATHER.length;
    expect(Math.round(avg)).toBe(6);
    const bumpy = growTree(50, 10, 'weather');
    expect(bumpy.some((y, i) => i > 0 && y.total - bumpy[i - 1].total < 52 * 50)).toBe(true);
  });

  it('weeks to a goal round up, and jars split whole coins', () => {
    expect(weeksToGoal(200, 50, 30)).toBe(5);
    expect(weeksToGoal(200, 200, 30)).toBe(0);
    expect(weeksToGoal(200, 0, 0)).toBeUndefined();
    expect(splitAmount(100, { spend: 50, save: 30, grow: 20 })).toEqual({ spend: 50, save: 30, grow: 20 });
    expect(splitAmount(15, { spend: 50, save: 30, grow: 20 })).toEqual({ spend: 8, save: 4, grow: 3 });
    expect(treeSize(0)).toBe(0);
    expect(treeSize(12_000)).toBe(4);
  });
});
