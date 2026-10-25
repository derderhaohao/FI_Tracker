import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { formatMoney } from '@/domain/money';
import { monthLabel } from '@/lib/format';
import { getLang, setLang, t, tn } from './index';
import { KIDS_ZH_TW } from '@/kids/zh-TW';
import { ZH_TW as MAIN_ZH_TW } from './zh-TW';

/** The main dictionary plus Beginner mode's, which loads with its lazy chunk. */
const ZH_TW: Record<string, string> = { ...MAIN_ZH_TW, ...KIDS_ZH_TW };

/** The app source as text, test files and this folder excluded. */
const SOURCES = import.meta.glob<string>(
  ['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '!../**/*.test.tsx', '!./**'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);

/** Every literal text passed to `t()` / `tn()` in the app source. */
function sourceKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const [f, text] of Object.entries(SOURCES)) {
    const sf = ts.createSourceFile(
      f,
      text,
      ts.ScriptTarget.Latest,
      true,
      f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        (n.expression.text === 't' || n.expression.text === 'tn')
      ) {
        const args = n.expression.text === 't' ? [n.arguments[0]] : [n.arguments[1], n.arguments[2]];
        for (const a of args) {
          if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) keys.set(a.text, f);
          else keys.set(`<non-literal> ${n.getText().slice(0, 60)}`, f);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return keys;
}

const placeholders = (s: string) => new Set(s.match(/\{\w+\}/g) ?? []);

describe('i18n', () => {
  afterEach(() => setLang('en'));

  it('has a Traditional Chinese entry for every text in the code', () => {
    const keys = sourceKeys();
    expect(keys.size).toBeGreaterThan(1000);
    const missing = [...keys].filter(([k]) => !(k in ZH_TW)).map(([k, f]) => `${f}: ${k}`);
    expect(missing).toEqual([]);
  });

  it('uses only placeholders the English text provides', () => {
    const wrong = Object.entries(ZH_TW).filter(([en, zh]) =>
      [...placeholders(zh)].some((p) => !placeholders(en).has(p)),
    );
    expect(wrong).toEqual([]);
  });

  it('defaults to English and fills placeholders', () => {
    expect(getLang()).toBe('en');
    expect(t('Age {age}', { age: 49 })).toBe('Age 49');
    expect(tn(1, '1 year', '{n} years')).toBe('1 year');
    expect(tn(3, '1 year', '{n} years')).toBe('3 years');
    expect(t('Not in the catalog')).toBe('Not in the catalog');
  });

  it('switches to Taiwan Traditional Chinese', () => {
    setLang('zh-TW');
    expect(t('Dashboard')).toBe('總覽');
    expect(t('Age {age}', { age: 49 })).toBe('49 歲');
    expect(tn(3, '1 year', '{n} years')).toBe('3 年');
    expect(t('Not in the catalog')).toBe('Not in the catalog');
    expect(document.documentElement.lang).toBe('zh-Hant-TW');
  });

  it('formats amounts in 萬 and 億 and dates the Taiwan way', () => {
    expect(formatMoney(24_234_000, 'TWD', { compact: true })).toBe('NT$24.2M');
    setLang('zh-TW');
    expect(formatMoney(24_234_000, 'TWD', { compact: true })).toBe('NT$2423萬');
    expect(formatMoney(150_000_000, 'TWD', { compact: true })).toBe('NT$1.50億');
    expect(formatMoney(5_000, 'TWD', { compact: true })).toBe('NT$5,000');
    expect(monthLabel('2037-11')).toBe('2037年11月');
  });
});
