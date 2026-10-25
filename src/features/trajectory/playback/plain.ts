import { t } from '@/i18n';

/**
 * One plain sentence per story and event (PRD Playback UX PX-13), shown on story cards and
 * picker cards beside the existing impact text. The numbers stay in the library.
 */
export const PLAIN: Record<string, string> = {
  // Backdrops
  normal: t('Markets do what they usually do, every year.'),
  lucky_decade: t('Ten good years: shares grow a little faster than usual.'),
  unlucky_decade: t('Ten weak years: shares grow a little slower than usual.'),
  lost_decades: t('Shares go nowhere for 12 years and property slides.'),
  // Events
  blockade: t('Taiwan shares and homes fall, then recover over a few years.'),
  strait_conflict: t('A deep, long fall in Taiwan, felt around the world.'),
  oil_shock: t('Oil prices jump; shares dip and prices rise.'),
  decoupling: t('Trade splits: China shares fall hardest, Taiwan half recovers.'),
  europe_war: t('European shares fall; energy and the US dollar rise.'),
  gfc: t('Shares fall about half, recover over 5 years.'),
  tech_bubble: t('Tech shares slide for two and a half years; bonds do well.'),
  us_housing: t('US home prices fall 30% and US shares follow.'),
  tw_housing: t('Taiwan home prices cool for three years.'),
  asian_currency: t('Asian markets and the TWD drop sharply.'),
  rate_shock: t('Interest rates jump: bonds, shares and homes all fall.'),
  stagflation: t('Prices rise fast for years while investments lose ground.'),
  twd_surge: t('A stronger TWD makes foreign investments worth less.'),
  yen_collapse: t('The yen loses a third against the TWD.'),
  pandemic: t('A sudden 30% crash that recovers within a year.'),
  earthquake: t('Local homes lose value and there is a repair bill.'),
  ai_boom: t('US and Taiwan shares surge for four years, then give some back.'),
  semis_supercycle: t('A chip boom lifts Taiwan shares, the TWD and Taipei homes.'),
  job_loss: t('No pay for a year, so saving stops.'),
  medical: t('A NT$1M bill and lower pay for a year.'),
  strong_rally: t('Shares everywhere jump 25% in a year.'),
  japan_revival: t('Japanese shares, the yen and Tokyo homes rise.'),
  rate_cuts: t('Lower rates lift homes and bonds.'),
  pay_rise: t('Take-home pay rises 20% for good.'),
  windfall: t('NT$2M arrives and is invested.'),
  lump: t('A one-off amount in or out, this month.'),
  // One-tap combinations
  perfect_storm: t('You lose your job, then markets crash just after you stop work.'),
  tw_double_hit: t('A blockade and a housing slump at the same time.'),
  lucky_streak: t('An AI boom and a chip boom together.'),
};

/** Plain line for an event or story; custom events fall back to their own text. */
export function plainLine(id: string, fallback = ''): string {
  return PLAIN[id] ?? fallback;
}

/** Tiny path shapes for story cards, as SVG points on a 100 × 28 box (y grows downward). */
export const SHAPES: Record<string, string> = {
  normal: '0,26 25,20 50,14 75,8 100,2',
  lucky_decade: '0,26 20,16 40,8 60,5 100,1',
  unlucky_decade: '0,26 20,25 40,23 60,18 100,8',
  lost_decades: '0,22 20,21 40,22 60,21 80,16 100,10',
  perfect_storm: '0,26 35,12 45,22 55,24 75,14 100,6',
  tw_double_hit: '0,24 20,18 28,26 45,22 70,12 100,4',
  lucky_streak: '0,26 15,14 30,6 45,8 70,4 100,1',
  saved: '0,24 30,16 45,20 70,10 100,4',
};
