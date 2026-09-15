import { expect, test, type Locator, type Page } from '@playwright/test';
import { openDesigner, openSettings, currentTemplate, child } from './support';
import type { CedarEmbeddableDesignerElement } from '../../src/app/ced-public-api';

async function addRows(editor: Locator) {
  await editor.getByRole('button', { name: 'Add annotation', exact: true }).click();
  await expect(editor.locator('textarea').first()).toHaveCSS('resize', 'none');
  await expect(editor.getByRole('button', { name: 'Remove annotation 1', exact: true }).locator('svg')).toBeVisible();
  await editor.getByRole('textbox', { name: 'Annotation name 1', exact: true }).fill('note');
  await editor.getByRole('textbox', { name: 'Annotation value 1', exact: true }).fill('Reviewed');
  await editor.getByRole('button', { name: 'Add annotation', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Annotation name 2', exact: true }).fill('source');
  await editor.getByRole('combobox', { name: 'Annotation value type 2', exact: true }).selectOption('iri');
  await editor.getByRole('textbox', { name: 'Annotation value 2', exact: true }).fill('urn:source');
}
async function reloadArtifact(page: Page, artifact: object) {
  await page.evaluate((artifact) => {
    (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).artifact =
      artifact as never;
  }, artifact);
}
const annotations = { note: { '@value': 'Reviewed' }, source: { '@id': 'urn:source' } };

for (const width of [1280, 375]) {
  test(`authors template, field and nested element annotations and reopens them at ${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    const root = designer.locator('app-container-editor').first();
    const rootSettings = root.locator(':scope > .template-header-card > app-container-settings');
    await rootSettings.getByRole('button', { name: 'Expand template settings' }).click();
    await rootSettings.getByRole('tab', { name: 'Annotations', exact: true }).click();
    await addRows(rootSettings.locator('app-annotations-editor'));
    expect((await currentTemplate(page))._annotations).toEqual(annotations);
    await rootSettings.screenshot({ path: testInfo.outputPath('annotations.png') });
    await rootSettings.getByRole('button', { name: 'Collapse template settings' }).click();
    const card = designer.locator('app-field-card').first();
    await openSettings(card, 'Annotations');
    await addRows(card.locator('app-annotations-editor'));
    expect(child(await currentTemplate(page), 'Title')._annotations).toEqual(annotations);
    await page.getByRole('button', { name: 'Basic', exact: true }).click();
    await page.getByRole('button', { name: /Modular/ }).click();
    await root.getByRole('button', { name: 'Add Element', exact: true }).click();
    const elementSettings = designer.locator('app-element-card').first();
    await elementSettings.getByRole('button', { name: 'Expand element settings' }).click();
    await elementSettings.getByRole('tab', { name: 'Annotations', exact: true }).click();
    await addRows(elementSettings.locator('app-annotations-editor'));
    const saved = await currentTemplate(page);
    expect(child(saved, 'Element')._annotations).toEqual(annotations);
    await reloadArtifact(page, saved);
    await openSettings(designer.locator('app-field-card').first(), 'Annotations');
    await expect(
      designer.locator('app-field-card').first().getByRole('textbox', { name: 'Annotation value 1', exact: true }),
    ).toHaveValue('Reviewed');
    expect(await currentTemplate(page)).toEqual(saved);
    // The same element metadata editor is available when an element is opened as its own document.
    await reloadArtifact(page, child(saved, 'Element'));
    const standalone = designer.locator('app-container-settings');
    await standalone.getByRole('button', { name: 'Expand element settings' }).click();
    await standalone.getByRole('tab', { name: 'Annotations', exact: true }).click();
    await expect(standalone.getByRole('textbox', { name: 'Annotation value 2', exact: true })).toHaveValue(
      'urn:source',
    );
    await standalone.getByRole('button', { name: 'Remove annotation 2', exact: true }).click();
    expect((await currentTemplate(page))._annotations).toEqual({ note: { '@value': 'Reviewed' } });
  });
}

test('invalid annotations remain editable across tabs and block saving without changing stored annotations', async ({
  page,
}) => {
  const designer = await openDesigner(page);
  const card = designer.locator('app-field-card').first();
  await openSettings(card, 'Annotations');
  const editor = card.locator('app-annotations-editor');
  await addRows(editor);
  const saved = await currentTemplate(page);
  await editor.getByRole('textbox', { name: 'Annotation name 2', exact: true }).fill('note');
  await expect(editor.getByRole('alert')).toContainText('unique');
  expect(await currentTemplate(page)).toEqual(saved);
  await card.getByRole('tab', { name: 'Display', exact: true }).click();
  await card.getByRole('tab', { name: 'Annotations', exact: true }).click();
  await expect(editor.getByRole('textbox', { name: 'Annotation name 2', exact: true })).toHaveValue('note');
  const report = await page.evaluate(() =>
    (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).validate(),
  );
  expect(report.canSave).toBe(false);
  expect(report.issues).toContainEqual(expect.objectContaining({ tab: 'Annotations', setting: 'annotations' }));
  await editor.getByRole('textbox', { name: 'Annotation name 2', exact: true }).fill('source');
  await editor.getByRole('textbox', { name: 'Annotation value 2', exact: true }).fill('invalid');
  await expect(editor.getByRole('alert')).toContainText('absolute');
  await editor.getByRole('button', { name: 'Remove annotation 2', exact: true }).click();
  await expect(editor.getByRole('alert')).toHaveCount(0);
});
