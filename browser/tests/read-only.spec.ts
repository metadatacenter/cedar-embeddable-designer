import { test, expect, Locator } from '@playwright/test';
import { FIELD_TYPES } from '../../src/app/core/models/types';
import { CedarEmbeddableFieldDesignerElement } from '../../src/app/ced-public-api';
import { openDesigner, applyPreset, addElementFixture, nestFixtureFields, currentTemplate } from './support';

async function expectInspectionOnly(scope: Locator) {
  for (const control of await scope.locator('input:visible, textarea:visible, select:visible').all()) {
    expect(await control.evaluate((node: HTMLInputElement) => node.matches(':disabled') || node.readOnly)).toBe(true);
  }
  for (const action of await scope.locator('button:visible:not([role="tab"]):not(.settings-toggle)').all()) {
    await expect(action).toBeDisabled();
  }
}
async function inspectTabs(scope: Locator) {
  const toggle = scope.locator('.settings-toggle').first();
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  const tabs = scope.getByRole('tab');
  for (const tab of await tabs.all()) {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expectInspectionOnly(scope.getByRole('tabpanel'));
  }
  await tabs.first().focus();
  await tabs.first().press('End');
  await expect(tabs.last()).toBeFocused();
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
}

for (const type of Object.keys(FIELD_TYPES))
  for (const mode of ['host', 'published'] as const) {
    test(`standalone ${type} supports inspection only (${mode})`, async ({ page }) => {
      await page.goto('/field-host.html');
      await page.waitForFunction(
        () =>
          typeof (document.getElementById('field') as CedarEmbeddableFieldDesignerElement)?.newArtifact === 'function',
      );
      await page.evaluate((type) => (document.getElementById('field') as any).newArtifact(type), type);
      const field = page.locator('#field');
      await field.getByRole('textbox', { name: 'Field display name', exact: true }).fill(`Read-only ${type}`);
      await page.evaluate((mode) => {
        const editor = document.getElementById('field') as CedarEmbeddableFieldDesignerElement;
        const artifact = editor.currentArtifact!;
        if (mode === 'published')
          ((artifact.type === 'array' ? artifact.items : artifact) as any)['bibo:status'] = 'bibo:published';
        editor.loadArtifact(artifact);
        editor.readOnly = mode === 'host';
      }, mode);
      const before = await field.evaluate((el: any) => el.currentArtifact);
      await expect(field.getByRole('textbox', { name: 'Field display name', exact: true })).toBeDisabled();
      await inspectTabs(field);
      await expect(field.locator('.field-name')).toHaveCSS('opacity', '1');
      expect(
        await field.evaluate((el: any) => ({ artifact: el.currentArtifact, dirty: el.isDirty, canSave: el.canSave })),
      ).toEqual({ artifact: before, dirty: false, canSave: false });
      await field.evaluate((el: any) => {
        el.readOnly = false;
      });
      if (mode === 'published') await expect(field.locator('.field-name')).toBeDisabled();
      else await expect(field.locator('.field-name')).toBeEnabled();
    });
  }

for (const mode of ['host', 'published'] as const)
  for (const width of [1280, 375])
    for (const kind of ['template', 'element'] as const) {
      test(`${kind} ${mode} read-only navigation and nested controls at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        const designer = await openDesigner(page, '?cee=stub&picker=stub');
        await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Read-only study');
        await applyPreset(page, 'modular');
        await addElementFixture(page);
        await nestFixtureFields(page, ['Element']);
        if (kind === 'element') {
          const artifact = (await currentTemplate(page)).properties as any;
          await designer.evaluate((el: any, value) => {
            el.artifact = value;
          }, artifact.Element);
        }
        await designer.evaluate((el: any, mode) => {
          if (mode === 'published') {
            const artifact = el.currentArtifact;
            artifact['bibo:status'] = 'bibo:published';
            el.loadArtifact(artifact);
          }
          el.readOnly = mode === 'host';
        }, mode);
        const before = await currentTemplate(page);
        const root = designer.locator('app-container-editor').first();
        const rootSettings = root.locator(':scope > .template-header-card > app-container-settings');
        await expect(root.locator(':scope > .template-header-card input').first()).toBeDisabled();
        await inspectTabs(rootSettings);
        if (kind === 'template') {
          await expect(designer.locator('.element-type-label')).toBeVisible();
          const nested = designer.locator('app-element-card').first();
          await inspectTabs(nested);
          if (width === 1280) {
            const outline = designer.locator('app-container-outline').first();
            await outline.getByRole('button', { name: 'Collapse Element', exact: true }).click();
            await outline.getByRole('button', { name: 'Expand Element', exact: true }).click();
            await outline.locator('.select-node').filter({ hasText: 'Title' }).click();
          }
        }
        const card = designer.locator('app-field-card').first();
        await inspectTabs(card);
        await expect(card.getByRole('button', { name: 'Delete field', exact: true })).toBeDisabled();
        await expect(designer.locator('app-insertion-actions')).toHaveCount(0);
        for (const handle of await designer.locator('.outline-drag-handle').all()) await expect(handle).toBeDisabled();
        await designer.getByRole('button', { name: 'Open Preview', exact: true }).click();
        const preview = designer.locator('app-cee-preview');
        await expect(preview).toBeVisible();
        await expect(preview.getByRole('combobox', { name: 'Preview mode' })).toHaveCount(0);
        await expect
          .poll(() => page.evaluate(() => (window as any).__ceeMounts.at(-1)?.config.readOnlyMode))
          .toBe(true);
        await preview.locator('button').click();
        if (width === 1280) {
          await designer.getByRole('button', { name: 'Close Overview', exact: true }).first().click();
          await designer.getByRole('button', { name: 'Open Overview', exact: true }).click();
        }
        expect(await currentTemplate(page)).toEqual(before);
        expect(await designer.evaluate((el: any) => el.isDirty)).toBe(false);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `/tmp/ced-read-only-${kind}-${width}.png` });
      });
    }

test('read-only transition closes editing dialogs and removes insertion UI', async ({ page }) => {
  const designer = await openDesigner(page, '?picker=stub');
  const settings = designer.locator('app-container-settings');
  await settings.locator('.settings-toggle').click();
  await settings.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await settings.getByRole('button', { name: 'Add types', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await designer.evaluate((el: any) => {
    el.readOnly = true;
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(settings.getByRole('button', { name: 'Add types', exact: true })).toHaveCount(0);
  await designer.evaluate((el: any) => {
    el.readOnly = false;
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(settings.getByRole('button', { name: 'Add types', exact: true })).toBeEnabled();
});

test('entering read-only replaces an editable preview and keeps navigation quiet', async ({ page }) => {
  const designer = await openDesigner(page, '?cee=stub');
  await designer.getByRole('button', { name: 'Open Preview', exact: true }).click();
  const preview = designer.locator('app-cee-preview');
  await preview.getByRole('combobox', { name: 'Preview mode' }).selectOption('editable');
  await expect.poll(() => page.evaluate(() => (window as any).__ceeMounts.at(-1)?.config.readOnlyMode)).toBe(false);
  await designer.evaluate((el: any) => {
    el.readOnly = true;
  });
  await expect(preview.getByRole('combobox')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__ceeMounts.at(-1)?.config.readOnlyMode)).toBe(true);
  const before = await page.evaluate(() => (window as any).__events.length);
  const card = designer.locator('app-field-card').first();
  await inspectTabs(card);
  await designer.locator('.field-drag-container').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(designer.locator('.field-drag-container').nth(1)).toBeFocused();
  expect(await page.evaluate(() => (window as any).__events.length)).toBe(before);
});

test('host document replacement works while read-only without granting editing access', async ({ page }) => {
  await page.goto('/field-host.html');
  await page.waitForFunction(() => typeof (document.getElementById('field') as any)?.newArtifact === 'function');
  const field = page.locator('#field');
  await field.evaluate((el: any) => {
    el.readOnly = true;
    el.newArtifact('number');
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(field.getByRole('textbox', { name: 'Field display name', exact: true })).toBeDisabled();
  await field.getByRole('tab', { name: 'Constraints', exact: true }).click();
  await expect(field.locator('select[name="numericType"]')).toBeDisabled();
  expect(
    await field.evaluate((el: any) => ({ readOnly: el.readOnly, dirty: el.isDirty, canSave: el.canSave })),
  ).toEqual({ readOnly: true, dirty: false, canSave: false });
});
