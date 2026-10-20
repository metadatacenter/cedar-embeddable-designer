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
 * so those need assertions of their own. The tags are Workspace's gate with WCAG 2.1 level A
 * added, since AA conformance includes it.
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

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
  const { violations, incomplete } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  // A label on an element whose role takes none is one axe cannot always decide, and a screen
  // reader ignores it either way, so the undecided case fails too.
  const ignoredLabels = incomplete.filter((result) => result.id === 'aria-prohibited-attr');
  const failures = [...violations, ...ignoredLabels].flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${JSON.stringify(node.target)}`),
  );
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
});

test('every settings tab of every field in the template', async ({ page }) => {
  const designer = await openDesigner(page);
  const cards = designer.locator('[id^=field-card-]');
  for (let index = 0; index < (await cards.count()); index++)
    await expectTabsAccessible(page, cards.nth(index), `field ${index + 1}`);
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
    await field.getByRole('textbox', { name: 'Field display name', exact: true }).fill(`Study ${type}`);
    await expectAccessible(page, `${type} settings closed`);
    await expectTabsAccessible(page, field, type);
  });
