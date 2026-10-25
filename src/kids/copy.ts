import { locale, t } from '@/i18n';
import type { Category, GoalPicture, Source } from './db';
import type { Jar } from './math';

// Labels for Beginner mode: whole coins, no percent signs or decimals on screen (PRD Part D).

/** Whole coins as money: "NT$1,200" in English, "1,200 元" in Chinese. */
export function coins(n: number): string {
  return t('NT${n}', {
    n: new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(Math.round(n)),
  });
}

export function jarName(j: Jar): string {
  return { spend: t('Spend'), save: t('Savings'), grow: t('Grow') }[j];
}

export function jarLine(j: Jar): string {
  return {
    spend: t('For things you want soon.'),
    save: t('For your goals.'),
    grow: t('Planted to grow over years.'),
  }[j];
}

export function sourceName(s: Source): string {
  return {
    allowance: t('Allowance'),
    chores: t('Chores'),
    redEnvelope: t('Red envelope'),
    gift: t('Gift'),
    other: t('Other'),
  }[s];
}

export function categoryName(c: Category): string {
  return {
    snack: t('Snack'),
    toy: t('Toy'),
    book: t('Book'),
    game: t('Game'),
    giftForSomeone: t('Gift for someone'),
    other: t('Other'),
    goal: t('A goal'),
  }[c];
}

export function goalName(p: GoalPicture): string {
  return { bike: t('Bike'), game: t('Game'), book: t('Book'), trip: t('Trip'), gift: t('Gift') }[p];
}

/** "6 coins for every 100 each year", the only way a rate is shown. */
export function rateWords(g: number): string {
  return g === 0 ? t('Coins stay the same') : t('{n} coins for every 100 each year', { n: g });
}

/** Split shown as coins of every 10: "5 of every 10 coins". */
export function splitWords(part: number): string {
  return t('{n} of every 10 coins', { n: Math.round(part / 10) });
}
