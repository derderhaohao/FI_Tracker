import { expect, test, type Page } from '@playwright/test';

async function loadDemo(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  await page.goto('./#/settings?demo=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  return errors;
}

test('the monthly update on a phone, then why the FI date moved', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const errors = await loadDemo(page);
  await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link', { name: 'Update' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Monthly update' })).toBeVisible();
  await page.getByLabel('Snapshot date').fill('2026-10-31');
  await page.getByRole('button', { name: 'Start' }).click();

  // Change the first account, keep the rest.
  await page.getByLabel('Balance now').fill('80,000');
  await page.getByRole('button', { name: 'Next' }).click();
  for (let i = 0; i < 20; i++) {
    const same = page.getByRole('button', { name: 'Same as last month' });
    if (!(await same.isVisible())) break;
    await same.click();
  }
  const allCorrect = page.getByRole('button', { name: 'All correct' });
  if (await allCorrect.isVisible()) await allCorrect.click();
  await expect(page.getByRole('heading', { name: 'USD/TWD rate' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Save balances' }).click();
  await expect(page.getByRole('heading', { name: /^Saved \d+ balances for 31 Oct 2026$/ })).toBeVisible();
  await expect(page.getByText(/^Done in /)).toBeVisible();

  await page.getByRole('link', { name: 'See what moved' }).click();
  const move = page.getByLabel('Why did my FI date move');
  await expect(move.getByText(/on 30 Sep 2026 → .* on 31 Oct 2026/)).toBeVisible();
  await expect(move.getByText('A month went by')).toBeVisible();
  await expect(move.getByText('What you saved')).toBeVisible();
  await expect(
    page.getByLabel('Plan health').getByText(/^Likely between age \d+ and \d+ \(8 in 10 futures\)$/),
  ).toBeVisible({
    timeout: 20_000,
  });
  expect(errors).toEqual([]);
});

test('a monthly calendar reminder and tap-to-explain terms', async ({ page }) => {
  const errors = await loadDemo(page);
  await page.goto('./#/settings/reminder');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Add to calendar (.ics)' }).click();
  expect((await download).suggestedFilename()).toBe('fi-tracker-monthly-update.ics');

  await page.goto('./#/goal');
  await page.getByRole('button', { name: 'Coast FI' }).click();
  await expect(page.getByRole('tooltip').filter({ hasText: 'with no more saving' })).toBeVisible();
  expect(errors).toEqual([]);
});
