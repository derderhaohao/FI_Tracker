import { budgetVsActual, dateAfterYears, monthLabel, pct, twd, twdCompact } from './format';
import { monthlyReminderIcs, nextReminderDate, downloadMonthlyReminder } from './ics';
import { inflationIndex, toMode } from './valueMode';
import { getMode, setMode } from './mode';
import { downloadText, readFileText } from './download';
import { GLOSSARY, JARGON, type GlossaryParams } from './glossary';
import { addTranslations, getLang, locale, setLang, t, tn, translated } from '@/i18n';
import { makeInput } from '@/domain/testFixtures';
import { runProjection } from '@/domain/projection';

afterEach(() => setLang('en'));

describe('format helpers', () => {
  it('formats TWD amounts and percentages', () => {
    expect(twd(1_234_567)).toMatch(/1,234,567/);
    expect(twdCompact(12_500_000)).toMatch(/12\.5M|1,250萬|12M/);
    expect(pct(0.256)).toBe('25.6%');
    expect(pct(0.256, 0)).toBe('26%');
  });

  it('adds fractional years to a month', () => {
    expect(dateAfterYears('2026-01-15', 0)).toBe('Jan 2026');
    expect(dateAfterYears('2026-01-15', 1.5)).toBe('Jul 2027');
    expect(dateAfterYears('2026-11-01', 0.25)).toBe('Feb 2027');
    expect(monthLabel('2030-12')).toBe('Dec 2030');
  });

  it('follows the language for dates', () => {
    setLang('zh-TW');
    expect(monthLabel('2030-12')).toMatch(/2030/);
    expect(monthLabel('2030-12')).toMatch(/12/);
  });

  it('compares the FI budget with current spending in words', () => {
    expect(budgetVsActual(undefined, 100)).toBe('');
    expect(budgetVsActual(100_00, 0)).toBe('');
    expect(budgetVsActual(100_00, 100)).toBe('same');
    expect(budgetVsActual(140_00, 100)).toBe('40% more');
    expect(budgetVsActual(75_00, 100)).toBe('25% less');
  });
});

describe('calendar reminder', () => {
  it('picks the next reminder date this month or next', () => {
    expect(nextReminderDate('2026-10-03', 5)).toBe('2026-10-05');
    expect(nextReminderDate('2026-10-05', 5)).toBe('2026-11-05');
    expect(nextReminderDate('2026-12-20', 1)).toBe('2027-01-01');
  });

  it('builds a monthly recurring event with CRLF lines', () => {
    const ics = monthlyReminderIcs({
      firstDate: '2026-11-01',
      dayOfMonth: 1,
      url: 'https://example.test/#/update',
      stamp: '20261025T120000Z',
      uid: 'u1',
    });
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('DTSTART;VALUE=DATE:20261101');
    expect(lines).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=1');
    expect(lines).toContain('URL:https://example.test/#/update');
    expect(lines).toContain('UID:u1');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('BEGIN:').length).toBe(ics.split('END:').length);
  });

  it('downloads the reminder as an .ics file', () => {
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadMonthlyReminder('2026-10-25', 3);
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    const blob = (create.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe('text/calendar');
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe('download', () => {
  it('saves text through a temporary link and frees the URL later', async () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:y');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: create, revokeObjectURL: revoke });
    const clicked: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    downloadText('plan.fi.json', '{"a":1}');
    expect(clicked[0]?.download).toBe('plan.fi.json');
    expect(clicked[0]?.href).toBe('blob:y');
    expect(document.querySelector('a[download]')).toBeNull();
    const blob = (create.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe('{"a":1}');
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:y');
    click.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reads a file as text', async () => {
    expect(await readFileText(new File(['hello'], 'a.txt'))).toBe('hello');
  });
});

describe('real and nominal values', () => {
  it('leaves real rows alone and scales nominal rows by the inflation index', () => {
    const rows = runProjection(makeInput({ inflation: 0.02, fiSpending: 1e12 })).rows;
    expect(toMode(rows, 'real')).toBe(rows);
    const nominal = toMode(rows, 'nominal');
    expect(nominal[10].liquid).toBeCloseTo(rows[10].liquid * 1.02 ** 10, 6);
    expect(nominal[10].age).toBe(rows[10].age);
    expect(inflationIndex(0.02, 10)).toBeCloseTo(1.02 ** 10, 12);
    expect(inflationIndex(0.02, 0)).toBe(1);
  });
});

describe('mode', () => {
  it('stores the Beginner / Pro choice on the device', () => {
    setMode('beginner');
    expect(getMode()).toBe('beginner');
    expect(localStorage.getItem('fi-tracker-mode')).toBe('beginner');
    setMode('pro');
    expect(getMode()).toBe('pro');
    expect(localStorage.getItem('fi-tracker-mode')).toBe('pro');
  });
});

describe('glossary', () => {
  const params: GlossaryParams = {
    runs: 1000,
    horizonAge: 95,
    firstYear: 1928,
    lastYear: 2024,
    fiSpending: 600_000,
    swr: 0.04,
  };

  it('gives every term a label, an advanced name and a tooltip with no placeholders left', () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.label, key).not.toBe('');
      expect(entry.advanced, key).not.toBe('');
      const tip = entry.tooltip(params);
      expect(tip.length, key).toBeGreaterThan(10);
      expect(tip, key).not.toMatch(/\{\w+\}/);
    }
  });

  it('keeps jargon out of the simple labels', () => {
    for (const entry of Object.values(GLOSSARY)) {
      for (const word of JARGON) expect(entry.label).not.toContain(word);
    }
  });
});

describe('i18n', () => {
  it('fills placeholders and leaves unknown ones', () => {
    expect(t('Hi {a} and {b}', { a: 'x' })).toBe('Hi x and {b}');
    expect(t('{a}{b}{c}', { a: null, b: false, c: 0 })).toBe('0');
  });

  it('switches language, locale and the document language', () => {
    expect(getLang()).toBe('en');
    expect(locale()).toBe('en-US');
    setLang('zh-TW');
    expect(getLang()).toBe('zh-TW');
    expect(locale()).toBe('zh-TW');
    expect(document.documentElement.lang).toBe('zh-Hant-TW');
    expect(localStorage.getItem('fi-tracker-lang')).toBe('zh-TW');
    expect(t('On track')).not.toBe('On track');
    setLang('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('falls back to English and to lazily added translations', () => {
    setLang('zh-TW');
    expect(t('A sentence nobody translated')).toBe('A sentence nobody translated');
    addTranslations({ 'Lazy text {n}': '延遲 {n}' });
    expect(t('Lazy text {n}', { n: 3 })).toBe('延遲 3');
  });

  it('picks singular or plural', () => {
    expect(tn(1, '{n} year', '{n} years')).toBe('1 year');
    expect(tn(4, '{n} year', '{n} years')).toBe('4 years');
  });

  it('translates label maps when read', () => {
    const labels = translated({ ok: 'On track' });
    expect(labels.ok).toBe('On track');
    setLang('zh-TW');
    expect(labels.ok).toBe(t('On track'));
    expect(labels.ok).not.toBe('On track');
  });
});
