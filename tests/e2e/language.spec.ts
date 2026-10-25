import { expect, test } from '@playwright/test';

test('switches to Taiwan Traditional Chinese and back, keeping the choice', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  await page.goto('./#/settings?demo=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  await page.getByRole('radio', { name: '繁體中文' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: '設定' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant-TW');

  await page.getByRole('link', { name: '總覽' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: '總覽' })).toBeVisible();
  await expect(page.getByText('淨資產總額').first()).toBeVisible();
  await expect(page.getByText(/NT\$[\d.]+萬/).first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '總覽' })).toBeVisible();

  await page.goto('./#/lab');
  await expect(page.getByRole('heading', { level: 1, name: '策略實驗室' })).toBeVisible();
  await expect(page.getByText(/你(可以|計畫)在 \d+ 歲/).first()).toBeVisible();

  await page.goto('./#/projection');
  await page.getByRole('radio', { name: '播放故事' }).click();
  await expect(page.getByText('一種可能的故事，不是預測。').first()).toBeVisible();
  await page.getByRole('button', { name: '更多播放動作' }).click();
  await page.getByRole('menuitem', { name: '跳到結尾' }).click();
  await expect(page.getByLabel('故事結束')).toBeVisible();

  await page.getByRole('radio', { name: 'English' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Projection' })).toBeVisible();
  expect(errors).toEqual([]);
});
