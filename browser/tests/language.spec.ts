import { addElementFixture } from './support';
import { expect, test } from '@playwright/test';
import { openDesigner, openSettings } from './support';

for (const width of [1280, 375]) {
  test(`language selectors on templates fields and elements at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    const root = designer.locator('app-container-editor').first();
    const rootSettings = root.locator(':scope > .template-header-card > app-container-settings');
    await rootSettings.getByRole('button', { name: 'Expand template settings' }).click();
    const language = rootSettings.getByRole('combobox', { name: 'Language', exact: true });
    await expect(language).toHaveValue('');
    await language.selectOption('fr');
    await expect(language).toHaveValue('fr');
    await language.selectOption('');
    await rootSettings.getByRole('button', { name: 'Collapse template settings' }).click();
    const field = designer.locator('app-field-card').first();
    await openSettings(field, 'Display');
    await field.getByRole('combobox', { name: 'Language', exact: true }).selectOption('en');
    await field.locator('app-field-settings').screenshot({ path: testInfo.outputPath('language.png') });
    await page.getByRole('button', { name: 'Basic', exact: true }).click();
    await page.getByRole('button', { name: /Modular/ }).click();
    await addElementFixture(page, root);
    const element = designer.locator('app-element-card').first();
    await element.getByRole('button', { name: 'Expand element settings' }).click();
    await element.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
    await expect(element.getByRole('combobox', { name: 'Language', exact: true })).toHaveValue('de');
  });
}
