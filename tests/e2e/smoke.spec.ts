import { expect, test, type Page } from '@playwright/test';
import { deleteAllData } from './helpers';
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

  await page.goto('./#/settings/backup');
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Load demo data' }).click();
  await expect(page.getByText('Demo data loaded.')).toBeVisible();

  await page.getByRole('link', { name: 'Home' }).first().click();
  await expect(
    page.getByLabel('Your progress').getByText(/^At this pace you could stop work at \d+ \(\w{3} \d{4}\)\.$/),
  ).toBeVisible();
  await expect(page.getByText('Net worth', { exact: true }).first()).toBeVisible();

  // Add a snapshot by copying the last period, then edit one balance.
  await page.getByRole('link', { name: 'My money' }).first().click();
  await page.getByRole('link', { name: 'Snapshots' }).first().click();
  await page.getByLabel('Snapshot date').fill('2026-10-31');
  await page.getByRole('button', { name: 'Copy last period' }).click();
  const cell = page.getByLabel('Everyday account on 31 Oct 2026');
  await expect(cell).toBeVisible();
  await cell.fill('150,000');
  await cell.press('Enter');
  // No permanent backup banner: prompts come after setup, reviews or 30 days.
  await expect(page.getByText(/Last backup was|No backup in over/)).toHaveCount(0);

  await page.getByRole('link', { name: 'My plan' }).first().click();
  await page.getByRole('link', { name: 'Projection' }).first().click();
  await expect(page.getByText('Investable net worth against the FI target')).toBeVisible();
  await expect(page.getByText('Start', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('31 Oct 2026 · age 35')).toBeVisible();

  // Strategy Lab: simulated futures run on their own and lead with a plain verdict.
  await page.getByRole('link', { name: 'Strategy Lab' }).first().click();
  await expect(page.getByText(/simulated futures your money (lasts|runs out)/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('td', { hasText: /^\d+%/ }).first()).toBeVisible();

  // Export, wipe, and re-import.
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await page.getByRole('link', { name: 'Backup' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup (JSON)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^fi-tracker-\d{4}-\d{2}-\d{2}\.fi\.json$/);
  const path = await download.path();
  const exported = JSON.parse(readFileSync(path, 'utf8'));
  expect(exported.data.snapshots.some((s: { date: string }) => s.date === '2026-10-31')).toBe(true);

  await deleteAllData(page);
  await page.getByRole('link', { name: 'Home' }).first().click();
  await expect(page.getByRole('heading', { name: 'When can you stop working?' })).toBeVisible();

  await page.goto('./#/settings/backup');
  await page.getByLabel('Backup file').setInputFiles(path);
  await expect(page.getByText('Backup loaded.')).toBeVisible();
  await page.getByRole('link', { name: 'My money' }).first().click();
  await page.getByRole('link', { name: 'Snapshots' }).first().click();
  await expect(page.getByLabel('Everyday account on 31 Oct 2026')).toHaveValue('150,000');

  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('every screen renders with demo data', async ({ page }) => {
  const errors = await trackErrors(page);
  await page.goto('./#/settings?demo=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  for (const [route, heading] of [
    ['', 'Home'],
    ['update', 'Monthly update'],
    ['update/reviews', 'Reviews'],
    ['money/accounts', 'Accounts'],
    ['money/snapshots', 'Snapshots'],
    ['money/cashflow', 'Cash flow'],
    ['money/mix', 'Portfolio mix'],
    ['plan/projection', 'Projection'],
    ['plan/goal', 'Goal'],
    ['plan/lab', 'Strategy Lab'],
    // Old addresses redirect (UX doc, N1).
    ['snapshots', 'Snapshots'],
    ['lab', 'Strategy Lab'],
  ]) {
    await page.goto(`./#/${route}`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
