import { expect, test, type Page } from '@playwright/test';

async function openPlay(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  await page.goto('./#/settings?demo=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.goto('./#/projection');
  await page.getByRole('radio', { name: 'Play a story' }).click();
  await expect(page.getByText('One possible story, not a forecast.').first()).toBeVisible();
  return errors;
}

const counter = (page: Page, label: string) => page.getByTestId(`counter-${label}`);

/** Opens the "⋯" menu of the player bar and picks an item. */
async function menu(page: Page, item: string) {
  await page.getByRole('button', { name: 'More playback actions' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Adds an event in the picker (PX-4): open, expand the card, pick severity and age, add. */
async function addEvent(page: Page, name: string, age: number, severity = 'Typical') {
  await page.getByRole('button', { name: 'Add event' }).first().click();
  const picker = page.getByRole('dialog', { name: 'Event picker' });
  await picker.getByRole('button', { name, exact: true }).click();
  await picker.getByRole('radio', { name: severity }).click();
  await picker.getByLabel('Age', { exact: true }).fill(String(age));
  await picker.getByRole('button', { name: `Add at age ${age}` }).click();
  await expect(picker).toHaveCount(0);
}

test('a crisis just after stopping work plays to an end card with its rank', async ({ page }) => {
  const errors = await openPlay(page);
  await addEvent(page, 'Global financial crisis', 50);
  await expect(
    page.getByRole('button', { name: 'Global financial crisis, scheduled at age 50' }),
  ).toBeVisible();

  const start = await counter(page, 'Date').innerText();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByLabel('Pause', { exact: true }).click();
  expect(await counter(page, 'Date').innerText()).not.toBe(start);

  await menu(page, 'Skip to end');
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

  // Key 6 fires the sixth favourite, Windfall, at the playhead.
  await page.getByLabel('Playhead month').blur();
  await page.keyboard.press('6');
  // A windfall brings FI forward (stopping sooner can leave less at 95, so the sign there varies).
  await expect(page.getByLabel('Impact of the last event')).toContainText(
    /Windfall: [+−]NT\$.* · FI \d+ months earlier/,
  );
  // The event log is now a chip on the event timeline (PX-11).
  const chip = page.getByRole('button', { name: /^Windfall, fired live at age \d+$/ });
  await expect(chip).toBeVisible();
  expect(await counter(page, 'Investments').innerText()).toBe(investNow);
  await page.getByLabel('Playhead month').fill('120');
  expect(await counter(page, 'Investments').innerText()).not.toBe(investLater);

  await menu(page, 'Undo last event');
  await expect(chip).toHaveCount(0);
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

test('the picker adds a severe crisis, the chip moves, an event fires live, and undo removes it', async ({
  page,
}) => {
  const errors = await openPlay(page);
  // The stage shows the result strip with "money lasts" before anything is played (PX-6).
  await expect(counter(page, 'Money lasts')).toHaveText(/^to \d+ ✓$/);

  // Adding a GFC at age 50, Severe (PX-4 acceptance).
  await addEvent(page, 'Global financial crisis', 50, 'Severe');
  const chip = page.getByRole('button', { name: 'Global financial crisis, scheduled at age 50' });
  await expect(chip).toBeVisible();
  await expect(page.getByText('1 of 3 scheduled')).toBeVisible();

  // Keyboard move: Shift+→ is a year, → a month (PX-5).
  await chip.focus();
  await chip.press('Shift+ArrowRight');
  const moved = page.getByRole('button', { name: 'Global financial crisis, scheduled at age 51' });
  await expect(moved).toBeVisible();
  await expect(moved).toBeFocused();

  // Drag it back roughly a year to the left.
  const box = (await moved.boundingBox())!;
  const track = (await page.getByRole('group', { name: 'Event timeline' }).boundingBox())!;
  const perYear = (track.width - 76) / 60;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 10 - perYear / 2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(box.x + 10 - perYear * 1.2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(
    page.getByRole('button', { name: /^Global financial crisis, scheduled at age 50$/ }),
  ).toBeVisible();

  // Fire live: the same picker while playing fires at the playhead (PX-3).
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Fire an event' }).click();
  const picker = page.getByRole('dialog', { name: 'Event picker' });
  await picker.getByRole('button', { name: 'Windfall', exact: true }).click();
  await picker.getByRole('button', { name: /^Fire now at age \d+$/ }).click();
  await expect(picker).toHaveCount(0);
  await page.getByLabel('Pause', { exact: true }).click();
  const live = page.getByRole('button', { name: /^Windfall, fired live at age \d+$/ });
  await expect(live).toBeVisible();

  await menu(page, 'Undo last event');
  await expect(live).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Global financial crisis, scheduled/ })).toBeVisible();
  expect(errors).toEqual([]);
});
