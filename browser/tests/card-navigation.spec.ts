import { expect, test } from '@playwright/test';
import {
  openDesigner,
  currentTemplate,
  publishedTemplates,
  openSettings,
  addElementFixture,
  nestFixtureFields,
} from './support';

for (const width of [1280, 375]) {
  test(`arrows navigate cards without editing or wrapping at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    const designer = await openDesigner(page);
    const cards = designer.locator('.field-drag-container');
    expect(await cards.count()).toBeGreaterThan(1);
    await cards.first().locator('.field-type-icon').click();
    await expect(cards.first()).toBeFocused();
    await expect(cards.first().getByRole('tablist')).toBeVisible();
    await openSettings(cards.first().locator('app-field-card'), 'Display');
    const before = await currentTemplate(page);
    const events = await publishedTemplates(page);
    await cards.first().focus();
    await expect(cards.first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(cards.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(cards.nth(1)).toBeFocused();
    await expect(cards.nth(1)).toHaveClass(/selected/);
    await expect(cards.nth(1).locator('.field-header')).toBeInViewport();
    await page.keyboard.press('ArrowUp');
    await expect(cards.first()).toBeFocused();
    await expect(cards.first().getByRole('tabpanel', { name: 'Display', exact: true })).toBeVisible();
    await cards.last().focus();
    await page.keyboard.press('ArrowDown');
    await expect(cards.last()).toBeFocused();
    expect(await currentTemplate(page)).toEqual(before);
    expect(await publishedTemplates(page)).toEqual(events);
  });
}

test('editing controls and modified shortcuts keep their normal arrow handling', async ({ page }) => {
  const designer = await openDesigner(page);
  const cards = designer.locator('.field-drag-container');
  const card = cards.first();
  await card.focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(card).toBeFocused();
  const name = card.getByRole('textbox', { name: 'Field name', exact: true });
  await name.click();
  await page.keyboard.press('ArrowDown');
  await expect(name).toBeFocused();
  await openSettings(card.locator('app-field-card'), 'Display');
  const tab = card.getByRole('tab', { name: 'Display', exact: true });
  await tab.focus();
  await page.keyboard.press('ArrowDown');
  await expect(tab).toBeFocused();
  const select = card.locator('select').first();
  await select.focus();
  await page.keyboard.press('ArrowDown');
  await expect(select).toBeFocused();
});

test('navigation includes elements but skips children of collapsed elements', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'Basic', exact: true }).click();
  await designer.getByRole('button', { name: /Modular/ }).click();
  await addElementFixture(page);
  await nestFixtureFields(page, ['Element']);
  const cards = designer.locator('.field-drag-container');
  const element = cards.filter({ has: page.locator(':scope > app-container-editor') }).first();
  await element.focus();
  await page.keyboard.press('ArrowDown');
  await expect(element.locator('.field-drag-container').first()).toBeFocused();
  await element.getByRole('button', { name: 'Collapse Element', exact: true }).click();
  const visible = designer.locator('.field-drag-container:visible');
  const index = await visible.evaluateAll((nodes) =>
    nodes.findIndex((n) => !!n.querySelector(':scope > app-container-editor')),
  );
  expect(index).toBeGreaterThan(0);
  await visible.nth(index - 1).focus();
  await page.keyboard.press('ArrowDown');
  await expect(element).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(visible.nth(index - 1)).toBeFocused();
});
