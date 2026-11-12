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
  await page.mouse.move(800, 50);
  await expect(handle).not.toBeFocused();
  expect(await handle.evaluate((el) => getComputedStyle(el, '::after').width)).toBe('1px');
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
  await designer.getByRole('button', { name: 'Close Overview', exact: true }).click();
  await designer.getByRole('button', { name: 'Open Overview', exact: true }).click();
  await expect(handle).toHaveAttribute('aria-valuenow', '240');
  await handle.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', '480');
  await page.setViewportSize({ width: 900, height: 1000 });
  await expect.poll(async () => Number(await handle.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(360);
  // A click steps from the largest width to the smallest, and on to the default. The largest follows
  // the host's width on a later render.
  await expect.poll(async () => Number(await handle.getAttribute('aria-valuemax'))).toBeLessThanOrEqual(360);
  await expect(handle).toHaveAttribute('aria-valuenow', (await handle.getAttribute('aria-valuemax'))!);
  await handle.click();
  await expect(handle).toHaveAttribute('aria-valuenow', '224');
  await handle.click();
  await expect(handle).toHaveAttribute('aria-valuenow', '256');
  expect(await currentTemplate(page)).toEqual(before);
});

test('a click on the Overview divider steps through its smallest, default and largest widths', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const designer = await openDesigner(page);
  const before = await currentTemplate(page);
  const handle = designer.getByRole('separator', { name: 'Resize Overview' });
  const panel = designer.locator('.overview-panel');
  const width = async () => Number(await handle.getAttribute('aria-valuenow'));
  await expect(handle).toHaveAttribute('aria-valuemin', '224');
  await expect(handle).toHaveAttribute('aria-valuemax', '480');
  // From the default, 256, to the largest, then wrapping to the smallest and back to the default.
  for (const expected of [480, 224, 256, 480]) {
    await handle.click();
    await expect.poll(width).toBe(expected);
    expect((await panel.boundingBox())!.width).toBe(expected);
  }
  // From a width a drag left between two presets, a click steps to the larger one.
  await handle.press('Home');
  await handle.press('ArrowRight');
  await expect.poll(width).toBe(240);
  await handle.click();
  await expect.poll(width).toBe(256);
  // A double click no longer resets the width. Its first click steps it, which moves the divider
  // from under the pointer, so whether the second click lands on the divider depends on the browser.
  await handle.dblclick();
  await expect.poll(width).not.toBe(256);
  await handle.press('Home');
  await expect.poll(width).toBe(224);
  // A drag is no click: it leaves the width where the pointer put it.
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(width).toBe(264);
  // A press that strays a few pixels is still a click, and steps from where it began.
  const moved = (await handle.boundingBox())!;
  await page.mouse.move(moved.x + moved.width / 2, moved.y + 30);
  await page.mouse.down();
  await page.mouse.move(moved.x + moved.width / 2 + 3, moved.y + 30, { steps: 2 });
  await page.mouse.up();
  await expect.poll(width).toBe(480);
  // The preview narrows the default to the smallest width, so the steps are the smallest and the largest.
  await designer.getByRole('button', { name: 'Open Preview', exact: true }).click();
  await handle.click();
  await expect.poll(width).toBe(224);
  await handle.click();
  await expect.poll(width).toBe(480);
  expect(await currentTemplate(page)).toEqual(before);
});

test('Overview heading and rows follow the same shared spacing and color tokens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const designer = await openDesigner(page);
  await designer.evaluate((el) => {
    el.style.setProperty('--cedar-space-2', '12px');
    el.style.setProperty('--cedar-text-primary', 'rgb(30, 40, 50)');
  });
  const header = designer.locator('.overview-panel__header-left app-icon');
  const row = designer.locator('.select-node').first();
  expect((await header.boundingBox())!.x).toBe((await row.locator('app-icon').first().boundingBox())!.x);
  await expect(row).toHaveCSS('color', 'rgb(30, 40, 50)');
});
