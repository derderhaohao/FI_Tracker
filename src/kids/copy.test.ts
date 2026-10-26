import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ZH_TW as MAIN_ZH_TW } from '@/i18n/zh-TW';
import { KIDS_ZH_TW } from './zh-TW';

/** Shared words come from the main dictionary, the rest from Beginner mode's. */
const ZH_TW: Record<string, string> = { ...MAIN_ZH_TW, ...KIDS_ZH_TW };

/** Beginner mode's source as text (tests excluded). */
const SOURCES = import.meta.glob<string>(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

function kidsKeys(): string[] {
  const keys = new Set<string>();
  for (const [f, text] of Object.entries(SOURCES)) {
    const sf = ts.createSourceFile(
      f,
      text,
      ts.ScriptTarget.Latest,
      true,
      f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't') {
        const a = n.arguments[0];
        if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) keys.add(a.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return [...keys];
}

/**
 * The PRD's automated copy scan (Part D acceptance): no Beginner text shows a percent sign or a
 * decimal, and no Chinese text has an English-only word in it.
 */
describe('Beginner mode copy', () => {
  const keys = kidsKeys();

  it('has text to check', () => {
    expect(keys.length).toBeGreaterThan(250);
  });

  it('never shows a percent sign or a decimal, in either language', () => {
    const bad = keys.flatMap((k) =>
      [k, ZH_TW[k] ?? ''].filter((s) => /%|\d\.\d/.test(s)).map((s) => `${k} → ${s}`),
    );
    expect(bad).toEqual([]);
  });

  it('has Chinese text for every line, with no English words in it', () => {
    const bad = keys.filter((k) => {
      const zh = ZH_TW[k];
      return zh === undefined || /[A-Za-z]/.test(zh.replace(/\{\w+\}/g, ''));
    });
    expect(bad).toEqual([]);
  });
});

describe('rate words (UI-24)', () => {
  it('says "1 coin", not "1 coins"', async () => {
    const { rateWords } = await import('./copy');
    expect(rateWords(1)).toBe('1 coin for every 100 each year');
    expect(rateWords(6)).toBe('6 coins for every 100 each year');
    expect(rateWords(0)).toBe('Coins stay the same');
  });
});
