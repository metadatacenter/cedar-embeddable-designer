import { applyPreset } from './support';
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
    await applyPreset(page, 'modular');
    await expect(designer.locator('app-insertion-actions').first().getByRole('button')).toHaveCount(3);
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
                    {
                      id: String(field['@id']),
                      name: 'Title',
                      type: 'field',
                      version: '0.0.1',
                      status: 'bibo:draft',
                      modifiedOn: '2026-09-29T12:00:00Z',
                    },
                    {
                      id: String(section['@id']),
                      name: 'Section',
                      type: 'element',
                      version: '0.0.1',
                      modifiedOn: '2026-09-28T12:00:00Z',
                      status: 'http://purl.org/ontology/bibo/status/published',
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
      await designer.getByRole('button', { name: 'Import fields and elements', exact: true }).click();
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

    const dialog = designer.getByRole('dialog', { name: 'Import Fields and Elements' });
    await expect(dialog.getByRole('searchbox', { name: 'Search for fields or elements' })).toBeVisible();
    // Cancel and Done close the dialog from its bottom right, as the designer's other dialogs do.
    await page.evaluate(() => document.fonts.ready);
    // A native dialog recentres as its content settles. Read every box in one layout
    // frame so movement between Playwright calls cannot look like misaligned buttons.
    const { frame, results, cancelBox, doneBox } = await dialog.evaluate((element) => {
      const tables = element.querySelectorAll('table');
      const buttons = element.querySelectorAll('.actions button');
      return {
        frame: element.getBoundingClientRect().toJSON(),
        results: tables[tables.length - 1].getBoundingClientRect().toJSON(),
        cancelBox: buttons[0].getBoundingClientRect().toJSON(),
        doneBox: buttons[1].getBoundingClientRect().toJSON(),
      };
    });
    expect(doneBox.y).toBeGreaterThan(results.y + results.height);
    expect(Math.abs(cancelBox.y - doneBox.y)).toBeLessThanOrEqual(1);
    expect(cancelBox.x + cancelBox.width).toBeLessThan(doneBox.x);
    expect(frame.x + frame.width - (doneBox.x + doneBox.width)).toBeLessThan(40);
    await dialog.screenshot({ path: test.info().outputPath('import-dialog.png') });
    // The search field clears with the registry's close glyph, drawn as a mask, rather than the
    // browser's own button. Chromium reports no computed style for that pseudo-element, so the
    // rule that draws it is read instead.
    const masked = await dialog.getByRole('searchbox').evaluate((input) => {
      const root = input.getRootNode() as Document | ShadowRoot;
      const pseudo = '::-webkit-search-cancel-button';
      return [...root.styleSheets, ...root.adoptedStyleSheets]
        .flatMap((sheet) => [...sheet.cssRules])
        .some(
          (rule) =>
            rule instanceof CSSStyleRule &&
            rule.selectorText.endsWith(pseudo) &&
            input.matches(rule.selectorText.slice(0, -pseudo.length)) &&
            rule.style.getPropertyValue('mask-image').startsWith('url("data:image/svg+xml'),
        );
    });
    expect(masked).toBe(true);
    await designer.getByRole('row', { name: 'Select Section', exact: true }).click();
    const selected = dialog.getByRole('table', { name: 'Selected items' });
    await expect(selected.locator('.version-cell')).toHaveText(['0.0.1 · draft', '0.0.1 · published']);
    await expect(dialog.getByRole('table', { name: 'Search results' }).locator('.version-cell')).toHaveText([
      '0.0.1 · draft',
      '0.0.1 · published',
    ]);
    await expect(selected.locator('.status').first()).toHaveCSS('display', 'inline');

    await selected.getByRole('button', { name: 'Reorder Section', exact: true }).press('ArrowUp');
    await expect(selected.locator('tbody .name-cell')).toHaveText(['Section', 'Title']);
    await expect(dialog.getByRole('table', { name: 'Search results' }).getByRole('columnheader')).toHaveText([
      'Type',
      'Name',
      'Last modified',
      'Version',
    ]);
    await expect(selected.locator('th').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    if (width === 1280) {
      const handle = selected.getByRole('button', { name: 'Reorder Title', exact: true });
      const from = (await handle.boundingBox())!;
      const target = (await selected.locator('tbody tr').first().boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2, from.y - 8, { steps: 4 });
      await page.mouse.move(from.x + from.width / 2, target.y + 4, { steps: 12 });
      await page.mouse.up();
      await expect(selected.locator('tbody .name-cell')).toHaveText(['Title', 'Section']);
      await handle.press('ArrowDown');
      await expect(selected.locator('tbody .name-cell')).toHaveText(['Section', 'Title']);
    }
    await page.screenshot({ path: `/tmp/ced-child-dialog-${width}.png` });
    await designer.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(designer.getByRole('dialog')).toHaveCount(0);
    // Each takes its name as its key. A Title is there already, so that key is reported at once and the
    // imported field waits under a usable one until the author chooses.
    expect(fieldOrder(await currentTemplate(page))).toEqual([
      'Title',
      'Category',
      'Publication Date',
      'Section',
      'Title_2',
    ]);
    await expect(designer.locator('.validation-summary')).toContainText('already uses that key');
  });

test('creates an editable element at the insertion position and adds a nested field', async ({ page }) => {
  const designer = await openDesigner(page);
  await expect(designer.getByRole('button', { name: 'Add element', exact: true })).toHaveCount(0);
  await applyPreset(page, 'modular');
  const insert = designer.getByRole('button', { name: 'Add element here', exact: true }).first();
  await insert.focus();
  await insert.click();
  const name = designer.getByRole('textbox', { name: 'Element display name', exact: true }).first();
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('');
  await name.fill('Element');
  expect(fieldOrder(await currentTemplate(page))[0]).toBe('Element');
  await page.mouse.move(0, 0);
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
  await page
    .getByRole('dialog', { name: 'Delete element?' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
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

for (const kind of ['template', 'element'] as const) {
  test(`new empty ${kind}s reveal insertion actions until the first hover exit`, async ({ page }) => {
    const designer = await openDesigner(page);
    await page.mouse.move(0, 0);
    const start = () =>
      page.evaluate(
        (kind) =>
          (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).newArtifact(kind),
        kind,
      );
    await start();
    const zone = designer.locator('.bottom-insert-zone');
    const actions = zone.locator('app-insertion-actions');
    await expect(actions).toHaveCSS('opacity', '1');
    await designer
      .getByRole('textbox', { name: kind === 'template' ? 'Template name' : 'Element name', exact: true })
      .fill('Study');
    await expect(actions).toHaveCSS('opacity', '1');
    const before = await zone.boundingBox();
    await zone.hover();
    await page.mouse.move(0, 0);
    await expect(actions).toHaveCSS('opacity', '0');
    expect(await zone.boundingBox()).toEqual(before);
    await zone.hover();
    await expect(actions).toHaveCSS('opacity', '1');
    await page.mouse.move(0, 0);
    await actions.getByRole('button', { name: 'Add field', exact: true }).focus();
    await expect(actions).toHaveCSS('opacity', '1');
    // A subsequent new document gets its own initial hint; opening a saved one does not.
    await start();
    await expect(actions).toHaveCSS('opacity', '1');
    await designer
      .getByRole('textbox', { name: kind === 'template' ? 'Template name' : 'Element name', exact: true })
      .fill('Another study');
    await page.evaluate(() => {
      const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
      element.loadArtifact(element.currentArtifact);
    });
    await expect(actions).toHaveCSS('opacity', '0');
  });
}

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
