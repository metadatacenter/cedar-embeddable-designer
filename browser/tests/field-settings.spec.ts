import { test, expect } from '@playwright/test';
import { openDesigner, currentTemplate } from './support';

test('authors occurrence limits and rejects an inverted range', async ({ page }) => {
  await openDesigner(page);
  const card = page.locator('#field-card-1');
  await card.getByRole('checkbox', { name: 'Allow multiple', exact: true }).check();
  const settings = card.locator('app-field-settings');
  await settings.getByText('Occurrences', { exact: false }).click();
  await settings.getByLabel('Minimum', { exact: true }).fill('2');
  await settings.getByLabel('Maximum', { exact: true }).fill('5');
  await settings.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title.minItems).toBe(2);
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title.maxItems).toBe(5);
  await settings.getByLabel('Minimum', { exact: true }).fill('8');
  await settings.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(settings.getByRole('alert')).toContainText('minimum no greater');
  expect(((await currentTemplate(page)).properties as any).Title.minItems).toBe(2);
  await page.screenshot({ path: '/tmp/ced-occurrences.png' });
});
