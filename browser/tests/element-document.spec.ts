import { expect, test } from '@playwright/test';
import { openSettings, openDesigner, currentTemplate } from './support';

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

const nestedEditors = (editor: import('@playwright/test').Locator) =>
  editor.locator(
    ':scope > .container-content > .fields-drop-list > .field-drop-item > .field-drag-container > app-container-editor',
  );
const directHeader = (editor: import('@playwright/test').Locator) => editor.locator(':scope > .template-header-card');
const directContent = (editor: import('@playwright/test').Locator) => editor.locator(':scope > .container-content');

for (const width of [1280, 375]) {
  test(`inline elements start expanded, preserve edits when collapsed, and target their own children at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    const root = designer.locator('app-container-editor').first();
    await root.getByPlaceholder('Template name').fill('Debug template');
    await page.getByRole('button', { name: 'Basic', exact: true }).click();
    await page.getByRole('button', { name: /Modular/ }).click();
    await root.getByRole('button', { name: 'Add Element', exact: true }).click();
    const parent = nestedEditors(root).first();
    await directHeader(parent).getByPlaceholder('Element name').fill('Samples');
    await expect(directHeader(parent).getByRole('button', { name: 'Collapse Samples', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await directContent(parent).getByRole('button', { name: 'Add Element', exact: true }).click();
    const nested = nestedEditors(parent).first();
    await directHeader(nested).getByPlaceholder('Element name').fill('Sample');
    const placement = directContent(nested).locator(':scope > app-element-card');
    await placement.locator('summary').click();
    await placement.getByLabel('Property name', { exact: true }).fill('sample');
    await placement.getByLabel('Allow multiple', { exact: true }).check();
    await placement.getByLabel('Minimum occurrences', { exact: true }).fill('2');
    await placement.getByLabel('Maximum occurrences', { exact: true }).fill('4');
    const field = root.locator('app-field-card').first();
    await openSettings(field, 'Placement');
    await field.getByLabel('Move child to container').selectOption({ label: 'Debug template / Element / sample' });
    const moved = nested.locator('app-field-card').first();
    await expect(moved.getByRole('textbox', { name: 'Field name', exact: true })).toHaveValue('Title');
    await placement.getByLabel('Minimum occurrences', { exact: true }).fill('8');
    await expect(placement.getByRole('alert')).toBeVisible();
    // Select the root, then edit the nested field without navigating into it.
    await directHeader(root).getByPlaceholder('Template name').click();
    await moved.getByRole('textbox', { name: 'Field name', exact: true }).fill('Nested title');
    await expect(placement.getByLabel('Minimum occurrences', { exact: true })).toHaveValue('8');
    await placement.getByLabel('Minimum occurrences', { exact: true }).fill('2');
    await expect(placement.getByRole('alert')).toHaveCount(0);
    const display = await openSettings(moved, 'Display');
    await display.getByLabel('Display label', { exact: true }).fill('Nested display');
    await directHeader(parent).getByRole('button', { name: 'Collapse Samples', exact: true }).click();
    await expect(directContent(parent)).toBeHidden();
    const collapsed = await currentTemplate(page);
    await directHeader(parent).getByRole('button', { name: 'Expand Samples', exact: true }).click();
    await expect(moved.getByRole('textbox', { name: 'Field name', exact: true })).toHaveValue('Nested title');
    expect(await currentTemplate(page)).toEqual(collapsed);
    // Root fields still respond while a different element is selected.
    await directHeader(nested).getByPlaceholder('Element name').click();
    const rootCategory = root
      .locator(':scope > .container-content > .fields-drop-list > .field-drop-item app-field-card')
      .first();
    await rootCategory.getByRole('textbox', { name: 'Field name', exact: true }).fill('Root category');
    const saved = await currentTemplate(page);
    const properties = saved.properties as Record<string, any>;
    expect(properties.Element.properties.sample.minItems).toBe(2);
    expect(properties.Element.properties.sample.maxItems).toBe(4);
    expect(properties.Element.properties.sample.items['schema:name']).toBe('Sample');
    expect(properties.Element.properties.sample.items._ui.propertyLabels['Nested title']).toBe('Nested display');
    expect(properties['Root category']).toBeDefined();
    expect(await root.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `/tmp/ced-inline-elements-${width}.png`, fullPage: true });
    await page.evaluate((artifact) => {
      (document.querySelector('cedar-embeddable-designer') as HTMLElement & { artifact: object }).artifact = artifact;
    }, saved);
    expect(await currentTemplate(page)).toEqual(saved);
    await expect(nestedEditors(root).first().locator(':scope > .container-content')).toBeVisible();
  });
}

for (const kind of ['Template', 'Element']) {
  test(`${kind} Identifier edits schema:identifier without changing @id`, async ({ page }) => {
    await openDesigner(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('button', { name: `New ${kind}`, exact: true }).click();
    const original = await currentTemplate(page);
    const identifier = page.getByPlaceholder('Identifier', { exact: true });
    await expect(identifier).toHaveValue('');
    await identifier.fill('Study protocol ABC-123');
    const edited = await currentTemplate(page);
    expect(edited['@id']).toEqual(original['@id']);
    expect(edited['schema:identifier']).toBe('Study protocol ABC-123');
    await page.evaluate((artifact) => {
      (document.querySelector('cedar-embeddable-designer') as any).artifact = artifact;
    }, edited);
    await expect(identifier).toHaveValue('Study protocol ABC-123');
    await identifier.fill('');
    const cleared = await currentTemplate(page);
    expect(cleared['@id']).toEqual(original['@id']);
    expect(cleared['schema:identifier'] ?? null).toBeNull();
  });
}
