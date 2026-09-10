import { test, expect } from '@playwright/test';
import { openSettings, openDesigner, currentTemplate } from './support';

test('published fields are visibly read-only while draft fields remain editable', async ({ page }) => {
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
  await expect(card.getByRole('status')).toContainText('Published field — read-only');
  await expect(card.getByPlaceholder('Enter field name')).toBeDisabled();
  await expect(card.getByLabel('Requirement')).toBeDisabled();
  await expect(card.locator('app-field-card button').first()).toBeDisabled();
  const metadata = await openSettings(card, 'Field details');
  await expect(metadata.getByLabel('Preferred label', { exact: true })).toBeDisabled();
  await expect(metadata.getByRole('button', { name: 'Apply' })).toHaveCount(0);
  await page.locator('.field-drop-item').nth(1).getByPlaceholder('Enter field name').fill('Draft changed');
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Title)
    .toMatchObject({
      'bibo:status': 'bibo:published',
      'pav:version': '1.2.0',
      'pav:createdBy': 'https://example.org/users/author',
    });
  await page.screenshot({ path: '/tmp/ced-published-field.png' });
});
