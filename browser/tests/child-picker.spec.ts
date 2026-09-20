import nestedTemplate from '../../src/app/core/model/fixtures/corpus/template-028.json' with { type: 'json' };
import { expect, test } from '@playwright/test';
import { openDesigner, currentTemplate, fieldOrder } from './support';
import type { CedarEmbeddableDesignerElement, CedJsonObject } from '../../src/app/ced-public-api';

for (const width of [1280, 375])
  test(`at ${width}: stages, removes and cancels selections, then inserts first-class fields through the host contract`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const designer = await openDesigner(page);
    await designer.getByRole('button', { name: /^Add field$/ }).click();
    await expect(designer.getByRole('heading', { name: 'Choose field' })).toBeVisible();
    await expect(designer.getByRole('button', { name: 'Import field' })).toHaveCount(0);
    await designer.getByRole('button', { name: 'Basic', exact: true }).click();
    await designer.getByRole('button', { name: /Modular/ }).click();
    const before = await currentTemplate(page);
    await page.evaluate((section) => {
      section['schema:name'] = 'Section';
      const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
      const field = (element.currentArtifact['properties'] as CedJsonObject)['Title'] as CedJsonObject;
      element.childSource = {
        async search(query) {
          return {
            results:
              query === 'missing'
                ? []
                : [
                    { id: String(field['@id']), name: 'Title', type: 'field', version: '1.0.0', status: 'Draft' },
                    {
                      id: String(section['@id']),
                      name: 'Section',
                      type: 'element',
                      version: '1.0.0',
                      status: 'Published',
                    },
                  ],
          };
        },
        async load(row) {
          return structuredClone(row.type === 'field' ? field : section);
        },
      };
    }, nestedTemplate.properties['Read & Understood Catalog'] as CedJsonObject);
    const open = async () => {
      await designer.getByRole('button', { name: 'Import field', exact: true }).click();
      await expect(designer.getByRole('dialog')).toBeVisible();
      await designer.getByRole('searchbox').fill('Title');
      await designer.getByRole('button', { name: 'Search', exact: true }).click();
      await designer.getByRole('row', { name: 'Select Title', exact: true }).click();
    };
    await open();
    expect(await currentTemplate(page)).toEqual(before);
    await designer.getByRole('button', { name: 'Remove Title' }).click();
    await expect(designer.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
    await designer.getByRole('row', { name: 'Select Title', exact: true }).click();
    await designer.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await currentTemplate(page)).toEqual(before);
    await open();
    await expect(designer.getByRole('row', { name: 'Select Section', exact: true })).toHaveCount(0);
    await page.screenshot({ path: `/tmp/ced-child-dialog-${width}.png` });
    await designer.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(designer.getByRole('dialog')).toHaveCount(0);
    expect(fieldOrder(await currentTemplate(page))).toEqual(['Title', 'Category', 'Publication Date', 'Title 2']);
    await designer.getByRole('button', { name: 'Import element', exact: true }).click();
    await designer.getByRole('searchbox').fill('Section');
    await designer.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(designer.getByRole('row', { name: 'Select Title', exact: true })).toHaveCount(0);
    await designer.getByRole('row', { name: 'Select Section', exact: true }).click();
    await designer.getByRole('button', { name: 'Done', exact: true }).click();
    expect(fieldOrder(await currentTemplate(page))).toEqual([
      'Title',
      'Category',
      'Publication Date',
      'Title 2',
      'Section',
    ]);
  });

test('creates an editable element at the insertion position and adds a nested field', async ({ page }) => {
  const designer = await openDesigner(page);
  await expect(designer.getByRole('button', { name: 'Add element', exact: true })).toHaveCount(0);
  await designer.getByRole('button', { name: 'Basic', exact: true }).click();
  await designer.getByRole('button', { name: /Modular/ }).click();
  const insert = designer.getByRole('button', { name: 'Add element here', exact: true }).first();
  await insert.focus();
  await insert.click();
  expect(fieldOrder(await currentTemplate(page))[0]).toBe('Element');
  await expect
    .poll(() =>
      designer
        .locator('.insert-zone')
        .evaluateAll((zones) => zones.every((zone) => getComputedStyle(zone).opacity === '0')),
    )
    .toBe(true);
  await expect(designer.locator('app-container-editor app-container-editor input').first()).toBeFocused();
  const nested = designer.locator('app-container-editor app-container-editor').first();
  await expect(nested.locator('.element-toggle')).toHaveCount(0);
  await nested.getByRole('button', { name: 'Add field', exact: true }).click();
  await nested.getByRole('button', { name: 'Text', exact: true }).click();
  const document = await currentTemplate(page);
  expect(fieldOrder((document['properties'] as CedJsonObject)['Element'] as CedJsonObject)).toHaveLength(1);
  await nested.getByRole('button', { name: 'Delete field', exact: true }).click();
  await expect(nested.locator('.element-toggle')).toHaveCount(0);
  await nested.getByRole('button', { name: 'Add field', exact: true }).click();
  await nested.getByRole('button', { name: 'Text', exact: true }).click();
  await nested.getByRole('button', { name: 'Collapse Element', exact: true }).click();
  await nested.getByRole('button', { name: 'Delete element Element', exact: true }).click();
  expect(fieldOrder(await currentTemplate(page))).toEqual(['Title', 'Category', 'Publication Date']);
  await expect(designer.getByRole('button', { name: /^Delete element/ })).toHaveCount(0);
});

test('bottom insertion actions reveal on hover and keyboard focus without shifting content', async ({ page }) => {
  const designer = await openDesigner(page);
  const zone = designer.locator('.bottom-insert-zone').first();
  const actions = zone.locator('app-insertion-actions');
  await page.mouse.move(0, 0);
  await expect(actions).toHaveCSS('opacity', '0');
  await zone.scrollIntoViewIfNeeded();
  const before = await zone.boundingBox();
  await zone.hover();
  await expect(actions).toHaveCSS('opacity', '1');
  expect(await zone.boundingBox()).toEqual(before);
  await page.mouse.move(0, 0);
  await expect(actions).toHaveCSS('opacity', '0');
  await actions.getByRole('button', { name: 'Add field', exact: true }).focus();
  await expect(actions).toHaveCSS('opacity', '1');
  await actions.getByRole('button', { name: 'Add field', exact: true }).press('Enter');
  await expect(designer.getByRole('heading', { name: 'Choose field' })).toBeVisible();
});

test('bottom insertion actions remain visible on touch devices', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 375, height: 800 },
  });
  try {
    const page = await context.newPage();
    const designer = await openDesigner(page);
    await expect(designer.locator('.bottom-insert-zone app-insertion-actions').first()).toHaveCSS('opacity', '1');
  } finally {
    await context.close();
  }
});
