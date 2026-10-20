import { Locator, Page, expect, test } from '@playwright/test';
import type { CedarEmbeddableDesignerElement, CedJsonObject } from '../../src/app/ced-public-api';
import { buildContainer, newContainer, templateToJson } from '../../src/app/core/model/cedar-template';
import { fieldNode } from '../../src/app/core/model/container-draft';
import { DESIGNER, applyPreset, child, clickCentred, focusedControl, openDesigner, openSettings } from './support';

/**
 * How the designer tells a screen reader about an error, without moving focus, and only once.
 *
 * An error beside its control is an alert, which is spoken when it appears. The validation
 * summary lists the same errors, so it speaks only for an issue nothing else announced: one that
 * arrives with no alert of its own, such as a defect in a document the host loaded. The host's
 * findings have their own announcement, so the summary adds nothing to them either.
 */

const region = (scope: Locator) => scope.locator('app-live-region').getByRole('status');

/** Count the live region's changes from now on, so a test can show that it said nothing. */
async function countChanges(page: Page): Promise<() => Promise<number>> {
  await page.evaluate((tag) => {
    const target = document.querySelector(tag)!.shadowRoot!.querySelector('app-live-region p')!;
    const holder = window as unknown as { __regionChanges: number };
    holder.__regionChanges = 0;
    new MutationObserver((records) => (holder.__regionChanges += records.length)).observe(target, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }, DESIGNER);
  return () => page.evaluate(() => (window as unknown as { __regionChanges: number }).__regionChanges);
}

/** Wait past the live region's delay, so a message it was about to show has arrived. */
const afterAnnouncement = (page: Page) => page.waitForTimeout(400);

test("a field's name error is an alert at its box, and the summary does not repeat it", async ({ page }) => {
  const designer = await openDesigner(page);
  const card = designer.locator('app-field-card').first();
  const name = card.getByRole('textbox', { name: 'Enter field name', exact: true });
  const changes = await countChanges(page);
  await name.fill('');
  await name.blur();
  await expect(card.getByRole('alert')).toHaveText('Field name is required.');
  await expect(name).toHaveAttribute('aria-describedby', await card.getByRole('alert').getAttribute('id'));
  await expect(designer.locator('.validation-summary summary')).toHaveText('1 error — fix before saving');
  await afterAnnouncement(page);
  expect(await changes(), 'the summary').toBe(0);
});

test('a template name error is an alert, and focus stays where the author is', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.evaluate(
    (tag) => (document.querySelector(tag) as unknown as CedarEmbeddableDesignerElement).newArtifact('template'),
    DESIGNER,
  );
  const changes = await countChanges(page);
  // A new field reveals the missing template name while its own name box keeps focus.
  await designer.getByRole('button', { name: 'Add field', exact: true }).click();
  await designer.getByRole('button', { name: 'Text', exact: true }).click();
  const header = designer.locator('.template-header-card').first();
  await expect(header.getByRole('alert')).toHaveText('Template name is required.');
  await expect(header.getByRole('textbox', { name: 'Template name', exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect.poll(() => focusedControl(page)).toBe('textbox "Enter field name"');
  await afterAnnouncement(page);
  expect(await changes(), 'the summary').toBe(0);
  expect(await focusedControl(page)).toBe('textbox "Enter field name"');
});

test("a host finding at the description is an alert, and only the host's count is said besides", async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Study');
  await page.evaluate((tag) => {
    (document.querySelector(tag) as unknown as { validationFindings: object[] }).validationFindings = [
      { location: '/schema:description', message: 'Explain this study', severity: 'error' },
    ];
  }, DESIGNER);
  const header = designer.locator('.template-header-card').first();
  await expect(header.getByRole('alert')).toHaveText('Explain this study');
  await expect(header.getByRole('textbox', { name: 'Description', exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(region(designer)).toHaveText('The host reported 1 error.');
  await afterAnnouncement(page);
  await expect(region(designer)).toHaveText('The host reported 1 error.');
});

test('a document loaded with a defect no control shows is announced by its summary', async ({ page }) => {
  const designer = await openDesigner(page);
  const root = newContainer('template');
  root.name = 'Imported';
  root.children = [
    fieldNode({
      id: 1,
      name: 'Dose',
      type: 'number',
      status: 'optional',
      allowMultiple: false,
      options: [],
      defaultValue: { kind: 'none' },
      numeric: { type: 'xsd:decimal', min: 10, max: 100, decimalPlaces: null, unit: null },
    }),
  ];
  const artifact = templateToJson(buildContainer(root)) as Record<string, unknown>;
  const focused = await focusedControl(page);
  (child(artifact, 'Dose')._valueConstraints as Record<string, unknown>).defaultValue = '1000';
  await page.evaluate(
    ({ tag, artifact }) =>
      (document.querySelector(tag) as unknown as CedarEmbeddableDesignerElement).loadArtifact(
        artifact as CedJsonObject,
      ),
    { tag: DESIGNER, artifact },
  );
  await expect(designer.locator('.validation-summary summary')).toHaveText('1 error — fix before saving');
  // The settings that hold the default are closed, so no alert says it.
  await expect(designer.getByRole('alert')).toHaveCount(0);
  await expect(region(designer)).toHaveText('1 error — fix before saving');
  expect(await focusedControl(page)).toBe(focused);

  // Read only, the summary lists the same issue for inspection and says nothing new.
  const changes = await countChanges(page);
  await page.evaluate((tag) => {
    (document.querySelector(tag) as unknown as CedarEmbeddableDesignerElement).readOnly = true;
  }, DESIGNER);
  await expect(designer.locator('.validation-summary summary')).toHaveText('Validation issues (1)');
  await afterAnnouncement(page);
  expect(await changes()).toBe(0);
});

test('a warning that arrives with an announced action is said after it', async ({ page }) => {
  const designer = await openDesigner(page, '?picker=stub');
  await applyPreset(page, 'semantic');
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Study');
  await designer.getByRole('button', { name: /^Add field$/ }).click();
  await designer.getByRole('button', { name: 'Controlled Terms', exact: true }).click();
  const field = designer.locator('app-field-card').filter({ has: page.locator('app-controlled-term-config') });
  await field.getByRole('textbox', { name: 'Enter field name', exact: true }).fill('Disease');
  await openSettings(field);
  await clickCentred(field.getByRole('button', { name: 'Edit controlled-term constraints' }));
  await designer.locator('#stub-pick').click();
  await openSettings(field);
  // The fake terminology server cannot verify the term, so the default arrives with a warning that
  // only the summary lists.
  await clickCentred(field.getByRole('button', { name: 'Edit default term' }));
  await designer.locator('#stub-pick').click();
  await expect(designer.locator('.validation-summary summary')).toHaveText('Validation issues (1)');
  await expect(region(designer)).toHaveText('Default set to cancer. Validation issues (1)');
});
