// Fails when a file that may hold personal financial data is tracked by git.
import { execSync } from 'node:child_process';

const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const blocked = files.filter(
  (f) => f.endsWith('.fi.json') || /(^|\/)backups\//.test(f) || /(^|\/)\.env/.test(f),
);
if (blocked.length > 0) {
  console.error('Blocked data files are committed:\n' + blocked.map((f) => `  ${f}`).join('\n'));
  process.exit(1);
}
console.log(`Checked ${files.length} tracked files: no blocked data files.`);
