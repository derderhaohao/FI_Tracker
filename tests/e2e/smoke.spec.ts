import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

test('load demo data, add a snapshot, see the projection, export and re-import', async ({ page }) => {
  const errors = await trackErrors(page);
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) external.push(r.url());
  });

  await page.goto('./#/settings');
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Load demo data' }).click();
  await expect(page.getByText('Demo data loaded.')).toBeVisible();

  await page.getByRole('link', { name: 'Dashboard' }).first().click();
  await expect(page.getByText('Projected FI date')).toBeVisible();
  await expect(page.getByText('Total net worth').first()).toBeVisible();

  // Add a snapshot by copying the last period, then edit one balance.
  await page.getByRole('link', { name: 'Snapshots' }).first().click();
  await page.getByLabel('Snapshot date').fill('2026-10-31');
  await page.getByRole('button', { name: 'Copy last period' }).click();
  const cell = page.getByLabel('Everyday account on 2026-10-31');
  await expect(cell).toBeVisible();
  await cell.fill('150,000');
  await cell.press('Enter');
  await expect(page.getByText('New snapshot saved.')).toBeVisible();

  await page.getByRole('link', { name: 'Projection' }).first().click();
  await expect(page.getByText('Investable net worth against the FI target')).toBeVisible();
  await expect(page.getByText('Start').first()).toBeVisible();
  await expect(page.getByText('2026-10-31 · age 35')).toBeVisible();

  // Strategy Lab: simulated futures run on their own and lead with a plain verdict.
  await page.getByRole('link', { name: 'Strategy Lab' }).first().click();
  await expect(page.getByText(/simulated futures your money (lasts|runs out)/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('td', { hasText: /^\d+%/ }).first()).toBeVisible();

  // Export, wipe, and re-import.
  await page.getByRole('link', { name: 'Settings' }).first().click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup (JSON)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^fi-tracker-\d{4}-\d{2}-\d{2}\.fi\.json$/);
  const path = await download.path();
  const exported = JSON.parse(readFileSync(path, 'utf8'));
  expect(exported.data.snapshots.some((s: { date: string }) => s.date === '2026-10-31')).toBe(true);

  await page.getByRole('button', { name: 'Delete all data' }).click();
  await page.getByRole('link', { name: 'Dashboard' }).first().click();
  await expect(page.getByRole('heading', { name: 'Welcome to FI Tracker' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).first().click();
  await page.getByLabel('Backup file').setInputFiles(path);
  await expect(page.getByText('Backup loaded.')).toBeVisible();
  await page.getByRole('link', { name: 'Snapshots' }).first().click();
  await expect(page.getByLabel('Everyday account on 2026-10-31')).toHaveValue('150,000');

  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('every screen renders with demo data', async ({ page }) => {
  const errors = await trackErrors(page);
  await page.goto('./#/settings?demo=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  for (const [route, heading] of [
    ['', 'Dashboard'],
    ['accounts', 'Accounts'],
    ['snapshots', 'Snapshots'],
    ['cashflow', 'Cash flow'],
    ['goal', 'Goal'],
    ['projection', 'Projection'],
    ['lab', 'Strategy Lab'],
    ['reviews', 'Reviews'],
  ]) {
    await page.goto(`./#/${route}`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
