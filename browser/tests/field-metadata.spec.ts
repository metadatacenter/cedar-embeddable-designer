import { test, expect } from '@playwright/test';
import { openSettings, openDesigner, currentTemplate } from './support';

test('authors field metadata and rejects duplicate annotation names', async ({ page }) => {
  await openDesigner(page);
  const section = await openSettings(page.locator('app-field-card').first(), 'Field metadata');
  await section.getByLabel('Preferred label', { exact: true }).fill('Heading');
  await section.getByLabel('Identifier', { exact: true }).fill('title-field');
  await section.getByLabel('Language', { exact: true }).fill('en');
  await section.getByLabel('Property IRI', { exact: true }).fill('https://example.org/title');
  await section.getByLabel('Alternate labels', { exact: true }).fill('Caption\nName');
  await section.getByRole('button', { name: 'Add annotation' }).click();
  await section.getByLabel('Annotation name').fill('source');
  await section.getByLabel('Annotation type').selectOption('iri');
  await section.getByLabel('Annotation value').fill('https://example.org/source');
  await section.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Title)
    .toMatchObject({
      'skos:prefLabel': 'Heading',
      'skos:altLabel': ['Caption', 'Name'],
      'schema:identifier': 'title-field',
      _annotations: { source: { '@id': 'https://example.org/source' } },
    });
  await page.screenshot({ path: '/tmp/ced-field-metadata.png' });
  await section.getByRole('button', { name: 'Add annotation' }).click();
  await section.getByLabel('Annotation name').nth(1).fill('source');
  await section.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('unique');
});
