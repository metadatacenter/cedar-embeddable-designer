import { expect, test } from '@playwright/test';
import { DESIGNER, openDesigner } from './support';

/**
 * The host's choice of language, through the built element.
 *
 * The unit suite sets the component's input directly. This drives what a host page
 * has, which is an attribute and a property on a custom element, and reads what an
 * author sees through the shadow root.
 */
test('switches between English and Hungarian through the attribute and the property', async ({ page }) => {
  const designer = await openDesigner(page);
  const overview = designer.locator('.overview-panel__title');
  await expect(overview).toHaveText('Overview (3)');
  await expect(designer.getByRole('button', { name: 'Basic', exact: true })).toBeVisible();

  await page.evaluate((tag) => document.querySelector(tag)!.setAttribute('language', 'hu'), DESIGNER);
  await expect(overview).toHaveText('Áttekintés (3)');
  await expect(designer.getByRole('button', { name: 'Alap', exact: true })).toBeVisible();
  await expect(designer.locator('.field-type-label').first()).toHaveText('Szöveg');
  expect(
    await page.evaluate((tag) => (document.querySelector(tag) as unknown as { language: string }).language, DESIGNER),
  ).toBe('hu');

  await page.evaluate((tag) => {
    (document.querySelector(tag) as unknown as { language: string }).language = 'en';
  }, DESIGNER);
  await expect(overview).toHaveText('Overview (3)');
  await expect(designer.getByRole('button', { name: 'Basic', exact: true })).toBeVisible();
  await expect(designer.locator('.field-type-label').first()).toHaveText('Text');
});

test('falls back to English for a language it does not have', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.evaluate((tag) => document.querySelector(tag)!.setAttribute('language', 'hu'), DESIGNER);
  await expect(designer.locator('.overview-panel__title')).toHaveText('Áttekintés (3)');
  await page.evaluate((tag) => document.querySelector(tag)!.setAttribute('language', 'fr'), DESIGNER);
  await expect(designer.locator('.overview-panel__title')).toHaveText('Overview (3)');
});
