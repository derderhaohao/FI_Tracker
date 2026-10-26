import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * UI polish acceptance checks (docs/ui-polish-spec.md): no colour-contrast violations in either
 * theme, no text under 12 px, and no interactive element under 24 × 24 px on desktop or under
 * 44 × 44 px on phones (inside main and the bottom nav).
 */

test.use({ serviceWorkers: 'block' });

const PRO_ROUTES = [
  '',
  'update',
  'accounts',
  'snapshots',
  'cashflow',
  'goal',
  'projection',
  'lab',
  'reviews',
  'settings/general',
  'settings/assumptions',
  'settings/taiwan',
  'settings/categories',
  'settings/backup',
  'settings/danger',
  'tools/time-machine',
];
const KIDS_ROUTES = ['kids', 'kids/jars', 'kids/grow', 'kids/learn', 'kids/parent'];

async function loadDemo(page: Page) {
  page.on('dialog', (d) => void d.accept());
  await page.goto('./#/settings?demo=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
}

async function addChild(page: Page) {
  await page.goto('./#/kids');
  await page.getByPlaceholder('A fun name, not your real one').fill('Mia');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Mia!' })).toBeVisible();
}

/** Opens a route and waits for the page heading and any charts to settle. */
async function open(page: Page, route: string) {
  await page.goto(`./#/${route}`);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(route === 'lab' || route === 'tools/time-machine' ? 2500 : 600);
}

async function contrast(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  return violations.flatMap((v) =>
    v.nodes.map((n) => `${n.target.join(' ')} · ${n.any[0]?.message ?? v.help}`),
  );
}

/** Text smaller than 12 px; chart ticks may be 11 px under 400 px width. */
async function smallText(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const narrow = window.innerWidth < 400;
    for (const el of Array.from(document.querySelectorAll<HTMLElement | SVGElement>('body *'))) {
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!own) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.closest('.sr-only')) continue;
      const size = parseFloat(style.fontSize);
      if (size >= 12 || (narrow && size >= 11 && el.closest('svg'))) continue;
      out.push(`${el.tagName.toLowerCase()} ${size}px "${el.textContent!.trim().slice(0, 30)}"`);
    }
    return out;
  });
}

/** Interactive elements smaller than `min` × `min`, inside `scope`. Inline links in text are exempt. */
async function smallTargets(page: Page, min: number, scope: string) {
  return page.evaluate(
    ({ min, scope }) => {
      const out: string[] = [];
      const sel =
        'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=slider], [role=radio], [role=tab]';
      for (const root of Array.from(document.querySelectorAll(scope)))
        for (const el of Array.from(root.querySelectorAll<HTMLElement>(sel))) {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          // Links and terms inside a sentence are exempt (WCAG 2.5.8 inline exception).
          if (style.display === 'inline' || el.closest('p, li > span')) continue;
          if (el.closest('[aria-hidden=true], .sr-only, [role=tooltip]')) continue;
          // A checkbox or radio wrapped in its label is hit through the label.
          const target = (el instanceof HTMLInputElement && el.closest('label')) || el;
          const r = target.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // The native range track counts with its thumb; check only its height.
          const tooSmall =
            el instanceof HTMLInputElement && el.type === 'range'
              ? r.height < Math.min(min, 24)
              : r.width < min - 0.5 || r.height < min - 0.5;
          if (tooSmall)
            out.push(
              `${el.tagName.toLowerCase()} ${Math.round(r.width)}×${Math.round(r.height)} "${(
                el.getAttribute('aria-label') ||
                el.textContent ||
                ''
              )
                .trim()
                .slice(0, 30)}"`,
            );
        }
      return out;
    },
    { min, scope },
  );
}

for (const scheme of ['light', 'dark'] as const) {
  for (const route of [...PRO_ROUTES, ...KIDS_ROUTES]) {
    test(`no colour-contrast failures or tiny text: ${route || 'dashboard'}, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      if (route.startsWith('kids')) await addChild(page);
      else await loadDemo(page);
      await open(page, route);
      expect([...(await contrast(page)), ...(await smallText(page))]).toEqual([]);
    });
  }
}

test('every control is at least 24 × 24 px on desktop', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await loadDemo(page);
  const problems: Record<string, string[]> = {};
  for (const route of PRO_ROUTES) {
    await open(page, route);
    const found = await smallTargets(page, 24, 'body');
    if (found.length) problems[route || 'dashboard'] = found;
  }
  expect(problems).toEqual({});
});

test('every control in the page and the bottom nav is at least 44 × 44 px on a phone', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loadDemo(page);
  const problems: Record<string, string[]> = {};
  for (const route of PRO_ROUTES) {
    await open(page, route);
    const found = await smallTargets(page, 44, 'main, nav[aria-label="Main"]');
    if (found.length) problems[route || 'dashboard'] = found;
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (wide) (problems[route || 'dashboard'] ??= []).push('page scrolls sideways');
  }
  expect(problems).toEqual({});
});

test('the Dashboard KPI row is in view at 1280 × 800 without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await loadDemo(page);
  await open(page, '');
  const box = await page.getByText('Savings rate', { exact: true }).locator('..').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(800);
});

test('Settings sections open by address and the Lab nav marks the section in view', async ({ page }) => {
  await loadDemo(page);
  await page.goto('./#/settings/backup');
  await expect(page.getByRole('link', { name: 'Backup' })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: 'Export backup (JSON)' })).toBeVisible();
  // Old in-page anchors still land on their section.
  await page.goto('./#/settings#categories');
  await expect(page).toHaveURL(/#\/settings\/categories$/);

  await page.goto('./#/lab');
  const nav = page.getByRole('navigation', { name: 'Strategy Lab sections' });
  await nav.getByRole('link', { name: 'Past markets' }).click();
  await expect(nav.getByRole('link', { name: 'Past markets' })).toHaveAttribute('aria-current', 'true');
});

test('Time Machine results stay on two lines at 1280 px and setup comes first on phones', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/tools/time-machine');
  const table = page.getByRole('table').first();
  await expect(table).toBeVisible({ timeout: 15_000 });
  const lines = await table.evaluate((t) =>
    Math.max(
      ...Array.from(t.querySelectorAll('td')).map((td) => {
        const lh = parseFloat(getComputedStyle(td).lineHeight) || 20;
        const pad =
          parseFloat(getComputedStyle(td).paddingTop) + parseFloat(getComputedStyle(td).paddingBottom);
        return Math.round((td.clientHeight - pad) / lh);
      }),
    ),
  );
  expect(lines).toBeLessThanOrEqual(2);

  await page.setViewportSize({ width: 390, height: 844 });
  const setup = await page.getByRole('heading', { name: '1 · Amount and dates' }).boundingBox();
  const results = await table.boundingBox();
  expect(setup!.y).toBeLessThan(results!.y);
});
