import { expect, test, type Page } from '@playwright/test';
import { deleteAllData } from './helpers';

async function fillMoney(page: Page, label: string, value: string, nth = 0) {
  const input = page.getByLabel(label, { exact: true }).nth(nth);
  await input.fill(value);
  await input.press('Tab');
}

test('a new user gets an estimate, sets up in four steps and lands on a result screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const started = Date.now();
  await page.goto('./');
  // One welcome screen (O1), in focus mode: no sidebar while there is no data.
  await expect(page.getByRole('heading', { name: 'When can you stop working?' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

  // The 60-second estimate gives a rough FI age at once.
  await fillMoney(page, 'Your age', '38');
  await fillMoney(page, 'Money invested now (TWD)', '2,000,000');
  await fillMoney(page, 'Monthly take-home pay (TWD)', '90,000');
  await fillMoney(page, 'Monthly spending (TWD)', '50,000');
  await expect(page.getByText(/^Age \d+ · \w{3} \d{4}$/)).toBeVisible();
  expect(Date.now() - started).toBeLessThan(60_000);
  await page.getByRole('button', { name: 'Make it accurate' }).click();

  // 1. About you: carried from the estimate.
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Exit setup' })).toBeVisible();
  await expect(page.getByLabel('Birth year')).toHaveValue(String(new Date().getFullYear() - 38));
  await fillMoney(page, 'Target FI age (optional)', '50');
  await page.getByRole('button', { name: 'Next' }).click();

  // 2. What you have: tiles add rows; a USD account needs a rate.
  await expect(page.getByRole('heading', { name: 'What you have' })).toBeVisible();
  await expect(page.getByLabel('Nickname').first()).toHaveValue('Investments');
  await page.getByRole('button', { name: 'Bank account' }).click();
  await fillMoney(page, 'Balance today', '800,000', 1);
  await page.getByRole('button', { name: 'US broker' }).click();
  await fillMoney(page, 'Balance today (USD)', '40,000');
  await page.getByRole('button', { name: 'Loan / mortgage' }).click();
  await fillMoney(page, 'Amount owed', '300,000');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Enter today’s USD/TWD rate for your USD accounts.')).toBeVisible();
  await fillMoney(page, 'TWD per USD today', '32');
  await page.getByRole('button', { name: 'Next' }).click();

  // 3. Money in and out: carried; FI spending pre-filled; the live FI age shows.
  await expect(page.getByRole('heading', { name: 'Money in and out' })).toBeVisible();
  await expect(page.getByLabel('Monthly take-home pay')).toHaveValue('90,000');
  await expect(page.getByLabel('Yearly spending once you stop working')).toHaveValue('600,000');
  const live = page.getByRole('region', { name: 'Estimated FI age' });
  await expect(live.getByText(/in [\d.]+ years$/)).toBeVisible();
  await page.getByRole('radio', { name: 'Yes' }).check();
  await page.getByRole('button', { name: 'Next' }).click();

  // 4. How you invest: pre-selected from what the accounts hold (80% shares).
  await expect(page.getByRole('heading', { name: 'How you invest' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Mostly shares/ })).toBeChecked();
  await page.getByRole('radio', { name: /Balanced/ }).check();
  await page.getByRole('button', { name: 'Finish and see my result' }).click();

  // The result screen (O3): the FI age first, not a dashboard of warnings.
  await expect(page.getByRole('heading', { level: 1, name: /^Age \d+$/ })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Progress to financial independence' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to my dashboard' }).click();
  await expect(page.getByLabel('Plan health').getByText(/^Most likely age \d+ · \w{3} \d{4}$/)).toBeVisible();
  await page.goto('./#/accounts');
  await expect(page.getByRole('cell', { name: 'US broker', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Loan', exact: true })).toBeVisible();
  await page.goto('./#/setup');
  await expect(page.getByText('Setup is for a fresh start')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the welcome screen offers demo data and returns after deleting all data', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('./');
  await page.getByRole('button', { name: /Explore a sample household/ }).click();
  await expect(page.getByLabel('Plan health')).toBeVisible();
  await deleteAllData(page);
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'When can you stop working?' })).toBeVisible();
});
