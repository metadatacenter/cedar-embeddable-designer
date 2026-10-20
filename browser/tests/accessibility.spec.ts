import AxeBuilder from '@axe-core/playwright';
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
} from './support';

/**
 * Automated WCAG checks over the designer's states.
 *
 * A rule engine decides names, roles, ARIA validity, the contrast it can compute and target
 * sizes. It cannot decide focus order, where focus returns or what a screen reader announces,
 * so those need assertions of their own. The tags are WCAG 2.0, 2.1 and 2.2 at levels A and AA,
 * as in Workspace's, the term picker's and CEE's gates.
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * WCAG 2.1's Label in Name, criterion 2.5.3: a control's accessible name contains the text it shows,
 * so that speech input reaches it by its visible label. axe-core's rule for it is experimental, and
 * a tag selection leaves experimental rules out, so it runs by name.
 */
const LABEL_IN_NAME = 'label-content-name-mismatch';

/**
 * Criterion 2.5.3 for a text box whose placeholder is its only visible text, which is then its
 * visible label. axe-core's rule reads only names a control takes from its content, so it passes
 * such a box whatever its name says. A box with a label of its own shows its placeholder as a
 * hint. A header box's label sits beside it unassociated, because a click on that label toggles
 * the settings.
 */
async function placeholdersOutsideNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const failures: string[] = [];
    const visit = (root: Document | ShadowRoot) => {
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) visit(element.shadowRoot);
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) continue;
        const placeholder = element.placeholder.trim();
        if (!placeholder || element.value || !element.checkVisibility()) continue;
        if (element.labels?.length || element.hasAttribute('aria-labelledby')) continue;
        if (element.closest('.template-field-group')?.querySelector(':scope > label')) continue;
        const name = element.getAttribute('aria-label') || element.title || placeholder;
        if (!name.toLocaleLowerCase().includes(placeholder.toLocaleLowerCase()))
          failures.push(`placeholder-in-name: "${placeholder}" is named "${name}"`);
      }
    };
    visit(document);
    return failures;
  });
}

/**
 * Check the whole page once its animations finish, so contrast is read at full opacity.
 *
 * A click renders on the next coalesced pass, so the fade it starts does not exist until two
 * frames later. Chromium lists a shadow tree's animations on its root and not on the document.
 */
async function expectAccessible(page: Page, state: string): Promise<void> {
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const roots: DocumentOrShadowRoot[] = [document];
    for (const element of document.querySelectorAll('*')) if (element.shadowRoot) roots.push(element.shadowRoot);
    await Promise.all(
      roots
        .flatMap((root) => root.getAnimations())
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  const { violations: tagged, incomplete } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const { violations: named } = await new AxeBuilder({ page }).withRules([LABEL_IN_NAME]).analyze();
  const violations = [...tagged, ...named];
  // A label on an element whose role takes none is one axe cannot always decide, and a screen
  // reader ignores it either way, so the undecided case fails too.
  const ignoredLabels = incomplete.filter((result) => result.id === 'aria-prohibited-attr');
  const failures = [
    ...[...violations, ...ignoredLabels].flatMap((violation) =>
      violation.nodes.map((node) => `${violation.id}: ${JSON.stringify(node.target)}`),
    ),
    ...(await placeholdersOutsideNames(page)),
  ];
  expect(failures, state).toEqual([]);
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
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  await expect(page.locator(DESIGNER).locator('[id^=field-card-]').first()).toBeVisible();
  await expectAccessible(page, 'default preset');
  await applyPreset(page, 'basic');
  await expectAccessible(page, 'Basic preset');
});

test('the template settings, user menu, Preferences and Add field palette', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'Expand template settings', exact: true }).click();
  await expectAccessible(page, 'template settings');
  await designer.locator('.user-menu-container button').first().click();
  await expectAccessible(page, 'user menu');
  await designer.getByRole('button', { name: 'Preferences' }).click();
  await expectAccessible(page, 'Preferences');
  await designer.getByRole('button', { name: 'Done' }).click();
  await designer.locator('.user-menu-container button').first().click();
  await designer.getByRole('button', { name: 'Define Presets' }).click();
  await expectAccessible(page, 'Define Presets');
  await designer.getByRole('button', { name: 'Done' }).click();
  await designer.getByRole('button', { name: /^Add field$/ }).click();
  await expectAccessible(page, 'Add field palette');
  // A new field's name box is empty, so its placeholder is the only text it shows.
  await designer.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(designer.getByPlaceholder('Enter field name').last()).toHaveValue('');
  await expectAccessible(page, 'a new, unnamed field');
});

test('every settings tab of every field in the template', async ({ page }) => {
  const designer = await openDesigner(page);
  const cards = designer.locator('[id^=field-card-]');
  for (let index = 0; index < (await cards.count()); index++)
    await expectTabsAccessible(page, cards.nth(index), `field ${index + 1}`);
});

test('the Hungarian text, on a template and every settings tab of its fields', async ({ page }) => {
  // The stub picker brings the property IRI's Choose and Replace buttons, whose Hungarian names
  // must hold their visible words.
  const designer = await openDesigner(page, '?picker=stub');
  await page.evaluate(() => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { language: string }).language = 'hu';
  });
  await expect(designer.locator('.overview-panel__title')).toHaveText('Áttekintés (3)');
  await expectAccessible(page, 'Hungarian template');
  const cards = designer.locator('[id^=field-card-]');
  for (let index = 0; index < (await cards.count()); index++)
    await expectTabsAccessible(page, cards.nth(index), `Hungarian field ${index + 1}`);
});

test('the child picker, a nested element and a collapsed element', async ({ page }) => {
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await addElementFixture(page, undefined, () => expectAccessible(page, 'child picker'));
  await nestFixtureFields(page, ['Element']);
  const element = designer
    .locator('.field-drag-container')
    .filter({ has: page.locator(':scope > app-container-editor') })
    .first();
  await expect(element.locator('.field-drag-container').first()).toBeVisible();
  await expectAccessible(page, 'nested element');
  await expectTabsAccessible(page, element.locator('.field-drag-container').first(), 'nested field');
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

for (const type of Object.keys(FIELD_TYPES))
  test(`the standalone ${type} designer and each of its settings tabs`, async ({ page }) => {
    await page.goto('/field-host.html');
    await page.waitForFunction(
      () =>
        typeof (document.getElementById('field') as unknown as { newArtifact?: unknown })?.newArtifact === 'function',
    );
    await page.evaluate(
      (type) => (document.getElementById('field') as unknown as { newArtifact(type: string): void }).newArtifact(type),
      type,
    );
    const field = page.locator('#field');
    await field.getByRole('textbox', { name: 'Enter field name', exact: true }).fill(`Study ${type}`);
    await expectAccessible(page, `${type} settings closed`);
    await expectTabsAccessible(page, field, type);
  });
