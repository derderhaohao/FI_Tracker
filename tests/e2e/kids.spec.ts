/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

/** Every record in the plan's database, as JSON (the kids' database is separate). */
async function dumpPlan(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const out: Record<string, unknown> = {};
    const db = await new Promise<IDBDatabase>((ok, fail) => {
      const r = indexedDB.open('fi-tracker');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
    for (const store of Array.from(db.objectStoreNames))
      out[store] = await new Promise((ok) => {
        const r = db.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => ok(r.result);
      });
    db.close();
    return JSON.stringify(out);
  });
}

async function keypad(page: Page, digits: string) {
  for (const d of digits)
    await page
      .getByRole('group', { name: 'Coin keypad' })
      .getByRole('button', { name: d, exact: true })
      .click();
}

test('a new device asks who is using it; Beginner needs only a profile (KD-1, KD-3)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const started = Date.now();
  await page.goto('./');
  await page.getByRole('button', { name: /A kid learning about money \(Beginner\)/ }).click();
  await expect(page.getByRole('heading', { name: 'Hello! Who is learning today?' })).toBeVisible();
  await page.getByPlaceholder('A fun name, not your real one').fill('Mimi');
  await page.getByRole('button', { name: 'Animal 6' }).click();
  await page.getByRole('button', { name: 'Older' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Mimi!' })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(60_000);

  // The choice stays on this device; Pro pages lead back to the kids' space.
  await page.goto('./#/accounts');
  await expect(page.getByRole('heading', { name: 'Hi, Mimi!' })).toBeVisible();

  // Back to Pro from the grown-ups corner: a fresh plan, no setup was needed for Beginner.
  await page.getByRole('link', { name: 'Grown-ups' }).click();
  await page.getByRole('button', { name: 'Switch to Pro' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to FI Tracker' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a Beginner session leaves the plan database byte for byte unchanged (KD-2, KD-4 to KD-9)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#/settings?demo=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  // The app records today's goal once after loading; wait until the plan is settled.
  let before = '';
  await expect
    .poll(
      async () => {
        const now = await dumpPlan(page);
        const settled = now === before && now.includes(new Date().toISOString().slice(0, 10));
        before = now;
        return settled;
      },
      { intervals: [500] },
    )
    .toBe(true);

  // Switch from Settings (KD-1) and make a profile.
  await page.getByRole('button', { name: 'Switch to Beginner mode' }).first().click();
  await page.getByPlaceholder('A fun name, not your real one').fill('Leo');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Leo!' })).toBeVisible();

  // KD-5: allowance of 100 splits 50 / 30 / 20 into the jars.
  await page.getByRole('button', { name: 'I got money' }).click();
  await page.getByRole('button', { name: 'Allowance' }).click();
  await keypad(page, '100');
  await page.getByRole('button', { name: 'Put it in my jars' }).click();
  await expect(page.getByText('Jars and Goals').first()).toBeVisible();
  await page.getByRole('link', { name: 'Garden' }).click();
  await expect(page.getByTestId('jar-spend')).toHaveText('NT$50');
  await expect(page.getByTestId('jar-save')).toHaveText('NT$30');
  await expect(page.getByTestId('jar-grow')).toHaveText('NT$20');

  // Spending more than Spend asks before using Savings.
  await page.getByRole('button', { name: 'I spent money' }).click();
  await page.getByRole('button', { name: 'Snack' }).click();
  await page.getByRole('button', { name: 'Need', exact: true }).click();
  await keypad(page, '60');
  await page.getByRole('button', { name: 'Take it out' }).click();
  await expect(
    page.getByText('Your Spend jar has NT$50. Use NT$10 from your Savings jar too?'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Yes, use Savings' }).click();
  await expect(page.getByText('Snack · Spend · Need')).toBeVisible();

  // KD-6: a goal with weeks to go.
  await page.getByRole('button', { name: 'Add a goal' }).click();
  await page.getByRole('button', { name: 'Bike' }).click();
  await keypad(page, '200');
  await page.getByRole('button', { name: 'Save this goal' }).click();
  await expect(page.getByTestId('goal')).toContainText('About ');

  // KD-7: the money tree plays every year.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('link', { name: 'Grow', exact: true }).click();
  await page.getByRole('button', { name: 'Grow', exact: true }).click();
  await expect(page.getByTestId('tree-result')).toContainText('You put in');

  // KD-8: Freedom Quest gives a freedom number and an age.
  await page.getByRole('tab', { name: 'Freedom Quest' }).click();
  await expect(page.getByTestId('freedom-number')).toHaveText('NT$9,900,000');
  await expect(page.getByTestId('free-at')).toHaveText(/You could be free at \d+!/);

  // KD-9: lesson 1 and its quiz earn a badge; lesson 2 opens.
  await page.getByRole('link', { name: 'Learn' }).click();
  await expect(page.getByRole('link', { name: /Lesson 2/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Lesson 1: Where money comes from' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /Next/ }).click();
  for (const answer of ['By working', 'A gift from family', 'Helping with chores']) {
    await page.getByRole('button', { name: answer }).click();
    await page.getByRole('button', { name: /Next|Finish/ }).click();
  }
  await expect(page.getByTestId('quiz-score')).toHaveText('3 of 3 right');
  await page.getByRole('button', { name: 'Back to lessons' }).click();
  await expect(page.getByRole('link', { name: 'Lesson 2: Needs and wants' })).toBeVisible();

  // The plan was never touched.
  expect(await dumpPlan(page)).toBe(before);

  await page.getByRole('link', { name: 'Grown-ups' }).click();
  await page.getByRole('button', { name: 'Switch to Pro' }).click();
  await expect(page.getByLabel('Plan health')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Beginner screens have big touch targets and work from the keyboard at phone size', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/kids');
  await page.getByPlaceholder('A fun name, not your real one').fill('Kai');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Hi, Kai!' })).toBeVisible();
  for (const path of ['', '/jars', '/grow', '/learn']) {
    await page.goto(`./#/kids${path}`);
    await page.waitForTimeout(300);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main button, main a, nav a, header a')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.height < 47.5)
        .map(({ el }) => el.textContent || el.getAttribute('aria-label')),
    );
    expect(small, path).toEqual([]);
    const body = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('main')!).fontSize),
    );
    expect(body).toBeGreaterThanOrEqual(18);
  }
  // Keyboard: tab to the first tab-bar link and open it.
  await page.goto('./#/kids/learn');
  await page.getByRole('link', { name: 'Garden' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Hi, Kai!' })).toBeVisible();
});

test('with a PIN, leaving Beginner needs it; three wrong tries mean a wait (KD-10, KD-11)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#/kids');
  await page.getByPlaceholder('A fun name, not your real one').fill('Ivy');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Ivy!' })).toBeVisible();

  const pad = (digits: string) =>
    (async () => {
      for (const d of digits)
        await page
          .getByRole('group', { name: 'PIN pad' })
          .getByRole('button', { name: d, exact: true })
          .click();
    })();

  // Set a PIN in the grown-ups corner.
  await page.getByRole('link', { name: 'Grown-ups' }).click();
  await page.getByRole('button', { name: 'Set a PIN' }).click();
  await pad('2468');
  await pad('2468');
  await expect(page.getByText('The PIN is set.')).toBeVisible();

  // Save this child's progress, then load it back.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save progress' }).click(),
  ]);
  const path = await download.path();
  await page.getByLabel('Load progress').setInputFiles(path!);
  await expect(page.getByText('Progress loaded.')).toBeVisible();

  // Leaving now needs the PIN; three wrong tries start the wait.
  await page.getByRole('link', { name: 'Garden' }).click();
  await page.getByRole('link', { name: 'Grown-ups' }).click();
  await expect(page.getByText('Enter the grown-ups PIN')).toBeVisible();
  await pad('1111');
  await expect(page.getByText('That is not the PIN. Try again.')).toBeVisible();
  await pad('2222');
  await pad('3333');
  await expect(page.getByText(/Too many tries\. Please wait \d+ seconds\./)).toBeVisible();
  // The wait survives a reload.
  await page.reload();
  await expect(page.getByText(/Too many tries\. Please wait \d+ seconds\./)).toBeVisible();
  expect(errors).toEqual([]);
});
