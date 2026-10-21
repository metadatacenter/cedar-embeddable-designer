import { Locator, Page, expect, test } from '@playwright/test';
import { DESIGNER, applyPreset, clickCentred, openDesigner, openSettings } from './support';

/**
 * What the designer says to a screen reader, through its one polite live region.
 *
 * The region is in the page from the first render, which is what makes a screen reader
 * announce its changes: one that arrives with its text already in it is often missed. Each
 * test performs an event and reads the region. Errors are not here. They keep their alerts
 * beside the control they concern, and error-announcements.spec.ts covers them.
 */

const region = (scope: Locator) => scope.locator('app-live-region').getByRole('status');

/** Count the region's changes from now on, so a test can show that nothing was said. */
async function countChanges(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const host = document.querySelector('cedar-embeddable-designer')!;
    const target = host.shadowRoot!.querySelector('app-live-region p')!;
    const holder = window as unknown as { __regionChanges: number };
    holder.__regionChanges = 0;
    new MutationObserver((records) => (holder.__regionChanges += records.length)).observe(target, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  return () => page.evaluate(() => (window as unknown as { __regionChanges: number }).__regionChanges);
}

test('both elements render an empty polite region from the start', async ({ page }) => {
  const designer = await openDesigner(page);
  await expect(region(designer)).toHaveAttribute('aria-live', 'polite');
  await expect(region(designer)).toHaveText('');
  await page.goto('/field-host.html');
  const field = page.locator('#field');
  await expect(region(field)).toHaveAttribute('aria-live', 'polite');
  await expect(region(field)).toHaveText('');
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

/** Open the constraint dialog and have the stub picker apply its set: the existing one plus one term. */
async function pickConstraint(page: Page, field: Locator): Promise<void> {
  await openSettings(field);
  await clickCentred(field.getByRole('button', { name: 'Edit controlled-term constraints' }));
  await page.locator(DESIGNER).locator('#stub-pick').click();
}

test('an applied constraint set says how many constraints the field now has', async ({ page }) => {
  const field = await controlledTermsField(page);
  const designer = page.locator(DESIGNER);
  await pickConstraint(page, field);
  await expect(region(designer)).toHaveText('Disease now has 1 constraint.');
  await pickConstraint(page, field);
  await expect(region(designer)).toHaveText('Disease now has 2 constraints.');
  await openSettings(field);
  await clickCentred(field.getByRole('button', { name: 'Edit controlled-term constraints' }));
  await designer.locator('cedar-embeddable-term-picker').evaluate((picker) =>
    picker.dispatchEvent(
      new CustomEvent('constraintsSelected', {
        detail: { constraints: [], actions: [] },
        bubbles: true,
        composed: true,
      }),
    ),
  );
  await expect(region(designer)).toHaveText('Disease no longer has constraints.');
});

test('Clear default and apply says the default went, and what the constraints now are', async ({ page }) => {
  const field = await controlledTermsField(page);
  const designer = page.locator(DESIGNER);
  await pickConstraint(page, field);
  await page.route('**/fake-terminology/bioportal/validate-term', (route) =>
    route.fulfill({
      json: { iri: 'urn:cancer', status: 'failed', code: 'controlledTermMembership', message: 'Outside.' },
    }),
  );
  await page.evaluate(() => {
    const d = document.querySelector('cedar-embeddable-designer') as unknown as {
      currentTemplate: { properties: Record<string, { items?: object }> };
      template: object;
    };
    const template = structuredClone(d.currentTemplate);
    const property = template.properties['Disease'];
    const definition = (property.items ?? property) as { _valueConstraints: Record<string, unknown> };
    definition._valueConstraints['defaultValue'] = { termUri: 'urn:cancer', 'rdfs:label': 'Cancer' };
    d.template = template;
  });
  const reloaded = designer.locator('app-field-card').filter({ has: page.locator('app-controlled-term-config') });
  await pickConstraint(page, reloaded);
  await designer.getByRole('button', { name: 'Clear default and apply constraints' }).click();
  await expect(region(designer)).toHaveText('Default cleared. Disease now has 2 constraints.');
});

test('a chosen default term is named', async ({ page }) => {
  const field = await controlledTermsField(page);
  // A verified term brings no warning, which the validation summary would announce after the name.
  await page.route('**/fake-terminology/bioportal/validate-term', (route) =>
    route.fulfill({
      json: { iri: route.request().postDataJSON().iri, status: 'passed', code: 'controlledTermVerified', message: '' },
    }),
  );
  await pickConstraint(page, field);
  await openSettings(field);
  await clickCentred(field.getByRole('button', { name: 'Edit default term' }));
  await page.locator(DESIGNER).locator('#stub-pick').click();
  await expect(region(page.locator(DESIGNER))).toHaveText('Default set to cancer.');
});

const findings = (page: Page, list: object[]) =>
  page.evaluate((value) => {
    (
      document.querySelector('cedar-embeddable-designer') as unknown as { validationFindings: object[] }
    ).validationFindings = value;
  }, list);
const error = (message: string) => ({ location: '/schema:description', message, severity: 'error' });
const warning = (message: string) => ({ location: '/somewhere/unknown', message, severity: 'warning' });

test('host findings are counted by severity, and their clearing is said once', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Study');
  await findings(page, [error('Explain this study'), error('Name the author'), warning('Consider a version')]);
  await expect(region(designer)).toHaveText('The host reported 2 errors and 1 warning.');
  await findings(page, [error('Explain this study')]);
  await expect(region(designer)).toHaveText('The host reported 1 error.');
  await findings(page, [warning('One'), warning('Two')]);
  await expect(region(designer)).toHaveText('The host reported 2 warnings.');

  const changes = await countChanges(page);
  await findings(page, [warning('One'), warning('Two')]);
  await page.waitForTimeout(400);
  expect(await changes(), 'the same set again').toBe(0);

  await findings(page, []);
  await expect(region(designer)).toHaveText("The host's reported issues are cleared.");
});

test('a host that reports nothing says nothing', async ({ page }) => {
  await openDesigner(page);
  const changes = await countChanges(page);
  await findings(page, []);
  await page.waitForTimeout(400);
  expect(await changes()).toBe(0);
});

test('moving a child in the Overview says where it went', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'Reorder Title', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(region(designer)).toHaveText('Title moved to position 2 of 3.');
  await page.keyboard.press('ArrowDown');
  await expect(region(designer)).toHaveText('Title moved to position 3 of 3.');
});

test('announcements follow the designer language', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.evaluate(() => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { language: string }).language = 'hu';
  });
  await designer.locator('app-container-outline .outline-drag-handle').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(region(designer)).toHaveText('Title áthelyezve: 2. hely (3 közül).');
});
