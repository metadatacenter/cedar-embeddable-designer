import { test, expect } from '@playwright/test';
import { newContainer, buildContainer, templateToJson } from '../../src/app/core/model/cedar-template';
import { fieldNode, newNodeId } from '../../src/app/core/model/container-draft';
import { openDesigner, applyPreset, currentTemplate } from './support';

function artifact(kind: 'template' | 'element', nested: boolean, last: 'field' | 'element' = 'field') {
  const root = newContainer(kind);
  root.name = 'Study';
  const parent = nested ? newContainer('element') : root;
  if (nested) {
    parent.name = 'Section';
    root.children = [{ kind: 'element', id: parent.id, definition: parent, placement: { allowMultiple: false } }];
  }
  if (last === 'field')
    parent.children = [
      fieldNode({
        id: newNodeId(),
        name: 'Value',
        type: 'text',
        status: 'optional',
        options: [],
        defaultValue: { kind: 'none' },
        allowMultiple: false,
      }),
    ];
  else {
    const definition = newContainer('element');
    definition.name = 'Last element';
    parent.children = [{ kind: 'element', id: definition.id, definition, placement: { allowMultiple: false } }];
  }
  return templateToJson(buildContainer(root));
}

for (const kind of ['template', 'element'] as const)
  for (const nested of [false, true])
    for (const last of ['field', 'element'] as const)
      for (const width of [1280, 375]) {
        test(`${kind}, nested=${nested}, last=${last}, width=${width}: empty insertion remains visible`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height: 1000 });
          const designer = await openDesigner(page);
          await applyPreset(page, 'modular');
          await designer.evaluate((el: any, value) => el.loadArtifact(value), artifact(kind, nested, last));
          await expect(designer.locator('app-field-card')).toHaveCount(last === 'field' ? 1 : 0);
          const parent = designer.locator('app-container-editor').nth(nested ? 1 : 0);
          if (last === 'field') await parent.getByRole('button', { name: 'Delete field', exact: true }).click();
          else await parent.getByRole('button', { name: 'Delete element Last element', exact: true }).click();
          const section = parent.locator(':scope > .container-content > .add-field-section');
          const actions = section.locator('app-insertion-actions');
          await page.mouse.move(0, 0);
          await expect(actions).toHaveCSS('opacity', '1');
          await actions.hover();
          await page.mouse.move(0, 0);
          await expect(actions).toHaveCSS('opacity', '1');
          const spacing = await section.evaluate((el) => {
            const box = el.getBoundingClientRect(),
              pills = el.querySelector('app-insertion-actions')!.getBoundingClientRect();
            return { above: pills.top - box.top, below: box.bottom - pills.bottom };
          });
          expect(spacing.above).toBe(8);
          expect(spacing.below).toBe(8);
          await designer.evaluate((el: any) => el.loadArtifact(el.currentArtifact));
          await expect(actions).toHaveCSS('opacity', '1');
          await actions.getByRole('button', { name: 'Add field', exact: true }).click();
          await parent.getByRole('button', { name: 'Text', exact: true }).click();
          await expect(parent.locator('app-field-card')).toHaveCount(1);
          await parent.getByRole('button', { name: 'Delete field', exact: true }).click();
          await page.mouse.move(0, 0);
          await expect(actions).toHaveCSS('opacity', '1');
          await designer.evaluate((el: any) => {
            el.readOnly = true;
          });
          await expect(section).toHaveCount(0);
        });
      }

for (const kind of ['template', 'element'] as const)
  for (const nested of [false, true]) {
    test(`${kind}, nested=${nested}: adopting a save preserves open tabs and resets dirty state`, async ({ page }) => {
      const designer = await openDesigner(page);
      await applyPreset(page, 'modular');
      await designer.evaluate((el: any, value) => el.loadArtifact(value), artifact(kind, nested));
      const card = designer.locator('app-field-card');
      await expect(card).toHaveCount(1);
      await card.locator('.settings-toggle').click();
      await card.getByRole('tab', { name: 'Metadata', exact: true }).click();
      await card.getByRole('textbox', { name: 'Field display name', exact: true }).fill('Edited value');
      const saved = await currentTemplate(page);
      saved['@id'] =
        'https://repo.metadatacenter.org/' + (kind === 'template' ? 'templates/' : 'template-elements/') + 'saved';
      saved['pav:version'] = '0.0.2';
      await designer.evaluate((el: any, value) => el.loadArtifact(value, { preserveView: true }), saved);
      await expect(card.getByRole('tab', { name: 'Metadata', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(card.getByRole('tabpanel', { name: 'Metadata', exact: true })).toBeVisible();
      expect(await designer.evaluate((el: any) => el.isDirty)).toBe(false);
      expect((await currentTemplate(page))['@id']).toBe(saved['@id']);
      await card.getByRole('textbox', { name: 'Field display name', exact: true }).fill('Another edit');
      expect(await designer.evaluate((el: any) => el.isDirty)).toBe(true);
      // Ordinary navigation to a different document still resets the field settings.
      await designer.evaluate((el: any, value) => el.loadArtifact(value), saved);
      await expect(card.getByRole('tabpanel', { name: 'Metadata', exact: true })).toBeHidden();
    });
  }

test('empty containers also offer pills with the library sidebar selected', async ({ page }) => {
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await designer.locator('.user-menu-container button').first().click();
  await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
  await designer.getByRole('radio', { name: /Library Sidebar/ }).check();
  await designer.getByRole('button', { name: 'Done', exact: true }).click();
  await designer.evaluate((el: any) => el.newArtifact('element'));
  await expect(designer.locator('.bottom-insert-zone app-insertion-actions')).toHaveCSS('opacity', '1');
  await designer.locator('.bottom-insert-zone').getByRole('button', { name: 'Add field', exact: true }).click();
  await designer.locator('.add-field-section').getByRole('heading', { name: 'Choose field', exact: true }).waitFor();
});

test('standalone field save adoption preserves the selected settings tab', async ({ page }) => {
  await page.goto('/field-host.html');
  await page.waitForFunction(() => typeof (document.getElementById('field') as any)?.newArtifact === 'function');
  const designer = page.locator('#field');
  await designer.evaluate((el: any) => el.newArtifact('text'));
  await designer.getByRole('textbox', { name: 'Field display name', exact: true }).fill('Value');
  await designer.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await designer.evaluate((el: any) => {
    const saved = el.currentArtifact;
    saved['@id'] = 'https://repo.metadatacenter.org/template-fields/saved';
    el.loadArtifact(saved, { preserveView: true });
  });
  await expect(designer.getByRole('tab', { name: 'Metadata', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(await designer.evaluate((el: any) => el.isDirty)).toBe(false);
});
