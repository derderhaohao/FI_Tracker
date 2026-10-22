// Regenerates sample-data/demo.json from src/io/demo.ts (fictional data only).
import { writeFileSync } from 'node:fs';
import { buildDemoBackup } from '../src/io/demo';

writeFileSync(
  new URL('../sample-data/demo.json', import.meta.url),
  JSON.stringify(buildDemoBackup(), null, 2) + '\n',
);
console.log('Wrote sample-data/demo.json');
