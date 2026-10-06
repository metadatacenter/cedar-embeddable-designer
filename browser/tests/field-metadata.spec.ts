import { test, expect } from '@playwright/test';
import { openSettings, openDesigner, currentTemplate } from './support';

test('removed details controls remain absent and imported metadata survives a rename from the Display tab', async ({
  page,
}) => {
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
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Title['schema:identifier'])
    .toBe('title-field');
  const card = designer.locator('app-field-card').first();
  const section = await openSettings(card, 'Display');
  await expect(card.getByRole('tab', { name: 'Field details', exact: true })).toHaveCount(0);
  await expect(card.getByLabel('Property IRI', { exact: true })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Add annotation' })).toHaveCount(0);
  // The Display tab edits the field's own name. The header shows the name its parent shows it by,
  // which is the preferred label here, so the two are apart and a rename leaves the header alone.
  await expect(section.getByLabel('Field name', { exact: true })).toHaveValue('Title');
  await expect(card.getByRole('textbox', { name: 'Field display name', exact: true })).toHaveValue('Heading');
  await section.getByLabel('Field name', { exact: true }).fill('Visible title');
  await expect(card.getByRole('textbox', { name: 'Field display name', exact: true })).toHaveValue('Heading');
  expect(((await currentTemplate(page)).properties as any).Title).toMatchObject({
    'schema:name': 'Visible title',
    'skos:prefLabel': 'Heading',
    'skos:altLabel': ['Caption', 'Name'],
    'schema:identifier': 'title-field',
    _annotations: { source: { '@id': 'https://example.org/source' } },
  });
});

for (const [stored, label] of [
  ['bibo:draft', 'Draft'],
  ['bibo:published', 'Published'],
]) {
  test(`field metadata displays ${label} without exposing its schema prefix`, async ({ page }) => {
    const designer = await openDesigner(page);
    await page.evaluate((status) => {
      const host = document.querySelector('cedar-embeddable-designer') as any;
      const template = structuredClone(host.currentTemplate);
      template.properties.Title['bibo:status'] = status;
      host.artifact = template;
    }, stored);
    await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title['bibo:status']).toBe(stored);
    const section = await openSettings(designer.locator('app-field-card').first(), 'Field metadata');
    await expect(
      section
        .locator('dt')
        .filter({ hasText: /^Publication status$/ })
        .locator('+ dd'),
    ).toHaveText(label);
    await expect(section).not.toContainText('bibo:');
    expect(((await currentTemplate(page)).properties as any).Title['bibo:status']).toBe(stored);
  });
}

test('a manual property IRI is checked as it is typed, and its label sits above it', async ({ page }) => {
  const designer = await openDesigner(page);
  const section = await openSettings(designer.locator('app-field-card').first(), 'Configuration');
  await section.getByRole('button', { name: 'Enter IRI manually', exact: true }).click();
  const input = section.getByRole('textbox', { name: 'IRI', exact: true });
  const add = section.getByRole('button', { name: 'Add property', exact: true });
  await input.fill('dddd');
  await expect(section.getByRole('alert')).toHaveText('Enter an absolute IRI, such as https://example.org/property.');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(add).toBeDisabled();
  await input.fill('https://example.org/property');
  await expect(section.getByRole('alert')).toHaveCount(0);
  await expect(add).toBeEnabled();
  // The label sits above the IRI box, as every other Configuration label sits above its control.
  const label = section.getByText('Property IRI', { exact: true });
  const [labelBox, iriBox] = await Promise.all([
    label.boundingBox(),
    section.locator('app-property-picker').boundingBox(),
  ]);
  expect(labelBox!.y + labelBox!.height).toBeLessThanOrEqual(iriBox!.y + 1);
  // The entry's label reads as the tab's other labels do: muted and medium, not the primary text colour.
  const style = await section
    .locator('app-manual-iri label')
    .evaluate((node) => ({ color: getComputedStyle(node).color, weight: getComputedStyle(node).fontWeight }));
  const dt = await label.evaluate((node) => ({
    color: getComputedStyle(node).color,
    weight: getComputedStyle(node).fontWeight,
  }));
  expect(style).toEqual(dt);
});
