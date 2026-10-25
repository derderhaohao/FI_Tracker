// Prints the test coverage as a Markdown table, by area, for the CI job summary.
import { readFileSync } from 'node:fs';

const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const keys = ['statements', 'branches', 'functions', 'lines'];
const areas = new Map();
for (const [file, v] of Object.entries(summary)) {
  if (file === 'total') continue;
  const area = file
    .replace(/^.*?\/src\//, '')
    .split('/')[0]
    .replace(/\.\w+$/, '');
  const a = areas.get(area) ?? Object.fromEntries(keys.map((k) => [k, { covered: 0, total: 0 }]));
  for (const k of keys) {
    a[k].covered += v[k].covered;
    a[k].total += v[k].total;
  }
  areas.set(area, a);
}
const pct = (m) => (m.total === 0 ? '–' : `${((100 * m.covered) / m.total).toFixed(1)}%`);
const lines = [
  '## Test coverage',
  '',
  '| Area | Statements | Branches | Functions | Lines |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...[...areas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([area, a]) => `| ${area} | ${keys.map((k) => pct(a[k])).join(' | ')} |`),
  `| **All** | ${keys.map((k) => `**${pct(summary.total[k])}**`).join(' | ')} |`,
];
console.log(lines.join('\n'));
