import { test, expect } from '@playwright/test';
import { openSettings, openDesigner, currentTemplate, child, applyPreset } from './support';

test('Field Designer is absent in every authoring profile', async ({ page }) => {
  const designer = await openDesigner(page);
  for (const preset of ['basic', 'modular', 'semantic'] as const) {
    await applyPreset(page, preset);
    await expect(designer.getByRole('button', { name: 'Field Designer', exact: true })).toHaveCount(0);
  }
});

test('published first-class fields show lifecycle information while their definition stays read-only', async ({
  page,
}) => {
  const designer = await openDesigner(page);
  const source = await currentTemplate(page);
  const field = child(source, 'Title');
  field['pav:version'] = '1.2.0';
  field['bibo:status'] = 'bibo:published';
  await designer.evaluate((node, template) => {
    (node as unknown as { template: unknown }).template = template;
  }, source);
  await expect(designer.getByLabel('Field version and publication status')).toHaveCount(0);
  // The header edits the name the template shows the field by, which is the template's to change.
  await expect(designer.getByPlaceholder('Enter field name').first()).toBeEnabled();
  const display = await openSettings(designer.locator('app-field-card').first(), 'Presentation');
  await expect(display.getByLabel('Field name', { exact: true })).toBeDisabled();
  // The version and publication status are on the Version tab.
  const version = await openSettings(designer.locator('app-field-card').first(), 'Version');
  await expect(version).toContainText('1.2.0');
  await expect(version).toContainText('Published');
});

test('dragging the divider below the sidebar field list resizes the list within 10% and 75% of the sidebar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).click();
  await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
  await designer.getByRole('radio', { name: /Library Sidebar/ }).check();
  await designer.getByRole('button', { name: 'Done', exact: true }).click();
  const list = designer.locator('.sidebar-section').first();
  const divider = designer.locator('.resizable-divider');
  await expect(divider).toBeVisible();
  // The share of the sidebar's height the list is given. The panel below takes the rest.
  const share = () => list.evaluate((section) => parseFloat(section.style.height));
  const drag = async (toY: number) => {
    const handle = (await divider.boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, toY, { steps: 5 });
    await page.mouse.up();
  };

  // The divider follows the pointer, and the list grows by as much.
  const before = (await list.boundingBox())!;
  const handle = (await divider.boundingBox())!;
  const pointer = handle.y + handle.height / 2 + 150;
  await drag(pointer);
  const after = (await divider.boundingBox())!;
  expect(pointer).toBeGreaterThanOrEqual(after.y - 1);
  expect(pointer).toBeLessThanOrEqual(after.y + after.height + 1);
  expect((await list.boundingBox())!.height - before.height).toBeCloseTo(150, -1);

  // The list keeps its bounds however far the divider is dragged.
  await drag(899);
  expect(await share()).toBe(75);
  await drag(0);
  expect(await share()).toBe(10);
});
