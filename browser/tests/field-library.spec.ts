import { test, expect } from '@playwright/test';
import { openSettings, openDesigner, currentTemplate, child, applyPreset } from './support';

test('saves complete fields, edits isolated copies, and restores the library after reload', async ({ page }) => {
  const designer = await openDesigner(page);
  const source = await currentTemplate(page);
  const field = child(source, 'Title');
  field['pav:version'] = '2.3.4';
  field['title'] = 'Preserved schema title';
  field['pav:createdOn'] = '2026-01-01T00:00:00Z';
  (field['_valueConstraints'] as Record<string, unknown>)['minLength'] = 2;
  await designer.evaluate((node, template) => {
    (node as unknown as { template: unknown }).template = template;
  }, source);
  await expect(designer.getByLabel('Field version and publication status')).toHaveCount(0);
  await expect(designer.getByRole('button', { name: 'Save field to library', exact: true })).toHaveCount(0);
  await applyPreset(page, 'semantic');
  await designer.getByRole('button', { name: 'Field Designer', exact: true }).click();
  const library = designer.locator('app-field-designer');
  await expect(library.locator('input[type="file"]')).toHaveCount(0);
  await expect(library.getByRole('button', { name: /Export/ })).toHaveCount(0);
  await library.getByRole('button', { name: 'Create field', exact: true }).click();
  await library.getByPlaceholder('Enter field name').fill('Title');
  await library
    .locator('summary')
    .filter({ hasText: /^Create library$/ })
    .click();
  await library.getByLabel('Library name', { exact: true }).fill('Study fields');
  await library.getByRole('button', { name: 'Create library', exact: true }).click();
  await library.getByRole('button', { name: 'Save field', exact: true }).click();
  await library.getByRole('button', { name: 'Edit', exact: true }).click();
  await library.getByPlaceholder('Enter field name').fill('Reusable title');
  await library.getByRole('button', { name: 'Save field', exact: true }).click();
  expect(child(await currentTemplate(page), 'Title')['schema:name']).toBe('Title');
  await library.getByRole('button', { name: 'Add to template', exact: true }).click();
  const copied = child(await currentTemplate(page), 'Reusable title');
  expect(copied['schema:name']).toBe('Reusable title');
  await page.reload();
  await applyPreset(page, 'semantic');
  await designer.getByRole('button', { name: 'Field Designer', exact: true }).click();
  await expect(library.getByRole('cell', { name: 'Reusable title', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/ced-field-library.png', fullPage: true });
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
  await expect(designer.getByPlaceholder('Enter field name').first()).toBeDisabled();
  await openSettings(designer.locator('app-field-card').first(), 'Field metadata');
  await expect(designer.locator('app-field-settings').first()).toContainText('1.2.0');
});
