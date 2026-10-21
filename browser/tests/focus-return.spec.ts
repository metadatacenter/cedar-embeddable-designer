import { Locator, Page, expect, test } from '@playwright/test';
import {
  DESIGNER,
  addElementFixture,
  applyPreset,
  clickCentred,
  focusedControl,
  nestFixtureFields,
  openDesigner,
  openSettings,
} from './support';

/**
 * Where focus lands after each action, so that a keyboard author is never dropped at the top
 * of the page.
 *
 * An action that removes the focused control moves focus to the nearest useful one: a deleted
 * card's next sibling, else its previous one, else its container's Add field. Closing a dialog
 * or a menu returns focus to the control that opened it. Each test performs its action from
 * the keyboard and names the control that must hold focus afterwards.
 */

/** A card's focusable surface: the group the arrow keys move between. */
const card = (scope: Locator, name: string) => scope.getByRole('group', { name, exact: true });

test.describe('deleting', () => {
  test('a field gives focus to the next card', async ({ page }) => {
    const designer = await openDesigner(page);
    await card(designer, 'Category').getByRole('button', { name: 'Delete field' }).focus();
    await page.keyboard.press('Enter');
    await expect(card(designer, 'Publication Date')).toBeFocused();
  });

  test('the last field gives focus to the previous card', async ({ page }) => {
    const designer = await openDesigner(page);
    await card(designer, 'Publication Date').getByRole('button', { name: 'Delete field' }).focus();
    await page.keyboard.press('Enter');
    await expect(card(designer, 'Category')).toBeFocused();
  });

  test("an element's only field gives focus to that element's Add field", async ({ page }) => {
    const designer = await openDesigner(page);
    await applyPreset(page, 'modular');
    await addElementFixture(page);
    await nestFixtureFields(page, ['Element']);
    const element = card(designer, 'Element');
    await card(element, 'Title').getByRole('button', { name: 'Delete field' }).focus();
    await page.keyboard.press('Enter');
    await expect(element.getByRole('button', { name: 'Add field', exact: true })).toBeFocused();
  });

  test('an element through its dialog gives focus to the next card', async ({ page }) => {
    const designer = await openDesigner(page);
    await applyPreset(page, 'modular');
    await addElementFixture(page);
    await nestFixtureFields(page, ['Element']);
    // Put the element first, so the card after it is a field.
    await page.evaluate(() => {
      const d = document.querySelector('cedar-embeddable-designer') as unknown as {
        currentTemplate: { _ui: { order: string[] } };
        template: object;
      };
      const template = structuredClone(d.currentTemplate);
      template._ui.order = ['Element', ...template._ui.order.filter((key) => key !== 'Element')];
      d.template = template;
    });
    const remove = designer.getByRole('button', { name: 'Delete element Element', exact: true });
    await remove.focus();
    await page.keyboard.press('Enter');
    const dialog = designer.getByRole('dialog', { name: 'Delete element?' });
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(card(designer, 'Category')).toBeFocused();
  });

  test('an empty element gives focus to the previous card', async ({ page }) => {
    const designer = await openDesigner(page);
    await applyPreset(page, 'modular');
    await addElementFixture(page);
    await designer.getByRole('button', { name: 'Delete element Element', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(card(designer, 'Publication Date')).toBeFocused();
  });

  test("the delete dialog's Escape returns focus to the delete button", async ({ page }) => {
    const designer = await openDesigner(page);
    await applyPreset(page, 'modular');
    await addElementFixture(page);
    await nestFixtureFields(page, ['Element']);
    const remove = designer.getByRole('button', { name: 'Delete element Element', exact: true });
    await remove.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(remove).toBeFocused();
  });
});

test.describe('adding', () => {
  test('a field from the palette gives focus to its name', async ({ page }) => {
    const designer = await openDesigner(page);
    await designer.getByRole('button', { name: 'Add field', exact: true }).focus();
    await page.keyboard.press('Enter');
    await designer.getByRole('button', { name: 'Text', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(designer.getByRole('textbox', { name: 'Enter field name' }).last()).toBeFocused();
  });

  test('an import from the child picker gives focus to the first imported card', async ({ page }) => {
    const designer = await openDesigner(page);
    await applyPreset(page, 'modular');
    await addElementFixture(page);
    await expect(card(designer, 'Element')).toBeFocused();
  });

  test("the child picker's Escape returns focus to Import", async ({ page }) => {
    const designer = await openDesigner(page);
    await applyPreset(page, 'modular');
    const open = designer.getByRole('button', { name: 'Import fields and elements', exact: true }).last();
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(open).toBeFocused();
  });

  for (const [how, close] of [
    ['Escape', (page: Page) => page.keyboard.press('Escape')],
    [
      'its Close button',
      (page: Page) => page.locator(DESIGNER).getByRole('button', { name: 'Close field picker' }).click(),
    ],
  ] as const)
    test(`closing the palette with ${how} returns focus to Add field`, async ({ page }) => {
      const designer = await openDesigner(page);
      const add = designer.getByRole('button', { name: 'Add field', exact: true });
      await add.focus();
      await page.keyboard.press('Enter');
      await expect(designer.locator('app-field-type-picker')).toBeVisible();
      await page.keyboard.press('Tab');
      await close(page);
      await expect(designer.locator('app-field-type-picker')).toHaveCount(0);
      await expect(add).toBeFocused();
    });
});

/** A controlled-terms field named Disease, its settings open, with the stub picker loaded. */
async function controlledTermsField(page: Page): Promise<Locator> {
  const designer = await openDesigner(page, '?picker=stub');
  await applyPreset(page, 'semantic');
  await designer.getByRole('button', { name: /^Add field$/ }).click();
  await designer.getByRole('button', { name: 'Controlled Terms', exact: true }).click();
  const field = designer.locator('app-field-card').filter({ has: page.locator('app-controlled-term-config') });
  await field.getByRole('textbox', { name: 'Enter field name', exact: true }).fill('Disease');
  await openSettings(field);
  return field;
}

/** Make every term check fail, so the field's default no longer fits a changed constraint set. */
async function rejectEveryTerm(page: Page): Promise<void> {
  await page.route('**/fake-terminology/bioportal/validate-term', (route) =>
    // The answer names the term it was asked about, as the terminology server's does.
    route.fulfill({
      json: {
        iri: route.request().postDataJSON().iri,
        status: 'failed',
        code: 'controlledTermMembership',
        message: 'Outside.',
      },
    }),
  );
}

/** Give the Disease field an IRI default, which the next changed constraint set must admit. */
async function giveDefault(page: Page): Promise<void> {
  await page.evaluate(() => {
    const d = document.querySelector('cedar-embeddable-designer') as unknown as {
      currentTemplate: { properties: Record<string, { items?: object; _valueConstraints?: object }> };
      template: object;
    };
    const template = structuredClone(d.currentTemplate);
    const property = template.properties['Disease'];
    const field = (property.items ?? property) as { _valueConstraints: Record<string, unknown> };
    field._valueConstraints['defaultValue'] = { termUri: 'urn:cancer', 'rdfs:label': 'Cancer' };
    d.template = template;
  });
}

test.describe('the constraint dialog', () => {
  test('an accepted Apply returns focus to Edit', async ({ page }) => {
    const field = await controlledTermsField(page);
    const edit = field.getByRole('button', { name: 'Edit controlled-term constraints' });
    await edit.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => focusedControl(page)).toBe('dialog "Controlled-term constraints"');
    await page.locator(DESIGNER).locator('#stub-pick').focus();
    await page.keyboard.press('Enter');
    await expect(edit).toBeFocused();
  });

  test('a rejected Apply keeps focus in the dialog, and Clear default and apply returns it to Edit', async ({
    page,
  }) => {
    const field = await controlledTermsField(page);
    const designer = page.locator(DESIGNER);
    await clickCentred(field.getByRole('button', { name: 'Edit controlled-term constraints' }));
    await designer.locator('#stub-pick').click();
    await rejectEveryTerm(page);
    await giveDefault(page);
    const reopened = designer.locator('app-field-card').filter({ has: page.locator('app-controlled-term-config') });
    await openSettings(reopened);
    const edit = reopened.getByRole('button', { name: 'Edit controlled-term constraints' });
    await edit.focus();
    await page.keyboard.press('Enter');
    const pick = designer.locator('#stub-pick');
    await pick.focus();
    await page.keyboard.press('Enter');
    const clear = designer.getByRole('button', { name: 'Clear default and apply constraints' });
    await expect(clear).toBeVisible();
    await expect(pick).toBeFocused();
    await clear.focus();
    await page.keyboard.press('Enter');
    await expect(edit).toBeFocused();
  });

  test('Escape closes it and returns focus to Edit', async ({ page }) => {
    const field = await controlledTermsField(page);
    const edit = field.getByRole('button', { name: 'Edit controlled-term constraints' });
    await edit.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => focusedControl(page)).toBe('dialog "Controlled-term constraints"');
    await page.keyboard.press('Escape');
    await expect(page.locator(DESIGNER).locator('#stub-pick')).toHaveCount(0);
    await expect(edit).toBeFocused();
  });
});

test.describe('the default-term dialog', () => {
  /** The Disease field with one constraint, so its default can be a term. */
  async function withConstraint(page: Page): Promise<Locator> {
    const field = await controlledTermsField(page);
    await clickCentred(field.getByRole('button', { name: 'Edit controlled-term constraints' }));
    await page.locator(DESIGNER).locator('#stub-pick').click();
    await openSettings(field);
    return field;
  }

  test('choosing a term returns focus to Edit default term', async ({ page }) => {
    const field = await withConstraint(page);
    const edit = field.getByRole('button', { name: 'Edit default term' });
    await edit.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => focusedControl(page)).toBe('dialog "Choose default term"');
    await page.locator(DESIGNER).locator('#stub-pick').focus();
    await page.keyboard.press('Enter');
    await expect(edit).toBeFocused();
  });

  test('a rejected term keeps focus in the dialog, and Escape returns it to Edit default term', async ({ page }) => {
    const field = await withConstraint(page);
    await rejectEveryTerm(page);
    const edit = field.getByRole('button', { name: 'Edit default term' });
    await edit.focus();
    await page.keyboard.press('Enter');
    const pick = page.locator(DESIGNER).locator('#stub-pick');
    await pick.focus();
    await page.keyboard.press('Enter');
    await expect(field.getByRole('alert').filter({ hasText: 'not permitted' }).first()).toBeVisible();
    await expect(pick).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(pick).toHaveCount(0);
    await expect(edit).toBeFocused();
  });
});

test.describe('the user menu and its dialogs', () => {
  test('Escape closes the menu and returns focus to its button', async ({ page }) => {
    const designer = await openDesigner(page);
    const menu = designer.getByRole('button', { name: 'User Menu' });
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(designer.getByRole('button', { name: 'Preferences' })).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(designer.getByRole('button', { name: 'Preferences' })).toHaveCount(0);
    await expect(menu).toBeFocused();
  });

  for (const [dialog, title] of [
    ['Preferences', 'User Preferences'],
    ['Define Presets', 'Define Presets'],
  ] as const)
    for (const [how, close] of [
      ['Escape', (page: Page) => page.keyboard.press('Escape')],
      ['Done', (page: Page) => page.locator(DESIGNER).getByRole('button', { name: 'Done' }).click()],
      [
        'Close',
        (page: Page) => page.locator(DESIGNER).getByRole('dialog').getByRole('button', { name: 'Close' }).click(),
      ],
    ] as const)
      test(`${dialog} opens on itself, and ${how} returns focus to the user menu`, async ({ page }) => {
        const designer = await openDesigner(page);
        const menu = designer.getByRole('button', { name: 'User Menu' });
        await menu.focus();
        await page.keyboard.press('Enter');
        await designer.getByRole('button', { name: dialog }).focus();
        await page.keyboard.press('Enter');
        await expect.poll(() => focusedControl(page)).toBe(`dialog "${title}"`);
        await close(page);
        await expect(designer.getByRole('dialog', { name: title })).toHaveCount(0);
        await expect(menu).toBeFocused();
      });
});

test.describe('controls that stay', () => {
  test('collapsing an element, opening settings and opening the preview keep focus on their buttons', async ({
    page,
  }) => {
    const designer = await openDesigner(page, '?cee=stub');
    await applyPreset(page, 'modular');
    await addElementFixture(page);
    await nestFixtureFields(page, ['Element']);
    const settings = card(designer, 'Title').getByRole('button', { name: 'Expand field settings' });
    await settings.focus();
    await page.keyboard.press('Enter');
    await expect(card(designer, 'Title').getByRole('button', { name: 'Collapse field settings' })).toBeFocused();
    // The Overview has a toggle of the same name, so the card's own is found inside the card.
    const element = card(designer, 'Element');
    await element.getByRole('button', { name: 'Collapse Element', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(element.getByRole('button', { name: 'Expand Element', exact: true })).toBeFocused();
    await designer.getByRole('button', { name: 'Open Preview' }).focus();
    await page.keyboard.press('Enter');
    await expect(designer.getByRole('button', { name: 'Close Preview' })).toBeFocused();
  });

  test("moving a child in the Overview keeps focus on that child's handle", async ({ page }) => {
    const designer = await openDesigner(page);
    const handle = designer.getByRole('button', { name: 'Reorder Title', exact: true });
    await handle.focus();
    await page.keyboard.press('ArrowDown');
    await expect(
      designer
        .locator('app-container-outline')
        .getByRole('button', { name: /^Reorder / })
        .nth(1),
    ).toHaveAccessibleName('Reorder Title');
    await expect(handle).toBeFocused();
  });
});

test.describe('the library sidebar', () => {
  test('collapsing it gives focus to Expand sidebar, and expanding it gives focus back to Collapse sidebar', async ({
    page,
  }) => {
    const designer = await openDesigner(page);
    await designer.getByRole('button', { name: 'User Menu' }).click();
    await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
    await designer.getByRole('radio', { name: /Library Sidebar/ }).check();
    await designer.getByRole('button', { name: 'Done', exact: true }).click();
    await designer.getByRole('button', { name: 'Collapse sidebar' }).focus();
    await page.keyboard.press('Enter');
    await expect(designer.getByRole('button', { name: 'Expand sidebar' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(designer.getByRole('button', { name: 'Collapse sidebar' })).toBeFocused();
  });
});

test.describe('the types list', () => {
  const remove = (settings: Locator, iri: string) =>
    settings.getByRole('button', { name: `Remove type ${iri}`, exact: true });
  /** The template's Metadata tab with three types added by hand. */
  async function withTypes(page: Page, picker = ''): Promise<Locator> {
    const designer = await openDesigner(page, picker);
    await designer.getByRole('button', { name: 'Expand template settings', exact: true }).click();
    const settings = designer.locator('app-container-settings').first();
    await clickCentred(settings.getByRole('tab', { name: 'Metadata', exact: true }));
    for (const iri of ['urn:one', 'urn:two', 'urn:three']) {
      await settings.getByRole('button', { name: 'Enter IRI manually', exact: true }).click();
      await settings.getByRole('textbox', { name: 'IRI', exact: true }).fill(iri);
      await settings.getByRole('textbox', { name: 'IRI', exact: true }).press('Enter');
      // The list renders the type before the next one is added, as it does between a person's keys.
      await expect(remove(settings, iri)).toBeVisible();
    }
    return settings;
  }

  test("removing a type gives focus to the next type's Remove, else the previous one's, else Add types", async ({
    page,
  }) => {
    const settings = await withTypes(page, '?picker=stub');
    await remove(settings, 'urn:two').focus();
    await page.keyboard.press('Enter');
    await expect(remove(settings, 'urn:three')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(remove(settings, 'urn:one')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(settings.getByRole('button', { name: 'Add types', exact: true })).toBeFocused();
  });

  test('without vocabulary search, removing the last type gives focus to Enter IRI manually', async ({ page }) => {
    const settings = await withTypes(page);
    for (const iri of ['urn:one', 'urn:two', 'urn:three']) {
      await remove(settings, iri).focus();
      await page.keyboard.press('Enter');
      await expect(remove(settings, iri)).toHaveCount(0);
    }
    await expect(settings.getByRole('button', { name: 'Enter IRI manually', exact: true })).toBeFocused();
  });
});
