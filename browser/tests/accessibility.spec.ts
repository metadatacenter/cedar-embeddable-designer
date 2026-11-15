import { Locator, Page, expect, test } from '@playwright/test';
import { FIELD_TYPES } from '../../src/app/core/models/types';
import {
  DESIGNER,
  addElementFixture,
  applyPreset,
  clickCentred,
  nestFixtureFields,
  openDesigner,
  openPreview,
  openSettings,
  tabKey,
} from './support';
import { expectAccessible } from './accessibility-gate';

/**
 * Automated WCAG checks over the designer's states.
 *
 * A rule engine decides names, roles, ARIA validity, the contrast it can compute and target
 * sizes. It cannot decide focus order, where focus returns or what a screen reader announces,
 * so those need assertions of their own. The tags are WCAG 2.0, 2.1 and 2.2 at levels A and AA,
 * as in Workspace's, the term picker's and CEE's gates.
 */

/** Put the pointer over `control`, and check that its hover styles apply. */
async function hover(control: Locator): Promise<void> {
  await control.hover();
  expect(await control.evaluate((element) => element.matches(':hover'))).toBe(true);
}

/** Focus `control` as the keyboard does, so that it shows the ring a keyboard author sees. */
async function focusFromKeyboard(page: Page, control: Locator): Promise<void> {
  await control.focus();
  await page.keyboard.press(tabKey(page, 'Shift+Tab'));
  await page.keyboard.press(tabKey(page, 'Tab'));
  await expect(control).toBeFocused();
  expect(await control.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
}

/** Open the settings in `scope` and check each of its tabs in turn. */
async function expectTabsAccessible(page: Page, scope: Locator, state: string): Promise<void> {
  const toggle = scope.locator('.settings-toggle').first();
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await clickCentred(toggle);
  const tabs = scope.getByRole('tab');
  // The tabs render on the coalesced pass after the click; listing them sooner finds none.
  await expect(tabs.first()).toBeVisible();
  for (const tab of await tabs.all()) {
    await clickCentred(tab);
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expectAccessible(page, `${state}, ${(await tab.innerText()).trim()} tab`);
  }
}

test('a fresh template at the default and Basic presets', async ({ page }) => {
  await page.goto('/host.html');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __ready?: boolean }).__ready === true), { timeout: 30_000 })
    .toBeTruthy();
  await expect(page.locator(DESIGNER).locator('[id^=field-card-]').first()).toBeVisible();
  await expectAccessible(page, 'default preset');
  await applyPreset(page, 'basic');
  await expectAccessible(page, 'Basic preset');
});

// The settled result for a field's settings toggle rests on the header as its equivalent target, so
// the header must meet the minimum size and must open the same settings.
for (const width of [1280, 375])
  test(`a field header is its settings toggle's equivalent target at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    const designer = await openDesigner(page);
    const cards = designer.locator('app-field-card');
    await expect(cards).toHaveCount(SAMPLE_FIELDS);
    for (const card of await cards.all()) {
      const header = card.locator('[appheadertoggle]');
      const toggle = card.locator('app-field-settings .settings-toggle');
      const settings = card.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`);
      await header.scrollIntoViewIfNeeded();
      const box = (await header.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
      // The toggle keeps its size, which is why it needs an equivalent.
      expect(await toggle.evaluate((element) => [element.offsetWidth, element.offsetHeight])).toEqual([36, 14]);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(settings).toBeHidden();
      // The header's own surface, between the field's type and its delete button.
      const chrome = { x: box.width * 0.75, y: box.height - 12 };
      await header.click({ position: chrome });
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(settings).toBeVisible();
      await header.click({ position: chrome });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(settings).toBeHidden();
    }
  });

// Each page state gets its own deadline. Several full-page scans in one test exhaust the
// 30-second budget when the train also runs another application's browser suite.
for (const state of [
  'template settings',
  'user menu',
  'Preferences',
  'Define Presets',
  'Add field palette',
  'a new, unnamed field',
])
  test(`the template authoring surface: ${state}`, async ({ page }) => {
    const designer = await openDesigner(page);
    await designer.getByRole('button', { name: 'Expand template settings', exact: true }).click();
    if (['user menu', 'Preferences', 'Define Presets'].includes(state)) {
      await designer.locator('.user-menu-container button').first().click();
      if (state !== 'user menu') await designer.getByRole('button', { name: state, exact: true }).click();
    }
    if (['Add field palette', 'a new, unnamed field'].includes(state)) {
      await designer.getByRole('button', { name: /^Add field$/ }).click();
      if (state === 'a new, unnamed field') {
        // The empty name's placeholder is the only text the new field shows.
        await designer.getByRole('button', { name: 'Text', exact: true }).click();
        await expect(designer.getByPlaceholder('Enter field name').last()).toHaveValue('');
      }
    }
    await expectAccessible(page, state);
  });

/**
 * The sample template's fields and their complete tab inventory. Each tab gets a separate scan
 * and deadline; checking the inventory prevents a newly added tab from silently losing coverage.
 */
const SAMPLE_FIELDS = 3;
const SAMPLE_FIELD_TABS = ['Configuration', 'Display', 'Constraints', 'Annotations', 'Field metadata', 'Version'];

async function expectSampleTabAccessible(page: Page, card: Locator, tab: string, state: string): Promise<void> {
  const toggle = card.locator('.settings-toggle').first();
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await clickCentred(toggle);
  const tabs = card.getByRole('tab');
  await expect(tabs).toHaveCount(SAMPLE_FIELD_TABS.length);
  // IDs carry stable tab names even when the visible labels are Hungarian.
  for (const [index, name] of SAMPLE_FIELD_TABS.entries())
    await expect(tabs.nth(index)).toHaveAttribute('id', new RegExp(`-${name.replaceAll(' ', '-')}$`));
  const selected = tabs.nth(SAMPLE_FIELD_TABS.indexOf(tab));
  await clickCentred(selected);
  await expect(selected).toHaveAttribute('aria-selected', 'true');
  await expectAccessible(page, `${state}, ${(await selected.innerText()).trim()} tab`);
}

for (let index = 0; index < SAMPLE_FIELDS; index++)
  for (const tab of SAMPLE_FIELD_TABS)
    test(`the ${tab} tab of field ${index + 1} in the template`, async ({ page }) => {
      const designer = await openDesigner(page);
      const cards = designer.locator('[id^=field-card-]');
      await expect(cards).toHaveCount(SAMPLE_FIELDS);
      await expectSampleTabAccessible(page, cards.nth(index), tab, `field ${index + 1}`);
    });

/** Show the designer in Hungarian. The stub picker brings the property IRI's Choose and Replace buttons, whose Hungarian names must hold their visible words. */
async function openHungarian(page: Page): Promise<Locator> {
  const designer = await openDesigner(page, '?picker=stub');
  await page.evaluate(() => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { language: string }).language = 'hu';
  });
  await expect(designer.locator('.overview-panel__title')).toHaveText('Áttekintés (3)');
  return designer;
}

test('the Hungarian text on a template', async ({ page }) => {
  await openHungarian(page);
  await expectAccessible(page, 'Hungarian template');
});

for (let index = 0; index < SAMPLE_FIELDS; index++)
  for (const tab of SAMPLE_FIELD_TABS)
    test(`the Hungarian text on the ${tab} tab of field ${index + 1}`, async ({ page }) => {
      const designer = await openHungarian(page);
      const cards = designer.locator('[id^=field-card-]');
      await expect(cards).toHaveCount(SAMPLE_FIELDS);
      await expectSampleTabAccessible(page, cards.nth(index), tab, `Hungarian field ${index + 1}`);
    });

test('the child picker', async ({ page }) => {
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await addElementFixture(page, designer, () => expectAccessible(page, 'child picker'));
});

async function openNestedElement(page: Page): Promise<Locator> {
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await addElementFixture(page);
  await nestFixtureFields(page, ['Element']);
  const element = designer
    .locator('.field-drag-container')
    .filter({ has: page.locator(':scope > app-container-editor') })
    .first();
  await expect(element.locator('.field-drag-container').first()).toBeVisible();
  return element;
}

test('a nested element', async ({ page }) => {
  await openNestedElement(page);
  await expectAccessible(page, 'nested element');
});

for (const tab of SAMPLE_FIELD_TABS)
  test(`the ${tab} tab of a nested field`, async ({ page }) => {
    const element = await openNestedElement(page);
    await expectSampleTabAccessible(page, element.locator('.field-drag-container').first(), tab, 'nested field');
  });

test('a collapsed element', async ({ page }) => {
  const element = await openNestedElement(page);
  await element.getByRole('button', { name: 'Collapse Element', exact: true }).click();
  await expectAccessible(page, 'collapsed element');
});

test('host findings in the summary and at the setting they name', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Study');
  await page.evaluate(() => {
    (
      document.querySelector('cedar-embeddable-designer') as unknown as { validationFindings: object[] }
    ).validationFindings = [
      { location: '/properties/Title/_valueConstraints/regex', message: 'Review this pattern', severity: 'error' },
      { location: '/schema:description', message: 'Explain this study', severity: 'error' },
      { location: '/somewhere/unknown', message: 'Consider this', severity: 'warning' },
    ];
  });
  const summary = designer.locator('.validation-summary');
  await expect(summary).toBeVisible();
  await expectAccessible(page, 'findings summary closed');
  await summary.locator('summary').click();
  await expectAccessible(page, 'findings summary open');
  await summary.getByRole('button', { name: /Review this pattern/ }).click();
  await expect(designer.locator('input[name=regex]')).toBeFocused();
  await expectAccessible(page, 'finding revealed at its setting');
});

test('the preview', async ({ page }) => {
  await openDesigner(page, '?cee=stub');
  await openPreview(page);
  await expect(page.locator('cedar-embeddable-editor')).toHaveCount(1);
  await expectAccessible(page, 'preview');
});

test('a published field and a read-only template', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.evaluate(() => {
    const element = document.querySelector('cedar-embeddable-designer') as unknown as {
      currentTemplate: Record<string, any>;
      template: object;
    };
    const template = structuredClone(element.currentTemplate);
    template['properties'].Title['bibo:status'] = 'bibo:published';
    template['properties'].Title['pav:version'] = '1.2.0';
    template['properties'].Title['pav:createdBy'] = 'https://example.org/users/author';
    element.template = template;
  });
  await expect(designer.locator('.field-drop-item').first().getByRole('status')).toBeVisible();
  await expectAccessible(page, 'published field');
  await page.evaluate(() => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { readOnly: boolean }).readOnly = true;
  });
  await expectAccessible(page, 'read-only template');
  await expectTabsAccessible(page, designer.locator('[id^=field-card-]').nth(1), 'read-only field');
});

test('a 375px host', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const designer = await openDesigner(page);
  await expectAccessible(page, 'narrow template');
  await expectTabsAccessible(page, designer.locator('[id^=field-card-]').first(), 'narrow field');
});

test('a 375px host with the Overview open over the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'Open Overview', exact: true }).click();
  await expect(designer.locator('.overview-panel')).toBeVisible();
  await expectAccessible(page, 'narrow, Overview open');
});

test('the library sidebar, expanded and collapsed', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).click();
  await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
  await designer.getByRole('radio', { name: /Library Sidebar/ }).check();
  await designer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(designer.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
  await expectAccessible(page, 'sidebar');
  await designer.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(designer.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await expectAccessible(page, 'collapsed sidebar');
});

/**
 * A Controlled Terms field on a fresh template, under the semantic preset, with the stub picker. The
 * dialogs and the settings they change each get an independent scan. Keeping six or seven scans
 * in one test outlasted its timeout under parallel load; independent states share the worker pool.
 */
async function controlledTermsCard(page: Page) {
  const designer = await openDesigner(page, '?picker=stub');
  await applyPreset(page, 'semantic');
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Study');
  await designer.getByRole('button', { name: /^Add field$/ }).click();
  await designer.getByRole('button', { name: 'Controlled Terms', exact: true }).click();
  const card = designer
    .locator('app-field-card')
    .filter({ has: page.locator('.field-type-label', { hasText: 'Controlled Terms' }) });
  await card.getByRole('textbox', { name: 'Enter field name', exact: true }).fill('Disease');
  return { designer, card };
}

async function addConstraint(
  page: Page,
  { designer, card }: Awaited<ReturnType<typeof controlledTermsCard>>,
  scan: boolean,
) {
  // The settings are still folded on a new field, so they are opened at the tab that holds the button.
  await openSettings(card, 'Constraints');
  await clickCentred(card.getByRole('button', { name: 'Edit controlled-term constraints' }));
  await expect(designer.getByRole('dialog', { name: 'Controlled-term constraints' })).toBeVisible();
  if (scan) await expectAccessible(page, 'constraint dialog');
  await designer.locator('#stub-pick').click();
}

async function addDefault(page: Page, field: Awaited<ReturnType<typeof controlledTermsCard>>, scan: boolean) {
  await addConstraint(page, field, false);
  const { designer, card } = field;
  await clickCentred(card.getByRole('tab', { name: 'Constraints', exact: true }));
  await clickCentred(card.getByRole('button', { name: 'Edit default term' }));
  await expect(designer.getByRole('dialog', { name: 'Choose default term' })).toBeVisible();
  if (scan) await expectAccessible(page, 'default-term dialog');
  await designer.locator('#stub-pick').click();
}

// Preserve all twenty scans: six tabs in each of three states, plus both dialogs. The tab helper
// also asserts the complete tab inventory, so a new tab cannot silently escape this matrix.
for (const state of ['without constraints', 'with a constraint', 'with a default'])
  for (const tab of SAMPLE_FIELD_TABS)
    test(`the ${tab} tab of a controlled-terms field ${state}`, async ({ page }) => {
      const field = await controlledTermsCard(page);
      if (state === 'with a constraint') await addConstraint(page, field, false);
      if (state === 'with a default') await addDefault(page, field, false);
      await expectSampleTabAccessible(page, field.card, tab, `controlled terms ${state}`);
    });

test('the controlled-term constraint dialog', async ({ page }) => {
  await addConstraint(page, await controlledTermsCard(page), true);
});

test('the controlled-term default dialog', async ({ page }) => {
  await addDefault(page, await controlledTermsCard(page), true);
});

/** Answer the open picker as the term picker would, with `constraints`. */
const pickConstraints = (page: Page, constraints: object[]) =>
  page
    .locator('cedar-embeddable-term-picker')
    .evaluate(
      (picker, constraints) =>
        picker.dispatchEvent(new CustomEvent('constraintsSelected', { detail: { constraints, actions: [] } })),
      constraints,
    );

test('the property picker, its dialog and its error, and manual entry with its error', async ({ page }) => {
  const designer = await openDesigner(page, '?picker=stub');
  const card = designer.locator('[id^=field-card-]').first();
  const panel = await openSettings(card, 'Configuration');
  await expectAccessible(page, 'property picker');
  await panel.getByRole('button', { name: 'Replace property IRI', exact: true }).click();
  const dialog = designer.getByRole('dialog', { name: 'Choose property IRI', exact: true });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, 'property dialog');
  await pickConstraints(page, [{ sourceType: 'ontology', sourceId: 'RO' }]);
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expectAccessible(page, 'property dialog error');
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Enter IRI manually', exact: true }).click();
  await expectAccessible(page, 'manual property entry');
  await panel.getByRole('textbox', { name: 'IRI', exact: true }).fill('not an IRI');
  await expect(panel.getByRole('alert')).toBeVisible();
  await expectAccessible(page, 'manual property entry error');
});

test('the types picker, its dialog and its error, and manual entry', async ({ page }) => {
  const designer = await openDesigner(page, '?picker=stub');
  await designer.getByRole('button', { name: 'Expand template settings', exact: true }).click();
  const settings = designer.locator('app-container-settings').first();
  await clickCentred(settings.getByRole('tab', { name: 'Metadata', exact: true }));
  await settings.getByRole('button', { name: 'Enter IRI manually', exact: true }).click();
  await settings.getByRole('textbox', { name: 'IRI', exact: true }).fill('https://example.org/Study');
  await settings.getByRole('textbox', { name: 'IRI', exact: true }).press('Enter');
  await expect(settings.getByRole('button', { name: 'Remove type https://example.org/Study' })).toBeVisible();
  await expectAccessible(page, 'types picker');
  await settings.getByRole('button', { name: 'Add types', exact: true }).click();
  const dialog = designer.getByRole('dialog', { name: 'Add types', exact: true });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, 'types dialog');
  await pickConstraints(page, [{ sourceType: 'ontology', sourceId: 'RO' }]);
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expectAccessible(page, 'types dialog error');
  await page.keyboard.press('Escape');
  await settings.getByRole('button', { name: 'Enter IRI manually', exact: true }).click();
  await expectAccessible(page, 'manual type entry');
});

/**
 * One control of each kind, hovered and then focused from the keyboard, because a state's colours
 * are what axe-core measures, and hover and focus change them. Each kind gets a test of its own,
 * because all of them in one test came close to the timeout on the build train's slower runner.
 */
const CONTROL_KINDS = ['button', 'icon button', 'text box', 'select', 'tab', 'checkbox'] as const;

/**
 * The control of `kind` to hover and the one to focus. A tab takes focus only when it is selected,
 * so the selected tab is focused and another is hovered.
 */
async function controlOfKind(page: Page, kind: (typeof CONTROL_KINDS)[number]): Promise<[Locator, Locator]> {
  const designer = await openDesigner(page);
  const card = designer.locator('[id^=field-card-]').first();
  const panel = await openSettings(card, 'Configuration');
  const controls: Record<(typeof CONTROL_KINDS)[number], [Locator, Locator?]> = {
    button: [designer.getByRole('button', { name: 'Add field', exact: true })],
    'icon button': [card.getByRole('button', { name: 'Delete field', exact: true })],
    'text box': [designer.getByRole('textbox', { name: 'Template name', exact: true })],
    select: [panel.getByRole('combobox', { name: 'Requirement', exact: true })],
    tab: [
      card.getByRole('tab', { name: 'Presentation', exact: true }),
      card.getByRole('tab', { name: 'Configuration', exact: true }),
    ],
    checkbox: [panel.getByRole('checkbox', { name: 'Hidden', exact: true })],
  };
  const [hovered, focused = hovered] = controls[kind];
  return [hovered, focused];
}

for (const kind of CONTROL_KINDS)
  test(`${kind === 'icon button' ? 'an' : 'a'} ${kind}, hovered and focused`, async ({ page }) => {
    const [hovered, focused] = await controlOfKind(page, kind);
    await hover(hovered);
    await expectAccessible(page, `hovered ${kind}`);
    await focusFromKeyboard(page, focused);
    await expectAccessible(page, `focused ${kind}`);
  });

test('a menu item, hovered and focused', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).click();
  const item = designer.getByRole('button', { name: 'Preferences', exact: true });
  await hover(item);
  await expectAccessible(page, 'hovered menu item');
  await focusFromKeyboard(page, item);
  await expectAccessible(page, 'focused menu item');
});

for (const type of Object.keys(FIELD_TYPES))
  test(`the standalone ${type} designer and each of its settings tabs`, async ({ page }) => {
    await page.goto('/field-host.html');
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              typeof (document.getElementById('field') as unknown as { newArtifact?: unknown })?.newArtifact ===
              'function',
          ),
        { timeout: 30_000 },
      )
      .toBeTruthy();
    await page.evaluate(
      (type) => (document.getElementById('field') as unknown as { newArtifact(type: string): void }).newArtifact(type),
      type,
    );
    const field = page.locator('#field');
    await field.getByRole('textbox', { name: 'Enter field name', exact: true }).fill(`Study ${type}`);
    await expectAccessible(page, `${type} settings closed`);
    await expectTabsAccessible(page, field, type);
  });
