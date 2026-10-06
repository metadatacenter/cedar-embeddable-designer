import { test, expect } from '@playwright/test';
import { openSettings, openDesigner, currentTemplate } from './support';

test('a published field keeps its definition while its parent configures, renames and removes it', async ({ page }) => {
  await openDesigner(page);
  await page.evaluate(() => {
    const designer = document.querySelector('cedar-embeddable-designer') as any;
    const template = structuredClone(designer.currentTemplate);
    template.properties.Title['bibo:status'] = 'bibo:published';
    template.properties.Title['pav:version'] = '1.2.0';
    template.properties.Title['pav:createdBy'] = 'https://example.org/users/author';
    designer.template = template;
  });
  const card = page.locator('.field-drop-item').first();
  await expect(card.getByRole('status')).toContainText(
    'This field is published, so only its configuration can change.',
  );
  // Its own definition is locked: its Display tab and its values.
  const display = await openSettings(card, 'Display');
  await expect(display.getByLabel('Name', { exact: true })).toBeDisabled();
  await expect(display.getByRole('button', { name: 'Apply' })).toHaveCount(0);
  const constraints = await openSettings(card, 'Constraints');
  await expect(constraints.getByLabel('Minimum length', { exact: true })).toBeDisabled();
  // How its parent places it is not: the header, its Configuration and removing it.
  await expect(card.getByTitle('Delete field', { exact: true })).toBeEnabled();
  const configuration = await openSettings(card, 'Configuration');
  for (const label of ['Display name', 'Display description', 'Key', 'Requirement'])
    await expect(configuration.getByLabel(label, { exact: true })).toBeEnabled();
  await card.getByPlaceholder('Enter field name').fill('Shown title');
  await expect(configuration.getByLabel('Display name', { exact: true })).toHaveValue('Shown title');
  await configuration.getByLabel('Requirement', { exact: true }).selectOption('optional');
  await page.locator('.field-drop-item').nth(1).getByPlaceholder('Enter field name').fill('Draft changed');
  await expect
    .poll(async () => {
      const template = await currentTemplate(page);
      return [(template._ui as any).propertyLabels.Title, (template.properties as any).Title];
    })
    .toEqual([
      'Shown title',
      expect.objectContaining({
        'schema:name': 'Title',
        'bibo:status': 'bibo:published',
        'pav:version': '1.2.0',
        'pav:createdBy': 'https://example.org/users/author',
        _valueConstraints: expect.objectContaining({ requiredValue: false }),
      }),
    ]);
  await page.screenshot({ path: '/tmp/ced-published-field.png' });
  await card.getByTitle('Delete field', { exact: true }).click();
  await expect.poll(async () => Object.keys((await currentTemplate(page)).properties as object)).not.toContain('Title');
});
