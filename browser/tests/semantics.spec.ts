import { expect, test } from '@playwright/test';
import { applyPreset, focusedControl, openDesigner } from './support';
import type { CedarEmbeddableDesignerElement } from '../../src/app/ced-public-api';

/**
 * Structure a screen reader reads and a sighted author sees drawn: what a column of icons
 * shows, which choices belong together, which button is on, which cell heads its row and
 * whether a menu is open. WCAG 1.1.1, 1.3.1 and 4.1.2. None of it changes the screen, so the
 * visual baselines cannot see it, and axe-core passes all of it as it stood before.
 */

test("the child picker names each row's type and says which results are selected", async ({ page }) => {
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await page.evaluate(() => {
    const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
    element.childSource = {
      async search() {
        return {
          results: [
            { id: 'https://repo.metadatacenter.org/template-fields/1', name: 'Title', type: 'field' },
            { id: 'https://repo.metadatacenter.org/template-elements/2', name: 'Section', type: 'element' },
          ],
        };
      },
      async load() {
        return {};
      },
    };
  });
  await designer.getByRole('button', { name: 'Import fields and elements', exact: true }).first().click();
  const dialog = designer.getByRole('dialog', { name: 'Import Fields and Elements' });
  await dialog.getByRole('button', { name: 'Search', exact: true }).click();
  const results = dialog.getByRole('table', { name: 'Search results' });
  const title = results.getByRole('row', { name: 'Select Title', exact: true });
  const section = results.getByRole('row', { name: 'Select Section', exact: true });
  // The Type column draws an icon alone, and the icon is named by the type it shows.
  await expect(title.getByRole('cell').first().getByRole('img')).toHaveAccessibleName('Field');
  await expect(section.getByRole('cell').first().getByRole('img')).toHaveAccessibleName('Element');
  await expect(results.getByRole('img', { name: 'Selected' })).toHaveCount(0);
  await expect(title).toHaveAttribute('aria-selected', 'false');

  // A selected result draws a check beside its name, which is read as Selected.
  await title.focus();
  await page.keyboard.press('Enter');
  await expect(title.getByRole('img', { name: 'Selected', exact: true })).toBeVisible();
  await expect(title).toHaveAttribute('aria-selected', 'true');
  await expect(section.getByRole('img', { name: 'Selected' })).toHaveCount(0);
  await expect(section).toHaveAttribute('aria-selected', 'false');
  // The row stays the control: it keeps its Tab stop and its name until it is selected.
  await section.focus();
  expect(await focusedControl(page)).toBe('row "Select Section"');

  const selected = dialog.getByRole('table', { name: 'Selected items' });
  await expect(selected.getByRole('row').nth(1).getByRole('img').first()).toHaveAccessibleName('Field');
});

test('Preferences groups the selection style and says which preset is on', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).click();
  await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
  const dialog = designer.getByRole('dialog', { name: 'Preferences' });

  // The two radios are one group, named by the heading above them and described by its help.
  const group = dialog.getByRole('radiogroup', { name: 'Field selection style', exact: true });
  await expect(group).toHaveAccessibleDescription('Choose how you want to add fields to your template');
  await expect(group.getByRole('radio')).toHaveCount(2);
  await expect(group.getByRole('radio', { name: /Inline field picker/ })).toBeChecked();

  // The preset drawn as active is the one pressed, and pressing another moves the state to it.
  const preset = (name: string) => dialog.getByRole('button', { name, exact: true });
  await expect(preset('basic')).toHaveAttribute('aria-pressed', 'true');
  await expect(preset('semantic')).toHaveAttribute('aria-pressed', 'false');
  await expect(preset('modular')).toHaveAttribute('aria-pressed', 'false');
  await preset('semantic').click();
  await expect(preset('semantic')).toHaveAttribute('aria-pressed', 'true');
  await expect(preset('basic')).toHaveAttribute('aria-pressed', 'false');
  // Preferences that match no preset leave every preset unpressed, as none is drawn active.
  await dialog.getByRole('checkbox', { name: 'Phone', exact: true }).click();
  for (const name of ['basic', 'semantic', 'modular'])
    await expect(preset(name)).toHaveAttribute('aria-pressed', 'false');
});

test('Define Presets heads each row with its setting and names each table by its group', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).click();
  await designer.getByRole('button', { name: 'Define Presets' }).click();
  const dialog = designer.getByRole('dialog', { name: 'Define Presets' });
  const tables = dialog.getByRole('table');
  await expect(tables).toHaveCount(3);
  for (const [name, first] of [
    ['Field configuration options', 'Show "Required" checkbox'],
    ['Feature visibility', 'Enable Elements'],
    ['Available field types', 'Text'],
  ]) {
    const table = dialog.getByRole('table', { name, exact: true });
    await expect(table.getByRole('rowheader').first()).toHaveAccessibleName(first);
    // Every body row has exactly one header, the cell that names its setting.
    const rows = table.locator('tbody tr');
    for (const row of await rows.all()) {
      await expect(row.getByRole('rowheader')).toHaveCount(1);
      await expect(row.getByRole('cell')).toHaveCount(3);
    }
  }
});

test("the Add field palette's library menu says whether it is open and reads no arrow", async ({ page }) => {
  // The library menu appears once the author keeps a library of their own fields.
  await page.addInitScript(() =>
    localStorage.setItem(
      'ced-field-library-v1',
      JSON.stringify({ libraries: [{ id: 1, name: 'Lab fields', description: '', icon: '' }], fields: [] }),
    ),
  );
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: /^Add field$/ }).click();
  const menu = designer.locator('.btn-library-dropdown');
  await expect(menu).toHaveAccessibleName('Standard');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await expect(designer.getByPlaceholder('Search libraries...')).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await menu.click();
  await expect(designer.getByPlaceholder('Search libraries...')).toHaveCount(0);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});
