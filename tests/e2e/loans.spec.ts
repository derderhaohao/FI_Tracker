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
  // Every month's cell says how much of it is the loan.
  await expect(page.getByText('incl. NT$12,500 loan')).toHaveCount(6);

  // The projection pays it on its own schedule, then stops.
  await page.goto('./#/projection');
  await expect(page.getByText(/NT\$12,500\/mo until Nov 2027/)).toBeVisible();
  await page.getByRole('button', { name: 'Show table' }).click();
  await expect(page.getByRole('columnheader', { name: 'Loans' })).toBeVisible();

  // Switch it to "add automatically": a Loan payments row fills itself, and a month can be changed.
  await page.goto('./#/accounts');
  await page.getByRole('button', { name: 'Edit Car loan' }).click();
  // No term to type: it is worked out from the latest balance, the rate and the payment.
  await expect(page.getByLabel('Remaining term (months)')).toHaveCount(0);
  await expect(page.getByTestId('loan-term')).toContainText(
    'Paid off in 14 months · last payment Nov 2027. Worked out from the balance of NT$170,000 on 2026-09-30',
  );
  // "Add it for me" into Housing: each month's Housing gains the payment beside what was typed.
  await page.getByLabel('In Cash flow, this payment is').selectOption('auto');
  await page.getByLabel('In category').selectOption({ label: 'Housing' });
  await page.getByRole('button', { name: 'Save account' }).click();
  await expect(page.getByText(/added to Housing automatically/)).toBeVisible();
  await page.goto('./#/cashflow');
  await expect(page.getByLabel('Housing 2026-09', { exact: true })).toHaveValue('18,000');
  await expect(page.getByText('+ NT$12,500 loan')).toHaveCount(6);

  // Or as a separate "Loan payments" row, where one month can be changed.
  await page.goto('./#/accounts');
  await page.getByRole('button', { name: 'Edit Car loan' }).click();
  await page.getByLabel('In category').selectOption('');
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

  // A new, lower balance shortens the term by itself.
  await page.goto('./#/snapshots');
  await page.getByLabel('Snapshot date').fill('2026-10-31');
  await page.getByRole('button', { name: 'Copy last period' }).click();
  const owed = page.getByLabel('Car loan on 2026-10-31');
  await owed.fill('50,000');
  await owed.press('Enter');
  await page.goto('./#/accounts');
  await page.getByRole('button', { name: 'Edit Car loan' }).click();
  await expect(page.getByTestId('loan-term')).toContainText('Paid off in 5 months · last payment Mar 2027');
  expect(errors).toEqual([]);
});
