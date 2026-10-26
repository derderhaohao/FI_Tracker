import type { Page } from '@playwright/test';

/** Settings → Danger zone: type DELETE, then delete everything in this browser (UI-15). */
export async function deleteAllData(page: Page) {
  await page.goto('./#/settings/danger');
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete all data' }).click();
}
