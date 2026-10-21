import { Page, expect, test } from '@playwright/test';
import {
  DESIGNER,
  addElementFixture,
  applyPreset,
  clickCentred,
  focusedControl,
  nestFixtureFields,
  openDesigner,
  openSettings,
  tabSequence,
} from './support';

/**
 * The order the keyboard visits the designer's controls, pinned surface by surface.
 *
 * Each stop names a control by its role and accessible name, as a screen reader reads it. A
 * change to a sequence changes what a keyboard author meets, so it is made here on purpose
 * rather than found later. `(page)` is focus leaving the designer for the host page, or, inside
 * a native modal dialog, for the browser's own controls before it wraps.
 */

/** Tab until focus reaches `last` again after its first stop, naming every stop on the way. */
async function tabUntil(page: Page, last: string, limit = 120): Promise<string[]> {
  const stops: string[] = [];
  while (stops.length < limit) {
    const [stop] = await tabSequence(page, 1);
    stops.push(stop);
    if (stop === last && stops.length > 1) return stops;
  }
  return stops;
}

const FIELD = (name: string) => [
  'button "Add field here"',
  `group "${name}"`,
  'textbox "Enter field name"',
  'button "Delete field"',
  'button "Expand field settings"',
];

/** The template's header, after the toolbar's Overview and Preview buttons. */
const HEADER = [
  'textbox "Template name"',
  'textbox "Version"',
  'textbox "Description"',
  'button "Collapse template"',
  'button "Expand template settings"',
];

/** The Overview of the three fields the fixture holds, then the template's header. */
const OVERVIEW_AND_HEADER = [
  'separator "Resize Overview"',
  'button "Title Required"',
  'button "Reorder Title"',
  'button "Category"',
  'button "Reorder Category"',
  'button "Publication Date"',
  'button "Reorder Publication Date"',
  ...HEADER,
];

/** Each of the fixture's cards with the insertion buttons between them, then the template's Add field. */
const CARDS = [...FIELD('Title'), ...FIELD('Category'), ...FIELD('Publication Date'), 'button "Add field"'];

/** The field types Basic offers, in the order the palette and the library sidebar list them. */
const BASIC_TYPES = [
  'Text',
  'Paragraph',
  'Multiple Choice',
  'Checkboxes',
  'List',
  'Multi-select List',
  'Temporal',
  'Email',
  'Link',
  'Phone',
  'Number',
  'Attribute Value',
  'ORCID',
  'ROR',
  'PFAS',
  'RRID',
  'PubMed',
  'NIH Grant ID',
  'DOI',
  'Image',
  'Rich Text',
  'YouTube',
  'Section Break',
  'Page Break',
];

test('a template runs from the toolbar through the Overview and header to each card', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'Close Overview' }).focus();
  expect(await tabUntil(page, '(page)')).toEqual([
    'button "User Menu"',
    'button "Open Preview"',
    ...OVERVIEW_AND_HEADER,
    ...CARDS,
    '(page)',
  ]);
});

test('the open preview follows the cards, and its mode select comes last', async ({ page }) => {
  const designer = await openDesigner(page, '?cee=stub');
  await designer.getByRole('button', { name: 'Open Preview' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('cedar-embeddable-editor')).toHaveCount(1);
  // The toggle keeps focus and now closes the panel.
  expect(await focusedControl(page)).toBe('button "Close Preview"');
  await designer.getByRole('button', { name: 'Close Overview' }).focus();
  expect(await tabUntil(page, '(page)')).toEqual([
    'button "User Menu"',
    'button "Close Preview"',
    ...OVERVIEW_AND_HEADER,
    ...CARDS,
    'combobox "Preview mode"',
    '(page)',
  ]);
});

test('a 375px host runs from the toolbar through the header to each card, with no Overview', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openDesigner(page);
  // A click on the host's heading puts the start of the Tab sequence before the designer.
  await page.locator('#host-heading').click();
  expect(await tabUntil(page, '(page)')).toEqual([
    'button "User Menu"',
    'button "Open Preview"',
    ...HEADER,
    ...CARDS,
    '(page)',
  ]);
});

/** Choose the library sidebar in Preferences, in place of the inline palette. */
async function useSidebar(page: Page): Promise<void> {
  const designer = page.locator(DESIGNER);
  await designer.getByRole('button', { name: 'User Menu' }).click();
  await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
  await designer.getByRole('radio', { name: /Library Sidebar/ }).check();
  await designer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(designer.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
}

/** A card in sidebar mode, which adds fields from the sidebar rather than between the cards. */
const SIDEBAR_FIELD = (name: string) => FIELD(name).slice(1);

test('sidebar mode runs from the toolbar through the library to the Overview and each card', async ({ page }) => {
  const designer = await openDesigner(page);
  await useSidebar(page);
  await designer.getByRole('button', { name: 'Close Overview' }).focus();
  expect(await tabUntil(page, '(page)')).toEqual([
    'button "User Menu"',
    'button "Open Preview"',
    'button "Add field"',
    'button "Collapse sidebar"',
    'button "Built-in Fields"',
    ...BASIC_TYPES.map((type) => `button "${type}"`),
    ...OVERVIEW_AND_HEADER,
    ...SIDEBAR_FIELD('Title'),
    ...SIDEBAR_FIELD('Category'),
    ...SIDEBAR_FIELD('Publication Date'),
    '(page)',
  ]);

  // Collapsed, the sidebar keeps one stop: the button that expands it again.
  await designer.getByRole('button', { name: 'Collapse sidebar' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => focusedControl(page)).toBe('button "Expand sidebar"');
  await designer.getByRole('button', { name: 'Close Overview' }).focus();
  expect(await tabUntil(page, '(page)')).toEqual([
    'button "User Menu"',
    'button "Open Preview"',
    'button "Expand sidebar"',
    ...OVERVIEW_AND_HEADER,
    ...SIDEBAR_FIELD('Title'),
    ...SIDEBAR_FIELD('Category'),
    ...SIDEBAR_FIELD('Publication Date'),
    '(page)',
  ]);
});

const SETTINGS: Record<string, string[]> = {
  Configuration: [
    'textbox "Display name"',
    'textbox "Display description"',
    'combobox "Requirement"',
    'checkbox "Hidden"',
    'checkbox "Continue previous line"',
    'checkbox "Allow multiple"',
    'textbox "Key"',
    'button "Enter IRI manually"',
  ],
  Presentation: [
    'textbox "Field name"',
    'textbox "Field description"',
    'combobox "Language"',
    'textbox "New alternate question"',
    'button "Add question"',
  ],
  Constraints: [
    'spinbutton "Minimum length"',
    'spinbutton "Maximum length"',
    'textbox "Regular expression"',
    'textbox "Default value"',
  ],
  Annotations: [
    'textbox "New annotation name"',
    'combobox "New annotation value type"',
    'textbox "New annotation value"',
    'button "Add annotation"',
    'region "Annotations"',
  ],
  Metadata: ['textbox "Identifier"'],
};

test('each settings tab runs from its tab through its panel to the collapse button', async ({ page }) => {
  const designer = await openDesigner(page);
  const card = designer.locator('[id^=field-card-]').first();
  await openSettings(card, 'Presentation');
  for (const [name, panel] of Object.entries(SETTINGS)) {
    const tab = card.getByRole('tab', { name, exact: true });
    await clickCentred(tab);
    // The panel renders on the next pass; tabbing sooner walks the one it replaces.
    await expect(card.getByRole('tabpanel', { name, exact: true })).toBeVisible();
    await tab.focus();
    expect(await tabUntil(page, 'button "Collapse field settings"', 20), name).toEqual([
      ...panel,
      'button "Collapse field settings"',
    ]);
  }
});

test('choice options are named by number, with their delete buttons', async ({ page }) => {
  const designer = await openDesigner(page);
  const card = designer.locator('[id^=field-card-]').nth(1);
  const panel = await openSettings(card);
  await panel.getByRole('textbox', { name: 'Option 1', exact: true }).focus();
  expect(await tabUntil(page, 'button "Collapse field settings"', 10)).toEqual([
    'button "Delete option 1"',
    'textbox "Option 2"',
    'button "Delete option 2"',
    'button "Add option"',
    'button "Collapse field settings"',
  ]);
});

test('a nested element runs from its header through its children to its own insertion buttons', async ({ page }) => {
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await addElementFixture(page);
  await nestFixtureFields(page, ['Element']);
  const element = designer
    .locator('.field-drag-container')
    .filter({ has: page.locator(':scope > app-container-editor') })
    .first();
  await element.focus();
  expect(await tabUntil(page, '(page)', 30)).toEqual([
    'textbox "Element display name"',
    'textbox "Version"',
    'button "Delete element Element"',
    'textbox "Description"',
    'button "Collapse Element"',
    'button "Expand element settings"',
    'button "Add field here"',
    'button "Add element here"',
    'button "Import fields and elements here"',
    'group "Title"',
    'textbox "Enter field name"',
    'button "Delete field"',
    'button "Expand field settings"',
    'button "Add field"',
    'button "Add element"',
    'button "Import fields and elements"',
    'button "Add field"',
    'button "Add element"',
    'button "Import fields and elements"',
    '(page)',
  ]);
});

test('the Add field palette follows the button that opened it', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'Add field', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(designer.locator('app-field-type-picker')).toBeVisible();
  expect(await focusedControl(page)).toBe('button "Add field"');
  expect(await tabUntil(page, '(page)', 40)).toEqual([
    'button "Close field picker"',
    ...BASIC_TYPES.map((type) => `button "${type}"`),
    '(page)',
  ]);
});

test('the user menu keeps focus on its button, and Tabbing out of it closes it', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).focus();
  await page.keyboard.press('Enter');
  await expect(designer.getByRole('button', { name: 'Preferences' })).toBeVisible();
  await expect(designer.getByRole('button', { name: 'User Menu' })).toHaveAttribute('aria-expanded', 'true');
  expect(await tabSequence(page, 3)).toEqual([
    'button "Preferences"',
    'button "Define Presets"',
    'button "Open Preview"',
  ]);
  await expect(designer.getByRole('button', { name: 'Preferences' })).toHaveCount(0);
});

test('Preferences opens on itself and keeps Tab inside it', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).focus();
  await page.keyboard.press('Enter');
  await expect(designer.getByRole('button', { name: 'Preferences' })).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect.poll(() => focusedControl(page)).toBe('dialog "User Preferences"');
  const types = [
    'Text',
    'Paragraph',
    'Multiple Choice',
    'Checkboxes',
    'List',
    'Multi-select List',
    'Temporal',
    'Email',
    'Link',
    'Phone',
    'Number',
    'Controlled Terms',
    'Attribute Value',
    'ORCID',
    'ROR',
    'PFAS',
    'RRID',
    'PubMed',
    'NIH Grant ID',
    'DOI',
    'Image',
    'Rich Text',
    'YouTube',
    'Section Break',
    'Page Break',
  ];
  const stops = await tabUntil(page, 'button "Close"', 60);
  expect(stops.slice(0, 5)).toEqual([
    'button "Close"',
    'button "basic"',
    'button "semantic"',
    'button "modular"',
    'checkbox "Show \\"Required\\" checkbox Display required/optional toggle for fields"',
  ]);
  // The rest of the panel, then Done, then back round to Close without leaving the dialog.
  expect(stops.slice(1).slice(-28)).toEqual([
    'button "Deselect All"',
    ...types.map((type) => `checkbox "${type}"`),
    'button "Done"',
    'button "Close"',
  ]);
  expect(stops.slice(1)).not.toContain('(page)');
  expect(await tabSequence(page, 1, 'Shift+Tab')).toEqual(['button "Done"']);
});

test('Define Presets names every checkbox by its row and its preset', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).click();
  await designer.getByRole('button', { name: 'Define Presets' }).click();
  await expect.poll(() => focusedControl(page)).toBe('dialog "Define Presets"');
  const stops = await tabUntil(page, 'button "Close"', 150);
  expect(stops[0]).toBe('button "Close"');
  expect(stops.slice(1, 4)).toEqual([
    'checkbox "Show \\"Required\\" checkbox in the basic preset"',
    'checkbox "Show \\"Required\\" checkbox in the semantic preset"',
    'checkbox "Show \\"Required\\" checkbox in the modular preset"',
  ]);
  const checkboxes = stops.filter((stop) => stop.startsWith('checkbox'));
  expect(checkboxes.length).toBeGreaterThan(80);
  for (const checkbox of checkboxes) expect(checkbox).toMatch(/ in the (basic|semantic|modular) preset"$/);
  expect(stops.at(-2)).toBe('button "Done"');
  expect(stops.at(-1)).toBe('button "Close"');
});

test('the child picker opens on its search box', async ({ page }) => {
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  // The fixture gives the designer a repository to search; without one the picker has no search box.
  await addElementFixture(page);
  await designer.getByRole('button', { name: 'Import fields and elements', exact: true }).last().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(() => focusedControl(page)).toBe('searchbox "Search fields and elements"');
  expect(await tabSequence(page, 5)).toEqual([
    'button "Search"',
    'button "Cancel"',
    '(page)',
    'button "Close"',
    'searchbox "Search fields and elements"',
  ]);
});

/** A controlled-terms field named Disease, its settings open, with the stub picker loaded. */
async function controlledTermsField(page: Page) {
  const designer = await openDesigner(page, '?picker=stub');
  await applyPreset(page, 'semantic');
  await designer.getByRole('button', { name: /^Add field$/ }).click();
  await designer.getByRole('button', { name: 'Controlled Terms', exact: true }).click();
  const card = designer.locator('app-field-card').filter({ has: page.locator('app-controlled-term-config') });
  await card.getByRole('textbox', { name: 'Enter field name', exact: true }).fill('Disease');
  await openSettings(card);
  return card;
}

test('the constraint and default-term dialogs open on themselves and keep Tab inside', async ({ page }) => {
  const card = await controlledTermsField(page);
  await card.getByRole('button', { name: 'Edit controlled-term constraints' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => focusedControl(page)).toBe('dialog "Controlled-term constraints"');
  expect(await tabSequence(page, 3)).toEqual(['button "Close"', 'button "pick a term"', 'button "Close"']);
  await page.locator(DESIGNER).locator('#stub-pick').click();
  await openSettings(card);
  await card.getByRole('button', { name: 'Edit default term' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => focusedControl(page)).toBe('dialog "Choose default term"');
  expect(await tabSequence(page, 3)).toEqual([
    'button "Cancel default selection"',
    'button "pick a term"',
    'button "Cancel default selection"',
  ]);
});

test('the property dialog opens on itself and keeps Tab inside, both ways', async ({ page }) => {
  const designer = await openDesigner(page, '?picker=stub');
  const card = designer.locator('[id^=field-card-]').first();
  await openSettings(card, 'Configuration');
  await card.getByRole('button', { name: 'Replace property IRI', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => focusedControl(page)).toBe('dialog "Choose property IRI"');
  expect(await tabSequence(page, 3)).toEqual(['button "Close"', 'button "pick a term"', 'button "Close"']);
  expect(await tabSequence(page, 2, 'Shift+Tab')).toEqual(['button "pick a term"', 'button "Close"']);
});

test('the types dialog opens on itself and keeps Tab inside, both ways', async ({ page }) => {
  const designer = await openDesigner(page, '?picker=stub');
  await designer.getByRole('button', { name: 'Expand template settings', exact: true }).click();
  const settings = designer.locator('app-container-settings').first();
  await clickCentred(settings.getByRole('tab', { name: 'Metadata', exact: true }));
  await settings.getByRole('button', { name: 'Add types', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => focusedControl(page)).toBe('dialog "Add types"');
  expect(await tabSequence(page, 3)).toEqual(['button "Close"', 'button "pick a term"', 'button "Close"']);
  expect(await tabSequence(page, 2, 'Shift+Tab')).toEqual(['button "pick a term"', 'button "Close"']);
});

test("manual IRI entry opens on its box and runs to its buttons, for a field's property and for types", async ({
  page,
}) => {
  const designer = await openDesigner(page);
  const card = designer.locator('[id^=field-card-]').first();
  await openSettings(card, 'Configuration');
  await card.getByRole('button', { name: 'Enter IRI manually', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => focusedControl(page)).toBe('textbox "IRI"');
  expect(await tabUntil(page, 'button "Collapse field settings"', 10)).toEqual([
    'button "Add property"',
    'button "Cancel"',
    'button "Collapse field settings"',
  ]);

  await designer.getByRole('button', { name: 'Expand template settings', exact: true }).click();
  const settings = designer.locator('app-container-settings').first();
  await clickCentred(settings.getByRole('tab', { name: 'Metadata', exact: true }));
  await settings.getByRole('button', { name: 'Enter IRI manually', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => focusedControl(page)).toBe('textbox "IRI"');
  expect(await tabUntil(page, 'button "Collapse template settings"', 10)).toEqual([
    'button "Add type"',
    'button "Cancel"',
    'button "Collapse template settings"',
  ]);
});
