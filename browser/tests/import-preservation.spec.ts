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
  await page.locator('app-element-card').first().getByRole('button', { name: 'Edit Element', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Container path' })).toBeVisible();
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
