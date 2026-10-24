import { expect, test, type Page } from '@playwright/test';

async function loadDemo(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  await page.goto('./#/settings?demo=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  return errors;
}

const JARGON = ['P10', 'P90', 'Seed', 'det.', 'SWR', 'Monte Carlo'];

test('Strategy Lab answers in plain words first (Simple view)', async ({ page }) => {
  const errors = await loadDemo(page);
  await page.goto('./#/lab');
  const verdict = page.getByLabel('Verdict');
  await expect(verdict.getByText(/^You could stop working at \d+ \(\w{3} \d{4}\)\./)).toBeVisible();
  await expect(verdict.getByText(/In \d+ of 10 simulated futures your money lasts to 95/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(verdict.getByRole('img', { name: /of 10 simulated futures last/ })).toBeVisible();
  await expect(verdict.getByText('Why these differ.')).toBeVisible();

  // The built-in row and the comparison with it.
  await expect(page.getByRole('button', { name: 'Your plan today', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'vs your plan' })).toBeVisible();
  await expect(page.getByText(/^(Safer|Riskier) mainly because/).first()).toBeVisible();

  // A glossary tooltip.
  await page.getByRole('button', { name: 'Chance your money lasts' }).first().hover();
  await expect(
    page.getByRole('tooltip').filter({ hasText: 'simulated futures with random good' }).first(),
  ).toBeVisible();

  // No jargon in the Simple view (glossary tooltips are hidden until opened).
  await page.mouse.move(0, 0);
  const text = await page.locator('main').innerText();
  for (const word of JARGON) expect(text).not.toContain(word);

  // Advanced adds the developer controls back.
  await page.getByRole('radio', { name: 'Advanced' }).click();
  await expect(page.getByLabel('Comparison seed')).toBeVisible();
  await expect(page.getByLabel('Monte Carlo runs')).toBeVisible();
  await page.getByRole('radio', { name: 'Simple' }).click();
  await expect(page.getByLabel('Comparison seed')).toHaveCount(0);

  // Assumptions and reference tests.
  await page.getByText('Assumptions and checks').click();
  await expect(page.getByText(/^Pass: Zero-volatility simulations equal the typical path/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/^Pass: Classic 4% rule over 30 years/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('a what-if from a template, safer variants and reaching a target', async ({ page }) => {
  const errors = await loadDemo(page);
  await page.goto('./#/lab');
  await page.getByRole('button', { name: 'How this works' }).click();
  const starter = page.getByLabel('How Strategy Lab works');
  await expect(starter.getByText('Your plan today')).toBeVisible();
  await starter.getByRole('button', { name: 'Retire earlier or later' }).click();
  await starter.getByLabel('Stop working at age').fill('47');
  await starter.getByRole('button', { name: 'Create “Retire at 47”' }).click();
  await expect(page.getByRole('heading', { name: 'Edit: Retire at 47' })).toBeVisible();
  await expect(
    page.getByText(/Today: \d+ \(as soon as you reach your target\) · −\d+ yrs? vs today/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss the starter guide' }).click();
  await expect(starter).toHaveCount(0);

  // Safer variants for the new scenario.
  const safer = page.getByLabel('What would make it safer');
  await expect(safer.getByRole('heading', { name: 'What would make “Retire at 47” safer?' })).toBeVisible();
  await expect(safer.getByRole('cell', { name: /^[+−]\d+ pts$|^no change$/ }).first()).toBeVisible({
    timeout: 20_000,
  });
  await safer.getByRole('button', { name: 'Find out' }).click();
  await expect(safer.getByText(/To reach 90%, any one of these on its own/)).toBeVisible({ timeout: 60_000 });

  await safer
    .getByRole('row', { name: /Work 1 more year/ })
    .getByRole('button', { name: 'Save' })
    .click();
  await expect(page.getByRole('heading', { name: 'Edit: Retire at 47: stop at 48' })).toBeVisible();
  expect(errors).toEqual([]);
});
