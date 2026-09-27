import { addElementFixture, child } from './support';
import { expect, test } from '@playwright/test';
import { openSettings, openDesigner, currentTemplate, nestFixtureFields } from './support';

test('creates, edits, exports and reopens a standalone element through the public API', async ({ page }) => {
  await openDesigner(page);
  await loadStandalone(page, 'Element');
  const name = page.getByPlaceholder('Enter element name');
  await name.fill('Study element');
  const element = await currentTemplate(page);
  expect(element['@type']).toBe('https://schema.metadatacenter.org/core/TemplateElement');
  expect(element['schema:name']).toBe('Study element');
  await page.evaluate((artifact) => {
    const designer = document.querySelector('cedar-embeddable-designer') as HTMLElement & { artifact: object };
    designer.artifact = artifact;
  }, element);
  await expect(name).toHaveValue('Study element');
  expect(await currentTemplate(page)).toEqual({ ...element, title: 'Study element element schema' });
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
    await addElementFixture(page, root);
    const parent = nestedEditors(root).first();
    await directHeader(parent).getByPlaceholder('Enter element name').fill('Samples');
    await expect(directHeader(parent).getByRole('button', { name: 'Collapse Samples', exact: true })).toHaveCount(0);
    await addElementFixture(page, directContent(parent));
    await expect(directHeader(parent).getByRole('button', { name: 'Collapse Samples', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const nested = nestedEditors(parent).first();
    await directHeader(nested).getByPlaceholder('Enter element name').fill('Sample');
    const placement = directHeader(nested).locator(':scope > app-element-card');
    await placement.getByRole('button', { name: 'Expand element settings', exact: true }).click();
    await expect(placement.getByRole('tablist')).toBeVisible();
    await placement.getByRole('tab', { name: 'Display', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(placement.getByRole('tab', { name: 'Occurrences', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(placement.getByRole('tab', { name: 'Annotations', exact: true })).toBeFocused();
    await placement.getByRole('button', { name: 'Collapse element settings', exact: true }).click();
    await expect(placement.getByRole('tablist')).toBeHidden();
    await expect(directContent(nested)).toBeVisible();
    await placement.getByRole('button', { name: 'Expand element settings', exact: true }).click();
    await expect(placement.getByRole('tab', { name: 'Element details', exact: true })).toHaveCount(0);
    await expect(placement.getByRole('tabpanel', { name: 'Annotations', exact: true })).toBeVisible();
    await placement.getByRole('tab', { name: 'Occurrences', exact: true }).click();
    const checkbox = placement.getByLabel('Allow multiple', { exact: true });
    await expect(checkbox).toBeVisible();
    const singlePosition = await checkbox.boundingBox();
    await checkbox.check();
    const multiplePosition = await checkbox.boundingBox();
    expect(singlePosition).not.toBeNull();
    expect(multiplePosition).not.toBeNull();
    expect(multiplePosition!.x).toBeCloseTo(singlePosition!.x, 0);
    const colors = await checkbox.evaluate((node) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--cedar-color-primary)';
      node.parentElement!.appendChild(probe);
      const primary = getComputedStyle(probe).color;
      probe.remove();
      return { accent: getComputedStyle(node).accentColor, primary };
    });
    expect(colors.accent).toBe(colors.primary);
    await placement.getByLabel('Minimum occurrences', { exact: true }).fill('2');
    await placement.getByLabel('Maximum occurrences', { exact: true }).fill('4');
    await nestFixtureFields(page, ['element', 'element']);
    await placement.getByRole('button', { name: 'Expand element settings', exact: true }).click();
    await placement.getByRole('tab', { name: 'Occurrences', exact: true }).click();
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
    await directHeader(nested).getByPlaceholder('Enter element name').click();
    const rootCategory = root
      .locator(':scope > .container-content > .fields-drop-list > .field-drop-item app-field-card')
      .first();
    await rootCategory.getByRole('textbox', { name: 'Field name', exact: true }).fill('Root category');
    const saved = await currentTemplate(page);
    const properties = saved.properties as Record<string, any>;
    expect(properties.element.properties.element.minItems).toBe(2);
    expect(properties.element.properties.element.maxItems).toBe(4);
    expect(properties.element.properties.element.items['schema:name']).toBe('Sample');
    expect(properties.element.properties.element.items._ui.propertyLabels.Title).toBe('Nested display');
    expect(
      Object.values(properties).some((field: any) => (field.items ?? field)['schema:name'] === 'Root category'),
    ).toBe(true);
    expect(await root.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`ced-inline-elements-${width}.png`), fullPage: true });
    await page.evaluate((artifact) => {
      (document.querySelector('cedar-embeddable-designer') as HTMLElement & { artifact: object }).artifact = artifact;
    }, saved);
    // Reopening derives schema titles from the edited names, preserving every other property.
    const expected = structuredClone(saved);
    const expectedProperties = expected.properties as Record<string, any>;
    expectedProperties.Category.title = 'Root category field schema';
    expectedProperties.element.properties.element.items.properties.Title.title = 'Nested title field schema';
    expect(await currentTemplate(page)).toEqual(expected);
    await expect(nestedEditors(root).first().locator(':scope > .container-content')).toBeVisible();
  });
}

for (const kind of ['Template', 'Element']) {
  test(`${kind} Identifier edits schema:identifier without changing @id`, async ({ page }) => {
    await openDesigner(page);
    await loadStandalone(page, kind);
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

test('element metadata shows provenance without changing the artifact and hides empty optional values', async ({
  page,
}) => {
  const designer = await openDesigner(page);
  await page.getByRole('button', { name: 'Basic', exact: true }).click();
  await page.getByRole('button', { name: /Modular/ }).click();
  await addElementFixture(page, designer);
  const artifact = await currentTemplate(page);
  const element = (artifact.properties as Record<string, any>).element;
  element['pav:createdOn'] = '2026-08-18T16:07:23-07:00';
  element['pav:lastUpdatedOn'] = '2026-09-11T07:27:46-07:00';
  element['pav:derivedFrom'] = 'https://example.org/elements/source';
  element['pav:previousVersion'] = 'https://example.org/elements/previous';
  const load = async () => {
    await page.evaluate((value) => {
      (document.querySelector('cedar-embeddable-designer') as HTMLElement & { artifact: object }).artifact = value;
    }, artifact);
    const settings = designer.locator('app-element-card').first();
    await settings.getByRole('button', { name: 'Expand element settings', exact: true }).click();
    await settings.getByRole('tab', { name: 'Element metadata', exact: true }).click();
    return settings.getByRole('tabpanel', { name: 'Element metadata', exact: true });
  };
  const panel = await load();
  const before = await currentTemplate(page);
  await expect(panel).toContainText(element['@id']);
  await expect(panel).toContainText('2026-08-18T16:07:23-07:00');
  await expect(panel).toContainText('2026-09-11T07:27:46-07:00');
  await expect(panel).toContainText('https://example.org/elements/source');
  await expect(panel).toContainText('https://example.org/elements/previous');
  expect(await currentTemplate(page)).toEqual(before);
  element['bibo:status'] = 'bibo:published';
  const published = await load();
  await expect(published.locator('dd').filter({ hasText: /^Published$/ })).toBeVisible();
  for (const key of ['pav:version', 'bibo:status', 'pav:derivedFrom', 'pav:previousVersion']) delete element[key];
  const empty = await load();
  await expect(
    designer.locator('app-container-editor').nth(1).getByRole('textbox', { name: 'Version', exact: true }),
  ).toHaveValue('');
  await expect(
    designer.locator('app-container-editor').nth(1).getByRole('textbox', { name: 'Version', exact: true }),
  ).toHaveAttribute('placeholder', 'Not specified');
  await expect(empty.locator('dd').filter({ hasText: /^Draft$/ })).toHaveCount(0);
  for (const label of ['Version', 'Publication status', 'Derived from', 'Previous version']) {
    await expect(empty.locator('dt').filter({ hasText: new RegExp('^' + label + '$') })).toHaveCount(0);
  }
});

// Standalone documents are supplied by the embedding host, without a File menu.
async function loadStandalone(page: import('@playwright/test').Page, kind: string) {
  if (kind === 'Template') return;
  await page.getByRole('button', { name: 'Basic', exact: true }).click();
  await page.getByRole('button', { name: /Modular/ }).click();
  await addElementFixture(page);
  const template = await currentTemplate(page);
  const element = (template.properties as Record<string, any>).element;
  await page.evaluate((artifact) => {
    (document.querySelector('cedar-embeddable-designer') as HTMLElement & { artifact: object }).artifact = artifact;
  }, element);
}

for (const width of [1280, 375]) {
  test(`standalone element uses the compact shared authoring header at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    await loadStandalone(page, 'Element');
    const header = directHeader(designer.locator('app-container-editor').first());
    const name = header.getByPlaceholder('Enter element name', { exact: true });
    await name.fill('Study element');
    await expect(name).toHaveCSS('font-size', '14px');
    await expect(header).toHaveCSS('border-top-width', '1px');
    await expect(header.locator('textarea.template-input')).toHaveCSS('resize', 'none');
    const box = (await header.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(width === 1280 ? 140 : 200);
    if (width === 1280) {
      await expect(header.locator('.template-header-card__icon')).toBeVisible();
      const groups = header.locator('.template-header-row > .template-field-group input');
      const tops = await groups.evaluateAll((inputs) => inputs.map((input) => input.getBoundingClientRect().top));
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [1280, 375]) {
  test(`nested element header has half the child inset and a bottom-corner toggle at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    await designer.getByRole('button', { name: 'Basic', exact: true }).click();
    await designer.getByRole('button', { name: /Modular/ }).click();
    await addElementFixture(page);
    await nestFixtureFields(page, ['element']);
    const element = designer.locator('app-container-editor').nth(1);
    const header = directHeader(element);
    const geometry = await element.evaluate((node) => {
      const outer = node.parentElement!;
      const edge = outer.getBoundingClientRect().left + parseFloat(getComputedStyle(outer).borderLeftWidth);
      const header = node.querySelector(':scope > .template-header-card')!.getBoundingClientRect();
      const child = node.querySelector('.nested-content .field-drag-container')!.getBoundingClientRect();
      const toggle = node.querySelector('.element-toggle')!.getBoundingClientRect();
      const bin = node.querySelector('.element-delete')!.getBoundingClientRect();
      const version = node.querySelector('.version-group .template-field-label')!.getBoundingClientRect();
      return {
        headerInset: header.left - edge,
        childInset: child.left - edge,
        binAlignment: Math.abs(bin.top - version.top),
        toggleBottom: header.bottom - toggle.bottom,
        toggleRight: header.right - toggle.right,
      };
    });
    expect(geometry.headerInset).toBeGreaterThan(0);
    expect(geometry.headerInset * 2).toBeCloseTo(geometry.childInset, 1);
    expect(geometry.binAlignment).toBeLessThan(1);
    expect(geometry.toggleBottom).toBeLessThanOrEqual(6);
    expect(geometry.toggleRight).toBeLessThanOrEqual(6);
    await header.getByRole('button', { name: 'Collapse Element', exact: true }).click();
    await expect(directContent(element)).toBeHidden();
    await header.getByRole('button', { name: 'Expand Element', exact: true }).click();
    await expect(directContent(element)).toBeVisible();
  });
}

for (const collapsed of [false, true]) {
  test(`element move handle preserves children when collapsed=${collapsed}`, async ({ page }) => {
    const designer = await openDesigner(page);
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.getByRole('button', { name: 'Basic', exact: true }).click();
    await page.getByRole('button', { name: /Modular/ }).click();
    await addElementFixture(page, designer);
    await nestFixtureFields(page, ['element'], 2);
    const root = designer.locator('app-container-editor').first();
    const element = nestedEditors(root).first();
    if (collapsed) await directHeader(element).locator('.element-toggle').click();
    const before = await currentTemplate(page);
    const handle = directHeader(element).getByLabel('Drag element to reorder', { exact: true });
    await handle.scrollIntoViewIfNeeded();
    const from = (await handle.boundingBox())!;
    const bin = (await directHeader(element).locator('.element-delete').boundingBox())!;
    expect(from.y + from.height / 2).toBe(bin.y + bin.height / 2);
    const first = root.locator(':scope > .container-content > .fields-drop-list > .field-drop-item').first();
    const to = (await first.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 3 });
    await page.mouse.move(from.x + from.width / 2, to.y + 5, { steps: 20 });
    await page.mouse.up();
    await expect
      .poll(async () => (await currentTemplate(page))._ui)
      .toMatchObject({
        order: ['element', ...(before._ui as { order: string[] }).order.filter((name) => name !== 'element')],
      });
    expect(child(await currentTemplate(page), 'element')).toEqual(child(before, 'element'));
  });
}

for (const width of [1280, 375]) {
  test(`template children collapse independently of settings at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    const root = designer.locator('app-container-editor').first();
    const toggle = directHeader(root).locator('.element-toggle');
    const before = await currentTemplate(page);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(directContent(root)).toBeHidden();
    await expect(directHeader(root)).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(await currentTemplate(page)).toEqual(before);
    await toggle.click();
    await expect(directContent(root)).toBeVisible();
    const cards = root.locator('app-field-card');
    for (let remaining = await cards.count(); remaining > 0; remaining--) {
      await cards.first().getByRole('button', { name: 'Delete field', exact: true }).click();
      await expect(cards).toHaveCount(remaining - 1);
    }
    await expect(toggle).toHaveCount(0);
    await expect(directContent(root)).toBeVisible();
  });
}

test('edits a nested element key and rejects keys used by sibling fields', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.getByRole('button', { name: 'Basic', exact: true }).click();
  await page.getByRole('button', { name: /Modular/ }).click();
  await addElementFixture(page, designer);
  const settings = designer.locator('app-element-card').first();
  const expand = settings.getByRole('button', { name: 'Expand element settings', exact: true });
  await expand.click();
  await settings.getByRole('tab', { name: 'Element metadata', exact: true }).click();
  const key = settings.getByLabel('Key', { exact: true });
  await key.fill('Title');
  await expect(settings.getByRole('alert')).toContainText('already uses that key');
  await key.fill('details');
  await expect(settings.getByRole('alert')).toHaveCount(0);
  expect((await currentTemplate(page)).properties).toHaveProperty('details');
  expect(((await currentTemplate(page)).properties as any).details['schema:name']).toBe('Element');
});

test('confirms deletion of an element subtree, but deletes empty elements immediately', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.getByRole('button', { name: 'Basic', exact: true }).click();
  await page.getByRole('button', { name: /Modular/ }).click();
  const root = designer.locator('app-container-editor').first();
  await addElementFixture(page, root);
  const parent = nestedEditors(root).first();
  await addElementFixture(page, directContent(parent));
  const bin = directHeader(parent).getByRole('button', { name: 'Delete element Element', exact: true });
  const before = await currentTemplate(page);
  await bin.click();
  const dialog = page.getByRole('dialog', { name: 'Delete element?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(bin).toBeFocused();
  expect(await currentTemplate(page)).toEqual(before);
  await bin.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await currentTemplate(page)).toEqual(before);
  await bin.click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(nestedEditors(root)).toHaveCount(0);
  expect((await currentTemplate(page)).properties).toHaveProperty('Title');
  await addElementFixture(page, root);
  await directHeader(nestedEditors(root).first())
    .getByRole('button', { name: 'Delete element Element', exact: true })
    .click();
  await expect(nestedEditors(root)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
