import { expect, test, type Page } from '@playwright/test';

async function openPlay(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  await page.goto('./#/settings?demo=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.goto('./#/projection');
  await page.getByRole('radio', { name: 'Play' }).click();
  await expect(page.getByText('One possible story, not a forecast.').first()).toBeVisible();
  return errors;
}

const counter = (page: Page, label: string) => page.getByTestId(`counter-${label}`);

test('a crisis just after stopping work plays to an end card with its rank', async ({ page }) => {
  const errors = await openPlay(page);
  await page.getByLabel('Event', { exact: true }).selectOption('gfc');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Global financial crisis · \d+$/ })).toBeVisible();

  const start = await counter(page, 'Date').innerText();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await counter(page, 'Date').innerText()).not.toBe(start);

  await page.getByRole('button', { name: 'Skip to end' }).click();
  const end = page.getByLabel('End of the story');
  await expect(end.getByRole('heading', { name: 'End of the story, age 95' })).toBeVisible();
  await expect(end.getByText('One possible story, not a forecast.')).toBeVisible();
  await expect(end.getByText('Lowest point', { exact: true })).toBeVisible();
  await expect(end.getByText('Time to recover', { exact: true })).toBeVisible();
  await expect(end.getByText(/This story ends better than \d+ of 100/)).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('firing an event keeps the past, and undo restores it exactly', async ({ page }) => {
  const errors = await openPlay(page);
  await page.getByLabel('Playhead month').fill('60');
  const investNow = await counter(page, 'Investments').innerText();
  await page.getByLabel('Playhead month').fill('120');
  const investLater = await counter(page, 'Investments').innerText();
  await page.getByLabel('Playhead month').fill('60');

  await page
    .getByRole('button', { name: /^Fire Windfall/ })
    .first()
    .click();
  await expect(page.getByLabel('Impact of the last event')).toContainText(/Windfall: \+NT\$/);
  await expect(page.getByRole('cell', { name: 'Windfall' })).toBeVisible();
  expect(await counter(page, 'Investments').innerText()).toBe(investNow);
  await page.getByLabel('Playhead month').fill('120');
  expect(await counter(page, 'Investments').innerText()).not.toBe(investLater);

  await page.getByRole('button', { name: 'Undo last event' }).click();
  await expect(page.getByRole('cell', { name: 'Windfall' })).toHaveCount(0);
  expect(await counter(page, 'Investments').innerText()).toBe(investLater);

  // The table's total always equals the counter.
  const total = await counter(page, 'Total net worth').innerText();
  await expect(
    page
      .getByRole('row', { name: /^Total net worth/ })
      .getByRole('cell')
      .nth(1),
  ).toHaveText(total);
  expect(errors).toEqual([]);
});

test('reduce motion turns the animation off but the slider still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await openPlay(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.getByLabel('Playhead month').fill('240');
  await expect(counter(page, 'Age')).toHaveText(/^\d+ y 0 m$/);
  expect(errors).toEqual([]);
});
