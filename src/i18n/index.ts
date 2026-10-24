import { useSyncExternalStore } from 'react';
import { ZH_TW } from './zh-TW';

/**
 * English / Taiwan Traditional Chinese. Text is keyed by its English wording, with
 * `{name}` placeholders, so a missing translation falls back to English. The choice is
 * kept on this device; the default follows the browser language.
 */

export type Lang = 'en' | 'zh-TW';
export const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' },
];

const KEY = 'fi-tracker-lang';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'zh-TW') return saved;
  } catch {
    // Storage blocked: fall back to the browser language.
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return /^zh/i.test(nav) ? 'zh-TW' : 'en';
}

let current: Lang = typeof window !== 'undefined' ? detect() : 'en';
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // The choice lasts for this visit only.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh-TW' ? 'zh-Hant-TW' : 'en';
  for (const l of listeners) l();
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}

/** Values left empty render as nothing, as they would in JSX. */
export type Vars = Record<string, string | number | null | undefined | false>;

/** Translates English text; `{name}` placeholders are filled from `vars`. */
export function t(text: string, vars?: Vars): string {
  const s = current === 'zh-TW' ? (ZH_TW[text] ?? text) : text;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => {
    if (!(k in vars)) return m;
    const v = vars[k];
    return v === undefined || v === null || v === false ? '' : String(v);
  });
}

/** Picks the singular or plural English form, then translates it. */
export function tn(n: number, one: string, many: string, vars: Vars = {}): string {
  return t(n === 1 ? one : many, { n, ...vars });
}

/** A label map whose values translate when read, so `LABELS[x]` follows the language. */
export function translated<T extends Record<string, string>>(map: T): T {
  return new Proxy(map, {
    get: (o, k) => {
      const v = (o as Record<string | symbol, unknown>)[k];
      return typeof v === 'string' ? t(v) : v;
    },
  });
}

/** BCP 47 locale for dates and numbers. */
export function locale(): string {
  return current === 'zh-TW' ? 'zh-TW' : 'en-US';
}

if (typeof document !== 'undefined')
  document.documentElement.lang = current === 'zh-TW' ? 'zh-Hant-TW' : 'en';
