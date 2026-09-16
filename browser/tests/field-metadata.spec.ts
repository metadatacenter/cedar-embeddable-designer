import { test, expect } from '@playwright/test';
import { openSettings, openDesigner, currentTemplate } from './support';

test('removed details controls remain absent and imported metadata survives display edits', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.evaluate(() => {
    const designer = document.querySelector('cedar-embeddable-designer') as any;
    const template = structuredClone(designer.currentTemplate);
    Object.assign(template.properties.Title, {
      'skos:prefLabel': 'Heading',
      'skos:altLabel': ['Caption', 'Name'],
      'schema:identifier': 'title-field',
      _annotations: { source: { '@id': 'https://example.org/source' } },
    });
    designer.artifact = template;
  });
  const card = designer.locator('app-field-card').first();
  const section = await openSettings(card, 'Display');
  await expect(card.getByRole('tab', { name: 'Field details', exact: true })).toHaveCount(0);
  await expect(card.getByLabel('Property IRI', { exact: true })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Add annotation' })).toHaveCount(0);
  await section.getByLabel('Display label', { exact: true }).fill('Visible heading');
  expect(((await currentTemplate(page)).properties as any).Title).toMatchObject({
    'skos:prefLabel': 'Heading',
    'skos:altLabel': ['Caption', 'Name'],
    'schema:identifier': 'title-field',
    _annotations: { source: { '@id': 'https://example.org/source' } },
  });
});
