import { expect, test, type Locator, type Page } from '@playwright/test';
import type { CedPreferences, CedPreferencesInput } from '../../src/app/ced-public-api';
import { DESIGNER, addElementFixture, currentTemplate, focusedControl, openDesigner } from './support';

/**
 * Preferences that outlast the element, which only a host page can show.
 *
 * The designer keeps an author's preferences in memory. A host stores what `preferencesChange`
 * carries and assigns it to `preferences` on the next page. Each test here is one half of that
 * exchange as a host meets it: what it is told and when, what a stored state restores on a page
 * that never saw the author choose it, and what a preference may not touch, which is the document.
 *
 * The unit suite pins how a stored value is read. These run the shipped bundle, because the event
 * leaves through a root effect and a custom element, and neither exists in a unit test.
 */

/** A page as a host first finds it, in the default preferences and with no preset applied. */
async function openFresh(page: Page): Promise<Locator> {
  await page.goto('/host.html');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __ready?: boolean }).__ready === true), { timeout: 30_000 })
    .toBeTruthy();
  const designer = page.locator(DESIGNER);
  await expect(designer.locator('[id^=field-card-]').first()).toBeVisible();
  return designer;
}

/** Every state the host page has been told of, in order. */
const heard = (page: Page): Promise<CedPreferences[]> =>
  page.evaluate(() => (window as unknown as { __preferences: CedPreferences[] }).__preferences);

/** The state the element holds, read as a host reads it. */
const held = (page: Page): Promise<CedPreferences> =>
  page.evaluate(
    (tag) => (document.querySelector(tag) as unknown as { preferences: CedPreferences }).preferences,
    DESIGNER,
  );

/** Assign a state as a host does, and report whether the assignment threw. */
const supply = (page: Page, value: unknown): Promise<boolean> =>
  page.evaluate(
    ([tag, preferences]) => {
      try {
        (document.querySelector(tag as string) as unknown as { preferences: unknown }).preferences = preferences;
        return false;
      } catch {
        return true;
      }
    },
    [DESIGNER, value] as const,
  );

/** Two frames, which is longer than the effect that announces a change takes to run. */
const settle = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

async function openUserDialog(page: Page, item: 'Preferences' | 'Define Presets'): Promise<Locator> {
  const designer = page.locator(DESIGNER);
  await designer.locator('.user-menu-container button').first().click();
  await designer.getByRole('button', { name: item, exact: true }).click();
  const dialog = designer.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeUserDialog(page: Page): Promise<void> {
  await page.locator(DESIGNER).getByRole('button', { name: 'Done', exact: true }).click();
  // Closing returns focus to the user menu's button on the next render.
  await expect.poll(() => focusedControl(page)).toBe('button "User Menu"');
}

/** The field types the picker beside the insertion point offers. */
async function offeredTypes(page: Page): Promise<string[]> {
  const designer = page.locator(DESIGNER);
  await designer.getByRole('button', { name: 'Add field', exact: true }).click();
  const palette = designer.locator('app-field-type-picker');
  await expect(palette).toBeVisible();
  await expect(palette.locator('.field-item-label').first()).toBeVisible();
  const types = await palette.locator('.field-item-label').allTextContents();
  // Safari leaves a clicked button unfocused, so Escape would not reach the picker.
  await palette.locator('.btn-close').click();
  await expect(palette).toHaveCount(0);
  return types.map((type) => type.trim());
}

test('tells the host of each change the author makes, and of nothing else', async ({ page }) => {
  await openFresh(page);
  await settle(page);
  expect(await heard(page)).toEqual([]);

  // The host's own assignment is not news to it.
  expect(await supply(page, { showElements: false } satisfies CedPreferencesInput)).toBe(false);
  await settle(page);
  expect(await heard(page)).toEqual([]);
  expect((await held(page)).showElements).toBe(false);

  const preferences = await openUserDialog(page, 'Preferences');
  await preferences.getByRole('checkbox', { name: /Show "Required" checkbox/ }).uncheck();
  await expect.poll(async () => (await heard(page)).length).toBe(1);
  expect((await heard(page))[0]).toMatchObject({ showRequired: false, showElements: false });

  await preferences
    .getByRole('group', { name: 'Visible field types' })
    .getByRole('checkbox', { name: 'Email', exact: true })
    .uncheck();
  await expect.poll(async () => (await heard(page)).length).toBe(2);
  expect((await heard(page))[1].hiddenFieldTypes).toEqual(['email']);

  await preferences.getByRole('radio', { name: /Library Sidebar/ }).check();
  await expect.poll(async () => (await heard(page)).length).toBe(3);
  expect((await heard(page))[2].fieldSelectionStyle).toBe('sidebar');
  await closeUserDialog(page);

  // A redefined preset travels with the preferences, although the author's own settings stand.
  const presets = await openUserDialog(page, 'Define Presets');
  await presets.getByRole('checkbox', { name: 'Enable Elements in the basic preset', exact: true }).check();
  await expect.poll(async () => (await heard(page)).length).toBe(4);
  const last = (await heard(page))[3];
  expect(last.presets.basic.showElements).toBe(true);
  expect(last).toMatchObject({ showRequired: false, showElements: false, fieldSelectionStyle: 'sidebar' });
  await closeUserDialog(page);

  // What the host heard last is what the property reads, so storing either is the same.
  expect(await held(page)).toEqual(last);
});

test('restores on a later page what the author chose on an earlier one', async ({ page }) => {
  // `openDesigner` chooses the Basic preset through the dialog, which is the author's first change.
  await openDesigner(page);
  const preferences = await openUserDialog(page, 'Preferences');
  await preferences.getByRole('checkbox', { name: /Show "Allow multiple" checkbox/ }).uncheck();
  await preferences
    .getByRole('group', { name: 'Visible field types' })
    .getByRole('checkbox', { name: 'Email', exact: true })
    .uncheck();
  await closeUserDialog(page);
  await expect.poll(async () => (await heard(page)).at(-1)?.hiddenFieldTypes).toEqual(['email', 'controlledTerms']);
  // A host keeps the state as text, so the round trip goes through JSON here as it does there.
  const stored = JSON.stringify((await heard(page)).at(-1));

  const designer = await openFresh(page);
  expect((await held(page)).hiddenFieldTypes).toEqual([]);
  await supply(page, JSON.parse(stored));
  await settle(page);

  expect(await heard(page)).toEqual([]);
  expect(JSON.stringify(await held(page))).toBe(stored);
  const restored = await openUserDialog(page, 'Preferences');
  await expect(restored.getByRole('checkbox', { name: /Show "Allow multiple" checkbox/ })).not.toBeChecked();
  await expect(restored.getByRole('checkbox', { name: /Show "Required" checkbox/ })).toBeChecked();
  await expect(restored.getByRole('checkbox', { name: /Enable Elements/ })).not.toBeChecked();
  const types = restored.getByRole('group', { name: 'Visible field types' });
  await expect(types.getByRole('checkbox', { name: 'Email', exact: true })).not.toBeChecked();
  await expect(types.getByRole('checkbox', { name: 'Controlled Terms', exact: true })).not.toBeChecked();
  await expect(types.getByRole('checkbox', { name: 'Text', exact: true })).toBeChecked();
  await closeUserDialog(page);

  const offered = await offeredTypes(page);
  expect(offered).toContain('Text');
  expect(offered).not.toContain('Email');
  expect(offered).not.toContain('Controlled Terms');
  await expect(designer.getByRole('button', { name: 'Add element', exact: true })).toHaveCount(0);
});

/*
 * The active preset is found by comparing the preferences with each definition, and Basic is what
 * withholds elements and imports. A stored state that lost a setting or a definition would open the
 * next page in no preset, and those two actions would come back.
 */
test('opens a later page in the preset the author chose, including one they redefined', async ({ page }) => {
  await openFresh(page);
  const presets = await openUserDialog(page, 'Define Presets');
  await presets.getByRole('checkbox', { name: 'Email in the basic preset', exact: true }).uncheck();
  await closeUserDialog(page);
  const chosen = await openUserDialog(page, 'Preferences');
  await chosen.getByRole('button', { name: 'basic', exact: true }).click();
  await closeUserDialog(page);
  await expect.poll(async () => (await heard(page)).at(-1)?.hiddenFieldTypes).toEqual(['email', 'controlledTerms']);
  const stored = JSON.stringify((await heard(page)).at(-1));

  const designer = await openFresh(page);
  await expect(designer.getByRole('button', { name: 'Add element', exact: true })).toBeVisible();
  await supply(page, JSON.parse(stored));

  await expect(designer.getByRole('button', { name: 'Add element', exact: true })).toHaveCount(0);
  await expect(designer.getByRole('button', { name: 'Import fields and elements', exact: true })).toHaveCount(0);
  const restored = await openUserDialog(page, 'Preferences');
  await expect(restored.getByRole('button', { name: 'basic', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await closeUserDialog(page);
  const definitions = await openUserDialog(page, 'Define Presets');
  await expect(definitions.getByRole('checkbox', { name: 'Email in the basic preset', exact: true })).not.toBeChecked();
  await expect(definitions.getByRole('checkbox', { name: 'Email in the modular preset', exact: true })).toBeChecked();
  await closeUserDialog(page);
});

test('hides controls without changing the document, and shows them again on the defaults', async ({ page }) => {
  const designer = await openFresh(page);
  await designer.getByRole('button', { name: 'Add field', exact: true }).click();
  await designer.locator('app-field-type-picker').getByRole('button', { name: 'Email', exact: true }).click();
  await designer.getByPlaceholder('Enter field name').last().fill('Contact email');
  const fieldNames = () =>
    designer
      .getByPlaceholder('Enter field name')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  await addElementFixture(page);
  await expect.poll(async () => JSON.stringify(await currentTemplate(page))).toContain('Contact email');
  const before = await currentTemplate(page);
  expect(JSON.stringify(before)).toContain('"Element"');

  await supply(page, {
    showRequired: false,
    showAllowMultiple: false,
    showElements: false,
    hiddenFieldTypes: ['email', 'text'],
  } satisfies CedPreferencesInput);
  await settle(page);

  // The email field and the element are of kinds the designer no longer offers, and both remain.
  expect(await currentTemplate(page)).toEqual(before);
  await expect.poll(fieldNames).toContain('Contact email');
  await expect(designer.getByRole('group', { name: 'Element', exact: true })).toBeVisible();
  await expect(designer.getByRole('button', { name: 'Add element', exact: true })).toHaveCount(0);

  expect(await supply(page, null)).toBe(false);
  await expect(designer.getByRole('button', { name: 'Add element', exact: true }).first()).toBeVisible();
  expect((await held(page)).hiddenFieldTypes).toEqual([]);
  expect(await currentTemplate(page)).toEqual(before);
});

test('reports a value it cannot use instead of throwing at the host, and keeps what it had', async ({ page }) => {
  await openFresh(page);
  const warnings: string[] = [];
  page.on('console', (message) => message.type() === 'warning' && warnings.push(message.text()));
  await supply(page, { showElements: false } satisfies CedPreferencesInput);

  // Assigning a property is the host's own code, so an exception there reads as the host's fault.
  expect(await supply(page, 'basic')).toBe(false);
  await expect.poll(() => warnings.join(' ')).toContain('preferences must be an object');
  expect((await held(page)).showElements).toBe(false);

  // One unusable value costs that preference its stored value and none of the others.
  expect(await supply(page, { showElements: false, showRequired: 'no', theme: 'dark' })).toBe(false);
  await expect.poll(() => warnings.join(' ')).toContain('"showRequired"');
  expect(warnings.join(' ')).toContain('"theme"');
  expect(await held(page)).toMatchObject({ showElements: false, showRequired: true });
});
