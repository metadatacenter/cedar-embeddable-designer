import { expect, test } from '@playwright/test';
import { openDesigner, openSettings } from './support';

test('designer controls disable browser spelling even in a spellchecked host', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.locator('body').evaluate((body) => body.setAttribute('spellcheck', 'true'));
  const card = designer.locator('app-field-card').first();
  for (const tab of ['Display', 'Constraints', 'Annotations', 'Field metadata']) {
    await openSettings(card, tab);
    const controls = designer.locator('input, textarea');
    expect(await controls.count()).toBeGreaterThan(0);
    for (const control of await controls.all()) {
      await expect(control).toHaveAttribute('spellcheck', 'false');
      await expect(control).toHaveJSProperty('spellcheck', false);
    }
  }
});
