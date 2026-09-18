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
    await designer.getByRole('button', { name: /Add Child/ }).click();
    await expect(designer.getByRole('heading', { name: 'Chose child' })).toBeVisible();
    await expect(designer.getByRole('button', { name: 'Select existing fields and elements' })).toHaveCount(0);
    await designer.getByRole('button', { name: 'Basic', exact: true }).click();
    await designer.getByRole('button', { name: /Semantic/ }).click();
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
      await designer.getByRole('button', { name: /Add Child/ }).click();
      await designer.getByRole('button', { name: 'Select existing fields and elements' }).click();
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
    await designer.getByRole('row', { name: 'Select Section', exact: true }).press('Enter');
    await page.screenshot({ path: `/tmp/ced-child-dialog-${width}.png` });
    await designer.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(designer.getByRole('dialog')).toHaveCount(0);
    expect(fieldOrder(await currentTemplate(page))).toEqual([
      'Title',
      'Category',
      'Publication Date',
      'Title 2',
      'Section',
    ]);
  });
