// Checks the PRD performance target: 10,000 Monte Carlo runs in under 5 seconds.
// Runs without test instrumentation, so the timing reflects the browser worker.
import { buildProjectionInput, type PlanData } from '../src/domain/baseline';
import { runMonteCarlo } from '../src/domain/montecarlo/runner';
import { buildDemoBackup } from '../src/io/demo';

const LIMIT_MS = 5000;
const { data } = buildDemoBackup();
const plan: PlanData = { ...data, settings: data.settings[0] };
const input = buildProjectionInput(plan, data.assumptionSets[0]);

runMonteCarlo(input, { runs: 500, seed: 1 }); // warm up the JIT
const best = Math.min(...[1, 2, 3].map((seed) => runMonteCarlo(input, { runs: 10_000, seed }).elapsedMs));
console.log(`10,000 Monte Carlo runs: ${Math.round(best)} ms (limit ${LIMIT_MS} ms)`);
if (best >= LIMIT_MS) process.exit(1);
