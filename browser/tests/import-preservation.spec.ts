import { expect, test } from '@playwright/test';
import nestedTemplate from '../../src/app/core/model/fixtures/corpus/template-028.json' with { type: 'json' };
import { currentTemplate, openDesigner } from './support';

test('refuses an element-containing template visibly and keeps the open document', async ({ page }) => {
  await openDesigner(page);
  const before = await currentTemplate(page);
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as HTMLElement & { template: object }).template = template;
  }, nestedTemplate);
  await expect(page.getByRole('alert')).toContainText('Element editing is not supported');
  expect(await currentTemplate(page)).toEqual(before);
});
