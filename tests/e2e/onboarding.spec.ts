import { expect, test, type Page } from '@playwright/test';

async function fillMoney(page: Page, label: string, value: string, nth = 0) {
  const input = page.getByLabel(label, { exact: true }).nth(nth);
  await input.fill(value);
  await input.press('Tab');
}

test('a new user sets up their data with the wizard and lands on a projection', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Welcome to FI Tracker' })).toBeVisible();
  await page.getByRole('button', { name: 'Start setup' }).click();

  // 1. About you: validation, then birth year and target age.
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Enter your birth year.')).toBeVisible();
  await fillMoney(page, 'Birth year', '1988');
  await fillMoney(page, 'Target FI age (optional)', '50');
  await page.getByRole('button', { name: 'Next' }).click();

  // 2. Accounts: a bank account, a USD broker (needs a rate) and a loan.
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();
  await fillMoney(page, 'Balance today', '800,000');
  await page.getByRole('button', { name: 'US broker' }).click();
  await fillMoney(page, 'Balance today', '40,000', 1);
  await page.getByRole('button', { name: 'Loan / mortgage' }).click();
  await fillMoney(page, 'Amount owed', '300,000');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Enter today’s USD/TWD rate for your USD accounts.')).toBeVisible();
  await fillMoney(page, 'TWD per USD today', '32');
  await page.getByRole('button', { name: 'Next' }).click();

  // 3. Money in & out.
  await expect(page.getByRole('heading', { name: 'Money in & out' })).toBeVisible();
  await fillMoney(page, 'Monthly take-home pay', '90,000');
  await fillMoney(page, 'Monthly spending', '50,000');
  await expect(page.getByText('a savings rate of 44.4%')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // 4. FI goal, pre-filled from spending × 12.
  await expect(page.getByLabel('Yearly spending once FI')).toHaveValue('600,000');
  await page.getByRole('button', { name: 'Next' }).click();

  // 5. Taiwan pensions: skip.
  await expect(page.getByRole('heading', { name: 'Taiwan pensions' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  // 6. Review shows the projection before saving.
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
  await expect(page.getByText('Projected FI date')).toBeVisible();
  await expect(page.getByText('Birth year 1988, target FI age 50.')).toBeVisible();
  await page.getByRole('button', { name: 'Finish and see my dashboard' }).click();

  await expect(
    page.getByRole('heading', { name: 'Setup done: here is your first projection' }),
  ).toBeVisible();
  await expect(page.getByText('Projected FI date')).toBeVisible();
  await page.getByRole('link', { name: /Refine your cash flow/ }).click();
  await expect(page.getByText('Living costs').first()).toBeVisible();
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
  await page.getByRole('button', { name: 'Load demo data' }).click();
  await expect(page.getByText('Projected FI date')).toBeVisible();
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Delete all data' }).click();
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Welcome to FI Tracker' })).toBeVisible();
});
