import { test, expect } from '@playwright/test';
import { openDesigner, currentTemplate } from './support';

test('preserves an imported invalid default and lets the author resolve it', async ({ page }) => {
  await openDesigner(page);
  await page.evaluate(() => {
    const designer = document.querySelector('cedar-embeddable-designer') as any;
    const template = structuredClone(designer.currentTemplate);
    template.properties.Category._valueConstraints.defaultValue = 'Yellow';
    template.properties.Category._valueConstraints.literals = [{ label: 'Red' }, { label: 'Green' }, { label: 'Blue' }];
    designer.template = template;
  });
  const card = page.locator('.field-drop-item').nth(1);
  const error = card.getByRole('alert');
  await expect(error).toContainText('“Yellow” is not among the allowed options');
  await expect(error).toHaveCSS('color', 'rgb(244, 67, 54)');
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Category._valueConstraints.defaultValue)
    .toBe('Yellow');
  await card.getByPlaceholder('Option 1').fill('Crimson');
  await expect(error).toBeVisible();
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Category._valueConstraints.defaultValue)
    .toBe('Yellow');
  await page.screenshot({ path: '/tmp/ced-choice-error.png' });
  await card.getByRole('button', { name: 'Clear conflicting default' }).click();
  await expect(error).toHaveCount(0);
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Category._valueConstraints.defaultValue)
    .toBeUndefined();
});
