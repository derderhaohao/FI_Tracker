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
  low: '1 in 10 worse',
  median: 'Typical future',
  high: '1 in 10 better',
  band: '8 in 10 futures',
  target: 'Money needed',
  typical: 'Typical path',
};

export const TECHNICAL_BAND_LABELS: BandLabels = {
  low: 'P10',
  median: 'Median (P50)',
  high: 'P90',
  band: 'P10–P90',
  target: 'FI target',
  typical: 'Deterministic',
};
