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
  await expect(designer.getByPlaceholder('Enter field name').first()).toBeDisabled();
  await openSettings(designer.locator('app-field-card').first(), 'Field metadata');
  await expect(designer.locator('app-field-settings').first()).toContainText('1.2.0');
});
