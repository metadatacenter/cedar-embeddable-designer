import { applyPreset } from './support';
import { test, expect } from '@playwright/test';
import { openDesigner } from './support';

test('an inserted element retains headroom when the library sidebar collapses', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await designer.locator('.user-menu-container button').first().click();
  await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
  await designer.getByRole('radio', { name: /Library Sidebar/ }).check();
  await designer.getByRole('button', { name: 'Done', exact: true }).click();
  await designer.getByRole('button', { name: 'Add element', exact: true }).click();
  const name = designer.getByRole('textbox', { name: 'Element display name', exact: true });
  await expect(name).toBeFocused();
  const header = designer.locator('.nested-header');
  const headroom = () =>
    header.evaluate(
      (el) => el.getBoundingClientRect().top - el.closest('.designer-scroll')!.getBoundingClientRect().top,
    );
  await expect.poll(headroom).toBeGreaterThanOrEqual(23);
  await name.fill('New element');
  await designer.getByTitle('Collapse sidebar', { exact: true }).click();
  await expect.poll(headroom).toBeGreaterThanOrEqual(23);
  await expect(name).toBeInViewport();
});

test('element overview chevron follows its name and insertion actions have balanced spacing', async ({ page }) => {
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await designer.getByRole('button', { name: 'Add element', exact: true }).click();
  await designer.getByRole('textbox', { name: 'Element display name', exact: true }).fill('New element');
  const row = designer.locator('.outline-row').filter({ hasText: 'New element' });
  const name = await row.locator('.node-name').boundingBox();
  const toggle = await row.locator('.outline-toggle').boundingBox();
  expect(toggle!.x).toBeGreaterThanOrEqual(name!.x + name!.width);
  expect(toggle!.x - name!.x - name!.width).toBeLessThan(12);
  const section = designer.locator('app-container-editor app-container-editor .add-field-section').last();
  const spacing = await section.evaluate((el) => {
    const section = el.getBoundingClientRect();
    const actions = el.querySelector('app-insertion-actions')!.getBoundingClientRect();
    return { above: actions.top - section.top, below: section.bottom - actions.bottom };
  });
  expect(Math.abs(spacing.above - spacing.below)).toBeLessThanOrEqual(1);
});

test('an Overview name breaks only between words, and an error count that does not fit moves under it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 829 });
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  for (const label of ['Checkboxes', 'List']) {
    await designer
      .getByRole('button', { name: /^Add field$/ })
      .first()
      .click();
    await designer.getByRole('button', { name: label, exact: true }).click();
    await designer.locator('input[aria-label="Enter field name"]:focus').fill(label);
  }
  const row = designer.locator('.outline-row').filter({ hasText: 'Checkboxes' });
  const badge = row.locator('.validation-badge');
  await expect(badge).toBeVisible();
  // The name keeps its one word whole, on one line.
  expect(await row.locator('.node-name').evaluate((name) => name.getClientRects().length)).toBe(1);
  // The count sits within the row, clear of the Move buttons beside it.
  const [count, up] = [(await badge.boundingBox())!, (await row.locator('.outline-move').first().boundingBox())!];
  expect(count.x + count.width).toBeLessThanOrEqual(up.x);
});
