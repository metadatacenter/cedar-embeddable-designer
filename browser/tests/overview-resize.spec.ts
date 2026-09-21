import { expect, test } from '@playwright/test';
import { currentTemplate, openDesigner } from './support';

test('Overview resizes within bounds without changing the artifact', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const designer = await openDesigner(page);
  const before = await currentTemplate(page);
  const handle = designer.getByRole('separator', { name: 'Resize Overview' });
  const panel = designer.locator('.overview-panel');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 30, { steps: 8 });
  await page.mouse.up();
  const width = Number(await handle.getAttribute('aria-valuenow'));
  expect(width).toBeGreaterThan(350);
  expect((await panel.boundingBox())!.width).toBe(width);
  await handle.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', '480');
  await handle.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '480');
  await handle.press('Home');
  await handle.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '224');
  await handle.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '240');
  await designer.locator('.overview-panel__close').click();
  await designer.getByRole('button', { name: 'Open Overview', exact: true }).click();
  await expect(handle).toHaveAttribute('aria-valuenow', '240');
  await handle.press('End');
  await page.setViewportSize({ width: 900, height: 1000 });
  await expect.poll(async () => Number(await handle.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(360);
  await handle.dblclick();
  await expect(handle).toHaveAttribute('aria-valuenow', '256');
  expect(await currentTemplate(page)).toEqual(before);
});

test('Overview heading and rows follow the same shared spacing and color tokens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const designer = await openDesigner(page);
  await designer.evaluate((el) => {
    el.style.setProperty('--cedar-space-2', '12px');
    el.style.setProperty('--cedar-text-authoring', 'rgb(30, 40, 50)');
  });
  const header = designer.locator('.overview-panel__header-left app-icon');
  const row = designer.locator('.select-node').first();
  expect((await header.boundingBox())!.x).toBe((await row.locator('app-icon').first().boundingBox())!.x);
  await expect(row).toHaveCSS('color', 'rgb(30, 40, 50)');
});
