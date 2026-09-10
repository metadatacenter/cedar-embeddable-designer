import { expect, test } from '@playwright/test';
import nestedTemplate from '../../src/app/core/model/fixtures/corpus/template-028.json' with { type: 'json' };
import { currentTemplate, openDesigner, templateName } from './support';

test('refuses an element-containing template visibly and keeps the open document', async ({ page }) => {
  await openDesigner(page);
  const before = await currentTemplate(page);
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as HTMLElement & { template: object }).template = template;
  }, nestedTemplate);
  await expect(page.getByRole('alert')).toContainText('Element editing is not supported');
  expect(await currentTemplate(page)).toEqual(before);
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
