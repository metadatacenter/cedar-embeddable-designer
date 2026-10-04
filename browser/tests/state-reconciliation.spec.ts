import { expect, Page, test } from '@playwright/test';
import type { CedarEmbeddableDesignerElement } from '../../src/app/ced-public-api';
import {
  addElementFixture,
  applyPreset,
  child,
  currentTemplate,
  openDesigner,
  openPreview,
  openSettings,
} from './support';

const report = (page: Page) =>
  page.evaluate(() =>
    (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).validate(),
  );

async function named(page: Page, query = '') {
  const designer = await openDesigner(page, query);
  await designer.getByLabel('Template name', { exact: true }).fill('Study');
  return designer;
}

for (const kind of ['template', 'element'] as const) {
  for (const type of ['Multiple Choice', 'Checkboxes']) {
    test(`unfinished ${type} option in a new ${kind} becomes reachable after naming`, async ({ page }) => {
      const designer = await named(page);
      await page.evaluate(
        (kind) =>
          (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).newArtifact(kind),
        kind,
      );
      await expect(designer.locator('app-field-card')).toHaveCount(0);
      const name = designer.getByLabel(kind === 'template' ? 'Template name' : 'Element name', { exact: true });
      await name.fill('Study');
      await designer.getByRole('button', { name: 'Add field', exact: true }).click();
      await designer.getByRole('button', { name: type, exact: true }).click();
      const card = designer.locator('app-field-card');
      await expect(card.getByLabel('Field display name', { exact: true })).toBeFocused();
      await expect(designer.locator('.validation-summary')).toHaveCount(0);
      await card.getByLabel('Field display name', { exact: true }).fill('Decision');
      await name.click();
      await expect(designer.locator('.validation-summary')).toContainText('1 error — fix before saving');
      await expect(designer.locator('.outline-row.invalid')).toHaveCount(1);
      await designer.locator('.validation-summary summary').click();
      await designer.locator('.validation-summary button').click();
      const option = card.getByRole('textbox', { name: 'Option 1', exact: true });
      await expect(option).toBeFocused();
      await option.fill('Yes');
      await expect.poll(async () => (await report(page)).canSave).toBe(true);
    });
  }
}

test('rejected text bounds survive another edit and reconcile with a corrected default', async ({ page }) => {
  const designer = await named(page);
  const card = designer.locator('app-field-card').first();
  const panel = await openSettings(card);
  await panel.getByRole('textbox', { name: 'Default value', exact: true }).fill('ABC');
  await panel.getByLabel('Maximum length', { exact: true }).fill('2');
  await expect.poll(async () => (await report(page)).canSave).toBe(false);
  await openSettings(card, 'Field metadata');
  await card.locator('input[name=schemaIdentifier]').fill('Identifier');
  await openSettings(card);
  await expect(panel.getByLabel('Maximum length', { exact: true })).toHaveValue('2');
  await panel.getByRole('textbox', { name: 'Default value', exact: true }).fill('AB');
  await expect.poll(async () => (await report(page)).canSave).toBe(true);
  await expect(panel.getByLabel('Maximum length', { exact: true })).toHaveValue('2');
  expect(child(await currentTemplate(page), 'Title')._valueConstraints).toMatchObject({
    maxLength: 2,
    defaultValue: 'AB',
  });
  await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('relaxing a constraint commits the now-valid pending default', async ({ page }) => {
  const designer = await named(page);
  const panel = await openSettings(designer.locator('app-field-card').first());
  await panel.getByLabel('Maximum length', { exact: true }).fill('2');
  const value = panel.getByRole('textbox', { name: 'Default value', exact: true });
  await value.fill('ABC');
  await expect(value).toHaveAttribute('aria-invalid', 'true');
  await panel.getByLabel('Maximum length', { exact: true }).fill('3');
  await expect.poll(async () => (await report(page)).canSave).toBe(true);
  await expect(value).toHaveValue('ABC');
  await expect(value).toHaveAttribute('aria-invalid', 'false');
  expect(child(await currentTemplate(page), 'Title')._valueConstraints).toMatchObject({
    maxLength: 3,
    defaultValue: 'ABC',
  });
});

test('an element keeps its rejected occurrence input and error through a valid key edit', async ({ page }) => {
  const designer = await named(page);
  await applyPreset(page, 'modular');
  await addElementFixture(page);
  const card = designer.locator('app-element-card').last();
  await card.getByRole('button', { name: 'Expand element settings' }).click();
  await card.getByRole('tab', { name: 'Occurrences', exact: true }).click();
  const panel = card.getByRole('tabpanel', { name: 'Occurrences', exact: true });
  await panel.getByRole('checkbox').check();
  await panel.locator('input[type=number]').nth(0).fill('2');
  await panel.locator('input[type=number]').nth(1).fill('1');
  await expect.poll(async () => (await report(page)).canSave).toBe(false);
  await card.getByRole('tab', { name: 'Element metadata', exact: true }).click();
  await card.locator('input[name=deploymentName]').fill('details');
  await card.getByRole('tab', { name: 'Occurrences', exact: true }).click();
  await expect(panel.locator('input[type=number]').nth(1)).toHaveValue('1');
  await expect(card.getByRole('alert')).toContainText('minimum no greater than maximum');
  await panel.locator('input[type=number]').nth(1).fill('3');
  await expect.poll(async () => (await report(page)).canSave).toBe(true);
  const properties = (await currentTemplate(page)).properties as Record<string, { minItems: number; maxItems: number }>;
  expect(properties.details).toMatchObject({ minItems: 2, maxItems: 3 });
});

test('invalid siblings can be repaired independently while preview explicitly waits', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const designer = await named(page, '?cee=stub');
  const preview = await openPreview(page);
  await expect(preview.locator('cedar-embeddable-editor')).toBeVisible();
  const source = await currentTemplate(page);
  for (const key of ['Title', 'Publication Date']) {
    const field = child(source, key);
    field._ui = { inputType: 'textfield' };
    field._valueConstraints = { minLength: 2, maxLength: 1 };
  }
  await page.evaluate(
    (artifact) =>
      (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).loadArtifact(artifact),
    source,
  );
  await expect(preview.getByRole('status')).toContainText('Preview is unavailable');
  await expect(preview.locator('cedar-embeddable-editor')).toHaveCount(0);
  const first = await openSettings(designer.locator('app-field-card').first());
  await first.getByLabel('Maximum length', { exact: true }).fill('3');
  await expect.poll(async () => (await report(page)).issues.length).toBe(1);
  const last = await openSettings(designer.locator('app-field-card').last());
  await last.getByLabel('Maximum length', { exact: true }).fill('3');
  await expect.poll(async () => (await report(page)).canSave).toBe(true);
  await expect(preview.getByRole('status')).toHaveCount(0);
  await expect(preview.locator('cedar-embeddable-editor')).toBeVisible();
  expect(child(await currentTemplate(page), 'Title')._valueConstraints).toMatchObject({ minLength: 2, maxLength: 3 });
  expect(errors).toEqual([]);
});

test('element selection agrees between outline, card and preview', async ({ page }) => {
  const designer = await named(page, '?cee=stub');
  await applyPreset(page, 'modular');
  await addElementFixture(page);
  const preview = await openPreview(page);
  await expect(preview.locator('cedar-embeddable-editor')).toBeVisible();
  await designer.locator('.select-node').filter({ hasText: 'Title' }).first().click();
  await designer.locator('.select-node').filter({ hasText: 'Element' }).last().click();
  await expect(designer.locator('.outline-row.active .node-name')).toHaveText('Element');
  await expect(designer.locator('.field-drag-container.selected')).toHaveAttribute('aria-label', 'Element');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __ceeReveals: { location: { path: string[] } }[] }).__ceeReveals.at(-1)?.location
            .path,
      ),
    )
    .toEqual(['element']);
});

test('library rows use the same display names, unnamed labels and errors as the outline', async ({ page }) => {
  const designer = await named(page);
  await designer.locator('.user-menu-container button').first().click();
  await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
  await designer.getByRole('radio', { name: /Library Sidebar/ }).check();
  await designer.getByRole('button', { name: 'Done', exact: true }).click();
  const sidebar = designer.locator('app-field-library-sidebar');
  await designer
    .locator('app-field-card')
    .first()
    .getByLabel('Field display name', { exact: true })
    .fill('Renamed title');
  await expect(sidebar.locator('.draggable-name').first()).toHaveText('Renamed title');
  await sidebar.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(
    designer.locator('app-field-card').last().getByLabel('Field display name', { exact: true }),
  ).toBeFocused();
  await expect(sidebar.locator('.draggable-name').last()).toHaveText('Unnamed field');
  await designer.getByLabel('Template name', { exact: true }).click();
  await expect(sidebar.locator('.draggable-field-item.invalid')).toContainText('1 error');
});
