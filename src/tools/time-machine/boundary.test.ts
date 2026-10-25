// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/** The import boundary of the standalone tools (TM-3), checked through the repo's ESLint config. */
describe('Time Machine import boundary', () => {
  const eslint = new ESLint();
  const errors = async (code: string) => {
    const [result] = await eslint.lintText(code, { filePath: 'src/tools/time-machine/probe.ts' });
    return result.messages.filter((m) => m.ruleId === 'no-restricted-imports').length;
  };

  it('blocks the plan’s data and logic', async () => {
    for (const path of [
      '@/db/db',
      '@/app/data',
      '@/domain/money',
      '@/state/ui',
      '@/io/backup',
      '@/lib/format',
    ]) {
      expect(await errors(`import * as x from '${path}';\nexport default x;\n`), path).toBe(1);
    }
  }, 30_000);

  it('allows the shared UI, chart theme, cn, download and i18n', async () => {
    for (const path of [
      '@/components/ui/button',
      '@/components/charts/theme',
      '@/lib/cn',
      '@/lib/download',
      '@/i18n',
    ]) {
      expect(await errors(`import * as x from '${path}';\nexport default x;\n`), path).toBe(0);
    }
  }, 30_000);
});
