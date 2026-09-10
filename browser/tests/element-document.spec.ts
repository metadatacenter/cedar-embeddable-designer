import { expect, test } from '@playwright/test';
import { openDesigner, currentTemplate } from './support';

test('creates, edits, exports and reopens a standalone element through the public API', async ({ page }) => {
  await openDesigner(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('button', { name: 'New Element', exact: true }).click();
  const name = page.getByPlaceholder('Element name');
  await name.fill('Study element');
  const element = await currentTemplate(page);
  expect(element['@type']).toBe('https://schema.metadatacenter.org/core/TemplateElement');
  expect(element['schema:name']).toBe('Study element');
  await page.evaluate((artifact) => {
    const designer = document.querySelector('cedar-embeddable-designer') as HTMLElement & { artifact: object };
    designer.artifact = artifact;
  }, element);
  await expect(name).toHaveValue('Study element');
  expect(await currentTemplate(page)).toEqual(element);
});
