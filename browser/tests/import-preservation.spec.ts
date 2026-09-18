import { expect, test } from '@playwright/test';
import nestedTemplate from '../../src/app/core/model/fixtures/corpus/template-028.json' with { type: 'json' };
import { currentTemplate, openDesigner, templateName } from './support';

test('opens an element-containing template without dropping nested content', async ({ page }) => {
  await openDesigner(page);
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as HTMLElement & { template: object }).template = template;
  }, nestedTemplate);
  await expect(page.locator('app-element-card').first()).toBeVisible();
  const saved = await currentTemplate(page);
  expect(saved['_ui']).toEqual(nestedTemplate['_ui']);
  const element = page.locator('app-container-editor').nth(1);
  const toggle = element.locator(':scope > .template-header-card .element-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(element.locator(':scope > .container-content')).toBeHidden();
  await toggle.click();
  await expect(element.locator(':scope > .container-content')).toBeVisible();
  expect(await currentTemplate(page)).toEqual(saved);
});

test('keeps publication and provenance when the template is edited', async ({ page }) => {
  await openDesigner(page);
  const original = await currentTemplate(page);
  const imported = {
    ...original,
    'bibo:status': 'bibo:published',
    'pav:createdOn': '2026-09-01T00:00:00Z',
    'pav:createdBy': 'urn:test:creator',
  };
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as HTMLElement & { template: object }).template = template;
  }, imported);
  await templateName(page).fill('Edited title');
  await templateName(page).blur();
  await expect
    .poll(() => currentTemplate(page))
    .toMatchObject({
      'schema:name': 'Edited title',
      'bibo:status': 'bibo:published',
      'pav:createdOn': imported['pav:createdOn'],
      'pav:createdBy': imported['pav:createdBy'],
    });
});
