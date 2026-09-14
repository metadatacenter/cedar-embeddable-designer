import { expect, test } from '@playwright/test';
import { openDesigner, openSettings, currentTemplate, applyPreset } from './support';

test('field and element property choices update only their parent context and cancel preserves it', async ({ page }) => {
  const designer = await openDesigner(page, '?picker=stub');
  const field = designer.locator('app-field-card').first();
  const metadata = await openSettings(field, 'Field metadata');
  const original = await currentTemplate(page);
  await metadata.getByRole('button', { name: 'Edit property IRI', exact: true }).click();
  const picker = page.locator('cedar-embeddable-term-picker');
  expect(await picker.evaluate((element: any) => ({ types: element.termTypes, max: element.maximumTerms }))).toEqual({ types: ['property'], max: 1 });
  const emit = async (constraints: object[]) => picker.evaluate((element, constraints) => element.dispatchEvent(new CustomEvent('constraintsSelected', { detail: { constraints, actions: [] } })), constraints);
  await emit([{ sourceType: 'ontology', sourceId: 'RO' }]);
  await expect(page.getByRole('alert')).toContainText('Select one property');
  expect(await currentTemplate(page)).toEqual(original);
  await emit([{ sourceType: 'ontology-property', sourceId: 'urn:field-property' }]);
  await expect(picker).toHaveCount(0);
  const withField = await currentTemplate(page);
  expect((withField.properties as any).Title).toEqual((original.properties as any).Title);
  expect((withField.properties as any)['@context'].properties.Title.enum).toEqual(['urn:field-property']);
  await metadata.getByRole('button', { name: 'Edit property IRI', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Choose property IRI', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  expect(await currentTemplate(page)).toEqual(withField);

  await applyPreset(page, 'modular');
  await designer.getByRole('button', { name: 'Add Element', exact: true }).click();
  const element = designer.locator('app-element-card').first();
  await element.getByRole('button', { name: 'Expand element settings' }).click();
  await element.getByRole('tab', { name: 'Element metadata', exact: true }).click();
  await element.getByRole('button', { name: 'Edit property IRI', exact: true }).click();
  await emit([{ sourceType: 'ontology-property', sourceId: 'urn:element-property' }]);
  const saved = await currentTemplate(page);
  expect((saved.properties as any)['@context'].properties.Element.enum).toEqual(['urn:element-property']);
  await page.evaluate(artifact => { (document.querySelector('cedar-embeddable-designer') as any).artifact = artifact; }, saved);
  expect(await currentTemplate(page)).toEqual(saved);
});

test('real CETP selects a property for field metadata', async ({ page }) => {
  test.skip(!process.env.PICKER_BUNDLE, 'Requires the real CETP bundle.');
  const designer = await openDesigner(page);
  await page.addScriptTag({ path: process.env.PICKER_BUNDLE! });
  // Recreate the cards after the host registers the sibling.
  await page.evaluate(() => { const d = document.querySelector('cedar-embeddable-designer') as any; d.artifact = structuredClone(d.currentTemplate); });
  const property = { iri: 'urn:part', kind: 'object', label: 'part of', obsolete: false, parents: [], literals: [] };
  await page.route('**/properties/search', route => route.fulfill({ json: { total: 1, page: 1, pageSize: 25, items: route.request().postDataJSON().page > 1 ? [] : [{ sourceAcronym: 'RO', versionId: 'ro-v1', property: { ...property, hasChildren: false } }] } }));
  await page.route('**/properties/versions?*', route => route.fulfill({ json: [{ id: 'ro-v1', propertiesAvailable: true }] }));
  await page.route('**/properties/hierarchy?*', route => route.fulfill({ json: { selected: { sourceAcronym: 'RO', versionId: 'ro-v1', property }, ancestors: [], children: [], offset: 0 } }));
  const metadata = await openSettings(designer.locator('app-field-card').first(), 'Field metadata');
  await metadata.getByRole('button', { name: 'Edit property IRI', exact: true }).click();
  const picker = page.locator('cedar-embeddable-term-picker');
  await expect(picker.getByRole('tab')).toHaveCount(1);
  await picker.locator('input[type=search]').fill('part');
  await picker.getByRole('option').filter({ hasText: 'part of' }).click();
  await picker.getByRole('button', { name: 'Select property', exact: true }).click();
  await picker.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(metadata).toContainText('urn:part');
  expect(((await currentTemplate(page)).properties as any)['@context'].properties.Title.enum).toEqual(['urn:part']);
});
