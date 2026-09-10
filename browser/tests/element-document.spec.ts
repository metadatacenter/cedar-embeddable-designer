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

test('creates nested elements, edits cardinality, moves a field, and reopens the complete document', async ({
  page,
}) => {
  await openDesigner(page);
  await page.getByRole('button', { name: 'Basic', exact: true }).click();
  await page.getByRole('button', { name: /Modular/ }).click();
  await page.getByRole('button', { name: 'Add Element', exact: true }).click();
  const parent = page.locator('app-element-card').first();
  await parent.getByRole('button', { name: 'Edit Element', exact: true }).click();
  await page.getByPlaceholder('Element name').fill('Samples');
  await page.getByRole('button', { name: 'Add Element', exact: true }).click();
  const child = page.locator('app-element-card').first();
  await child.locator('summary').click();
  await child.getByLabel('Property name', { exact: true }).fill('sample');
  await child.getByLabel('Allow multiple', { exact: true }).check();
  await child.getByLabel('Minimum occurrences', { exact: true }).fill('2');
  await child.getByLabel('Maximum occurrences', { exact: true }).fill('4');
  await child.getByRole('button', { name: 'Apply placement', exact: true }).click();
  await child.getByRole('button', { name: 'Edit Element', exact: true }).click();
  await page.getByPlaceholder('Element name').fill('Sample');
  const path = page.getByRole('navigation', { name: 'Container path' });
  await path.getByRole('button', { name: 'Untitled Template', exact: true }).click();
  const field = page.locator('.field-drop-item').first();
  await field.getByLabel('Move child to container').selectOption({ label: 'Untitled Template / Element / sample' });
  await page.locator('app-container-outline').getByRole('button', { name: '▸ sample', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Field name', exact: true })).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Field name', exact: true })).toHaveValue('Title');
  await page.getByRole('textbox', { name: 'Field name', exact: true }).fill('Nested title');
  const saved = await currentTemplate(page);
  const properties = saved.properties as Record<string, Record<string, unknown>>;
  const samples = properties.Element.properties as Record<string, Record<string, unknown>>;
  expect(samples.sample.minItems).toBe(2);
  expect(samples.sample.maxItems).toBe(4);
  expect((samples.sample.items as Record<string, unknown>)['schema:name']).toBe('Sample');
  await page.screenshot({ path: '/tmp/ced-nested-editor.png', fullPage: true });
  await page.evaluate((artifact) => {
    (document.querySelector('cedar-embeddable-designer') as HTMLElement & { artifact: object }).artifact = artifact;
  }, saved);
  expect(await currentTemplate(page)).toEqual(saved);
});
