import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

async function loadDemo(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  await page.goto('./#/settings?demo=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  return errors;
}

test('imports bank transactions from CSV, skips duplicates, and lists them in transaction mode', async ({
  page,
}) => {
  const errors = await loadDemo(page);
  await page.goto('./#/cashflow');
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await page.getByLabel('CSV file').setInputFiles(fixture('bank-transactions.csv'));
  // Debit / credit columns and 民國 dates are detected from the headers.
  await expect(page.getByText('3 to import')).toBeVisible();
  await expect(page.getByRole('cell', { name: '2026-10-03' })).toBeVisible();
  await page.getByRole('button', { name: 'Import 3 transactions' }).click();
  await expect(page.getByText('Imported 3 transactions')).toBeVisible();
  await page.getByRole('button', { name: 'Switch to transaction view' }).click();

  await expect(page.getByRole('radio', { name: 'Transactions' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Oct 2026' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions · Oct 2026' })).toBeVisible();
  await expect(page.getByText('全聯福利中心')).toBeVisible();

  // The same file again: everything is a duplicate.
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await page.getByLabel('CSV file').setInputFiles(fixture('bank-transactions.csv'));
  await expect(page.getByText('3 already imported')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import 0 transactions' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('imports balances into the snapshot grid', async ({ page }) => {
  const errors = await loadDemo(page);
  await page.goto('./#/snapshots');
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await page.getByLabel('CSV file').setInputFiles(fixture('balances.csv'));
  await expect(page.getByText('2 balances', { exact: true })).toBeVisible();
  await expect(page.getByText('1 account names skipped')).toBeVisible();
  await page.getByRole('button', { name: 'Import 2 balances' }).click();
  await expect(page.getByText('Imported 2 balances')).toBeVisible();
  await expect(page.getByLabel('Emergency fund on 2026-10-31')).toHaveValue('445,000');
  expect(errors).toEqual([]);
});

test('exports and restores an encrypted backup', async ({ page }) => {
  const errors = await loadDemo(page);
  await page.getByRole('button', { name: 'Export encrypted backup' }).click();
  await page.getByLabel('Passphrase', { exact: true }).fill('a long passphrase');
  await page.getByLabel('Repeat passphrase').fill('a long passphrase');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download encrypted backup' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.encrypted\.fi\.json$/);
  const path = await file.path();

  await page.getByRole('button', { name: 'Delete all data' }).click();
  // Clearing re-creates the defaults and remounts the page; wait until it is back.
  await expect(page.getByText('never', { exact: true })).toBeVisible();
  await page.getByLabel('Backup file').setInputFiles(path);
  await page.getByLabel('Passphrase', { exact: true }).fill('wrong passphrase');
  await page.getByRole('button', { name: 'Decrypt and restore' }).click();
  await expect(page.getByText('Wrong passphrase')).toBeVisible();
  await page.getByLabel('Passphrase', { exact: true }).fill('a long passphrase');
  await page.getByRole('button', { name: 'Decrypt and restore' }).click();
  await expect(page.getByText('Backup loaded.')).toBeVisible();
  await page.goto('./#/accounts');
  await expect(page.getByText('Everyday account')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Strategy Lab shows the historical backtest and buy vs. rent', async ({ page }) => {
  const errors = await loadDemo(page);
  await page.goto('./#/lab');
  await expect(page.getByRole('columnheader', { name: 'Past-markets check' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Past-markets check:/ })).toBeVisible();
  await expect(page.getByText(/of \d+ starting years/)).toBeVisible();

  await page.getByRole('radio', { name: 'Buy vs. rent' }).click();
  await expect(page.getByText('Cash needed up front')).toBeVisible();
  await expect(page.getByText('NT$3.30M')).toBeVisible();
  await page.getByRole('button', { name: 'Create scenario' }).click();
  await expect(page.getByText(/Created “Buy a NT\$15.0M home/)).toBeVisible();
  await page.getByRole('radio', { name: 'Scenarios' }).click();
  await expect(page.getByRole('button', { name: /^Buy a NT\$15.0M home in \d{4}$/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('goal history, offline manifest and loading fallback', async ({ page, request }) => {
  const errors = await loadDemo(page);
  await page.goto('./#/goal');
  await expect(page.getByRole('heading', { name: 'Goal history' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2025-01-31' })).toBeVisible();

  const manifest = await request.get('./manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).name).toBe('FI Tracker');
  expect((await request.get('./sw.js')).ok()).toBe(true);
  const html = await (await request.get('./')).text();
  expect(html).toContain('Loading FI Tracker');
  expect(errors).toEqual([]);
});

test('the account form validates and saves (zod resolver)', async ({ page }) => {
  const errors = await loadDemo(page);
  await page.goto('./#/accounts');
  await page.getByRole('button', { name: 'Add account' }).first().click();
  await page.getByRole('button', { name: 'Add account' }).last().click();
  await expect(page.getByText('Give it a nickname')).toBeVisible();
  await page.getByLabel('Nickname').fill('123456789');
  await page.getByRole('button', { name: 'Add account' }).last().click();
  await expect(page.getByText('Do not store account numbers; use a nickname.')).toBeVisible();
  await page.getByLabel('Nickname').fill('Travel fund');
  await page.getByRole('button', { name: 'Add account' }).last().click();
  await expect(page.getByRole('cell', { name: 'Travel fund', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
