import { expect, test } from '@playwright/test';

test('a loan is entered once in Accounts and shows up in Cash flow and the projection', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  await page.goto('./#/settings?demo=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  // The demo's car loan is already inside its "Loan repayment" spending.
  await page.goto('./#/accounts');
  await expect(page.getByText(/12,500\/mo · \d+ mo · in Loan repayment/)).toBeVisible();
  await page.goto('./#/cashflow');
  await expect(page.getByText('incl. NT$12,500/mo loan payment (Accounts)')).toBeVisible();

  // The projection pays it on its own schedule, then stops.
  await page.goto('./#/projection');
  await expect(page.getByText(/NT\$12,500\/mo until Nov 2027/)).toBeVisible();
  await page.getByRole('button', { name: 'Show table' }).click();
  await expect(page.getByRole('columnheader', { name: 'Loans' })).toBeVisible();

  // Switch it to "add automatically": a Loan payments row fills itself, and a month can be changed.
  await page.goto('./#/accounts');
  await page.getByRole('button', { name: 'Edit Car loan' }).click();
  await page.getByLabel('In Cash flow, this payment is').selectOption('auto');
  await page.getByRole('button', { name: 'Save account' }).click();
  await expect(page.getByText(/added to Cash flow automatically/)).toBeVisible();

  await page.goto('./#/cashflow');
  const september = page.getByLabel('Loan payments 2026-09', { exact: true });
  await expect(september).toHaveValue('12,500');
  await september.fill('50,000');
  await september.press('Enter');
  await page.reload();
  await expect(page.getByLabel('Loan payments 2026-09', { exact: true })).toHaveValue('50,000');
  await expect(page.getByLabel('Loan payments 2026-08', { exact: true })).toHaveValue('12,500');
  expect(errors).toEqual([]);
});
