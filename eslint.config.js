import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    // Standalone tools never touch plan data (Time Machine, TM-3). Shared UI, chart theme,
    // cn, download and i18n are the only app imports allowed.
    files: ['src/tools/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/app',
                '@/app/*',
                '@/db',
                '@/db/*',
                '@/domain',
                '@/domain/*',
                '@/state',
                '@/state/*',
                '@/io',
                '@/io/*',
              ],
              message: 'Standalone tools must not use FI Tracker data or logic (PRD Part B, TM-3).',
            },
            {
              group: ['@/features', '@/features/*', '@/hooks', '@/hooks/*', '@/workers', '@/workers/*'],
              message: 'Standalone tools must not use FI Tracker data or logic (PRD Part B, TM-3).',
            },
            {
              regex: '^@/(lib/(?!cn$|download$)|components/(?!ui/|charts/theme$))',
              message:
                'Allowed shared imports: @/components/ui/*, @/components/charts/theme, @/lib/cn, @/lib/download, @/i18n.',
            },
          ],
        },
      ],
    },
  },
  {
    // Beginner mode never reads or changes the plan (PRD Part D, KD-2). Shared UI, cn, download,
    // the mode switch and i18n are the only app imports allowed.
    files: ['src/kids/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/app',
                '@/app/*',
                '@/db',
                '@/db/*',
                '@/domain',
                '@/domain/*',
                '@/state',
                '@/state/*',
                '@/io',
                '@/io/*',
                '@/features',
                '@/features/*',
                '@/hooks',
                '@/hooks/*',
                '@/workers',
                '@/workers/*',
                '@/tools',
                '@/tools/*',
              ],
              message: 'Beginner mode must not use FI Tracker data or logic (PRD Part D, KD-2).',
            },
            {
              regex: '^@/(lib/(?!cn$|download$|mode$)|components/(?!ui/))',
              message:
                'Allowed shared imports: @/components/ui/*, @/lib/cn, @/lib/download, @/lib/mode, @/i18n.',
            },
          ],
        },
      ],
    },
  },
);
