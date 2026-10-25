// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/** Beginner mode's import boundary (KD-2), checked through the repo's ESLint config. */
describe('Beginner mode import boundary', () => {
  const eslint = new ESLint();
  const errors = async (code: string) => {
    const [result] = await eslint.lintText(code, { filePath: 'src/kids/probe.ts' });
    return result.messages.filter((m) => m.ruleId === 'no-restricted-imports').length;
  };

  it('blocks the plan’s data and logic', async () => {
    for (const path of [
      '@/db/db',
      '@/app/data',
      '@/domain/money',
      '@/io/backup',
      '@/state/ui',
      '@/tools/time-machine/engine',
      '@/lib/format',
    ]) {
      expect(await errors(`import * as x from '${path}';\nexport default x;\n`), path).toBe(1);
    }
  }, 30_000);

  it('allows the shared UI, cn, download, the mode switch and i18n', async () => {
    for (const path of ['@/components/ui/button', '@/lib/cn', '@/lib/download', '@/lib/mode', '@/i18n']) {
      expect(await errors(`import * as x from '${path}';\nexport default x;\n`), path).toBe(0);
    }
  }, 30_000);
});
