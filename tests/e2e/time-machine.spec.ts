/// <reference lib="dom" />
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// Fixture prices so the test never depends on the monthly data refresh.
const FIRST = 1999 * 12 + 11; // Dec 1999
const LAST = 2026 * 12 + 8; // Sep 2026
const name = (m: number) => `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;

function file(ticker: string, first: number, drift: number, seed: number, c?: 'TWD') {
  const tr = [100];
  const p = [100];
  for (let m = first + 1; m <= LAST; m++) {
    const r = drift + 0.05 * Math.sin(m * 0.37 + seed) * Math.cos(m * 0.05 + seed);
    tr.push(Number((tr[tr.length - 1] * (1 + r + 0.0015)).toPrecision(6)));
    p.push(Number((p[p.length - 1] * (1 + r)).toPrecision(6)));
  }
  return { t: ticker, s: name(first), tr, p, ...(c ? { c } : {}) };
}

const FILES: Record<string, ReturnType<typeof file>> = {
  SPY: file('SPY', FIRST, 0.006, 1),
  QQQ: file('QQQ', FIRST, 0.008, 2),
  VTI: file('VTI', 2001 * 12 + 4, 0.006, 3),
  AAPL: file('AAPL', FIRST, 0.015, 4),
  MSFT: file('MSFT', FIRST, 0.01, 5),
  NEWCO: file('NEWCO', 2015 * 12 + 5, 0.012, 6),
  '2330.TW': file('2330.TW', FIRST, 0.014, 7, 'TWD'),
  '0050.TW': file('0050.TW', 2003 * 12 + 5, 0.007, 8, 'TWD'),
  TAIEXTR: file('TAIEXTR', 2002 * 12 + 11, 0.007, 9, 'TWD'),
};
const INDEX = {
  asOf: name(LAST),
  built: '2026-10-02',
  source: 'Test fixture',
  fx: true,
  tickers: [
    ['SPY', 'SPDR S&P 500 ETF', 'etf', 'market'],
    ['QQQ', 'Invesco QQQ (Nasdaq-100)', 'etf', 'market'],
    ['VTI', 'Vanguard Total Stock Market ETF', 'etf', 'market'],
    ['AAPL', 'Apple', 'stock', 'tech'],
    ['MSFT', 'Microsoft', 'stock', 'tech'],
    ['NEWCO', 'New Company', 'stock', 'tech'],
  ]
    .map(([t, n, k, sec]) => ({ t, n, k, sec, f: FILES[t].s }))
    .concat(
      [
        ['2330.TW', 'TSMC', '台積電', 'stock', 'tech'],
        ['0050.TW', 'Yuanta Taiwan 50 ETF', '元大台灣50', 'etf', 'market'],
        ['TAIEXTR', 'TAIEX total return', '加權報酬指數', 'index', 'market'],
      ].map(([t, n, nz, k, sec]) => ({ t, n, nz, k, sec, f: FILES[t].s, c: 'TWD', m: 'TW' })),
    ),
};
const FX = { s: name(FIRST), v: Array.from({ length: LAST - FIRST + 1 }, (_, i) => 30 + (i % 7) * 0.5) };

test.use({ serviceWorkers: 'block' });

async function servePrices(context: BrowserContext) {
  await context.route('**/data/prices/*.json', (route) => {
    const file = decodeURIComponent(
      new URL(route.request().url()).pathname.split('/').pop()!.replace('.json', ''),
    );
    const body = file === 'index' ? INDEX : file === 'fx' ? FX : FILES[file];
    return body ? route.fulfill({ json: body }) : route.fulfill({ status: 404 });
  });
}

/** Every record in every IndexedDB store, as JSON, to prove the tool writes nothing. */
async function dumpIndexedDb(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const out: Record<string, unknown> = {};
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((ok, fail) => {
        const r = indexedDB.open(info.name!);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        out[`${info.name}/${store}`] = await new Promise((ok) => {
          const r = db.transaction(store).objectStore(store).getAll();
          r.onsuccess = () => ok(r.result);
        });
      }
      db.close();
    }
    return JSON.stringify(out);
  });
}

test('the Time Machine plays a portfolio against the S&P 500 without touching FI data', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await servePrices(context);
  await page.goto('./#/settings?demo=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  // The app records today's goal once after loading; wait until the database is settled.
  let before = '';
  await expect
    .poll(
      async () => {
        const now = await dumpIndexedDb(page);
        const settled = now === before && now.includes(new Date().toISOString().slice(0, 10));
        before = now;
        return settled;
      },
      { intervals: [500] },
    )
    .toBe(true);

  // TM-1, TM-2: its own nav group, a header band, and the default scenario.
  await page
    .getByRole('group', { name: 'Standalone tools' })
    .getByRole('link', { name: /Time Machine/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: /Investment Time Machine/ })).toBeVisible();
  await expect(page.getByTestId('tm-band')).toHaveText(
    'Standalone tool · Uses market history only. It does not read or change your FI Tracker data.',
  );
  const results = page.getByRole('table', { name: 'Results' });
  await expect(results.getByRole('cell', { name: 'Your portfolio' })).toBeVisible();
  await expect(results.getByRole('cell', { name: 'S&P 500 (SPY)' })).toBeVisible();

  // TM-6, TM-7: add a ticker that lists late; weights stay at 100%; move the start.
  await page.getByLabel('Search tickers').fill('new');
  await page.getByRole('button', { name: 'Add NEWCO, New Company' }).click();
  await expect(page.getByTestId('weight-total')).toHaveText('Total 100%');
  await expect(page.getByText('NEWCO started trading after Jan 2010.')).toBeVisible();
  await page.getByRole('radio', { name: 'Start in Jul 2015 instead' }).click();
  await expect(page.getByText('Starts in Jul 2015, when the last holding listed.')).toBeVisible();

  await page.getByLabel('Weight of AAPL').fill('10');
  await expect(page.getByText('Set the weights to add up to 100% to see the result.')).toBeVisible();
  await page.getByRole('button', { name: 'Equal weights' }).click();
  await expect(page.getByTestId('weight-total')).toHaveText('Total 100%');

  // TM-8, TM-9: a property benchmark at 3% a year.
  await page.getByLabel('Add a benchmark').selectOption('property');
  await page.getByLabel('Name', { exact: true }).fill('Kaohsiung flat');
  await expect(results.getByRole('cell', { name: 'Kaohsiung flat' })).toBeVisible();

  // TM-10, TM-11: play, pause, and the counters move; lead or lag per benchmark.
  const end = await page.getByTestId('tm-value').innerText();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByTestId('tm-date')).not.toHaveText(/Sep 2026/);
  await expect(page.getByTestId('tm-lead')).toHaveCount(2);
  await page.keyboard.press('End');
  await expect(page.getByTestId('tm-value')).toHaveText(end);

  // TM-14, TM-15, TM-19: growth view, TWD view, the calendar grid.
  await page.getByRole('radio', { name: 'Growth (start = 100)' }).click();
  await page
    .getByRole('radiogroup', { name: 'Scenario currency' })
    .getByRole('radio', { name: 'TWD' })
    .click();
  await expect(page.getByTestId('tm-value')).toContainText('$');
  await expect(page.getByTestId('tm-value')).not.toHaveText(end);
  await page.getByRole('radio', { name: 'Calendar years' }).click();
  await expect(
    page.getByRole('table', { name: 'Calendar years' }).getByRole('cell', { name: '2016' }),
  ).toBeVisible();

  // TM-13: the link reproduces the scenario in a fresh browser.
  const value = await page.getByTestId('tm-value').innerText();
  const link = page.url();
  expect(link).toContain('?s=');
  const fresh = await context.browser()!.newContext({ serviceWorkers: 'block' });
  await servePrices(fresh);
  const other = await fresh.newPage();
  await other.goto(link);
  await expect(other.getByTestId('tm-value')).toHaveText(value);
  await expect(
    other.getByRole('table', { name: 'Results' }).getByRole('cell', { name: 'Kaohsiung flat' }),
  ).toBeVisible();
  await fresh.close();

  // TM-3: nothing written to IndexedDB.
  expect(await dumpIndexedDb(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('Taiwan stocks: search in Chinese, mix currencies, and old links still open (PRD Part C)', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await servePrices(context);
  await page.goto('./#/tools/time-machine');
  const results = page.getByRole('table', { name: 'Results' });
  await expect(results.getByRole('cell', { name: 'Your portfolio' })).toBeVisible();

  // TW-6: Chinese name search, market filter, badge.
  await page.getByRole('radio', { name: 'Taiwan', exact: true }).click();
  await page.getByLabel('Search tickers').fill('a');
  await expect(page.getByRole('button', { name: /^Add AAPL/ })).toHaveCount(0);
  await page.getByRole('radio', { name: 'All', exact: true }).click();
  await page.getByLabel('Search tickers').fill('台積');
  await page.getByRole('button', { name: 'Add 2330, TSMC' }).click();
  const holdings = page.getByRole('list', { name: 'Holdings' });
  await expect(holdings.getByText('TW · TWD')).toBeVisible();

  // TW-9: a TWD holding in a USD scenario shows the exchange-rate part.
  await expect(results.getByRole('columnheader', { name: 'From exchange rates' })).toBeVisible();

  // TW-3: switching the scenario currency converts the amount.
  await page
    .getByRole('radiogroup', { name: 'Scenario currency' })
    .getByRole('radio', { name: 'TWD' })
    .click();
  await expect(page.getByLabel('Amount', { exact: true })).not.toHaveValue('10000');
  await expect(page.getByTestId('tm-value')).toContainText('NT$');

  // TW-7: Taiwan benchmarks.
  await page.getByLabel('Add a benchmark').selectOption('TAIEXTR');
  await expect(results.getByRole('cell', { name: 'TAIEX total return' })).toBeVisible();

  // TW-10: a link made before Part C (no version) opens with the same final value.
  const legacy = {
    amount: 10000,
    start: '2010-01',
    end: '2026-09',
    holdings: [{ ticker: 'SPY', weight: 100 }],
    late: 'cash',
    rebalance: 'none',
    topUp: 0,
    priceOnly: false,
    benchmarks: [],
    currency: 'USD',
  };
  const link = (o: object) =>
    `./#/tools/time-machine?s=${Buffer.from(JSON.stringify(o)).toString('base64url')}`;
  // The page reads the link when it opens, so reload after changing it.
  await page.goto(link(legacy));
  await page.reload();
  await expect(page.getByTestId('tm-value')).not.toContainText('NT$');
  const oldValue = await page.getByTestId('tm-value').innerText();
  await page.goto(link({ ...legacy, v: 2 }));
  await page.reload();
  await expect(page.getByTestId('tm-value')).toHaveText(oldValue);
  expect(errors).toEqual([]);
});
