import { t } from '@/i18n';

/** Legend and tooltip names for the range chart, plain (Simple view) or technical. */
export interface BandLabels {
  low: string;
  median: string;
  high: string;
  band: string;
  target: string;
  typical: string;
}

export const PLAIN_BAND_LABELS: BandLabels = {
  low: t('1 in 10 worse'),
  median: t('Typical future'),
  high: t('1 in 10 better'),
  band: t('8 in 10 futures'),
  target: t('Money needed'),
  typical: t('Typical path'),
};

export const TECHNICAL_BAND_LABELS: BandLabels = {
  low: 'P10',
  median: t('Median (P50)'),
  high: 'P90',
  band: 'P10–P90',
  target: t('FI target'),
  typical: t('Deterministic'),
};
