import { addElementFixture } from './support';
import { nestFixtureFields } from './support';
/**
 * What the designer looks like, recorded.
 *
 * The invariants in `layout-invariants.spec.ts` say nothing is clipped and nothing
 * escapes its card, and they will keep saying that through a redesign that makes the
 * interface worse. Only pixels catch a card that has grown a stray border, a heading
 * that lost its weight, spacing that drifted a little at a time. This is the part of
 * the strategy that needs a person to approve a change, which is also why it is the
 * smallest part: every baseline is a thing someone has to look at again whenever it
 * moves.
 *
 * Ten of them, grouped the way CEE groups its own fixtures — by what a group of field
 * types has in common rather than one per type. Twenty-six near-identical photographs
 * of a card would record the same information twenty-six times and go red together.
 *
 * These run in a container and nowhere else. A baseline records a machine's glyph
 * rasterisation as much as the application's rendering, and CEE measured what that
 * costs across the laptop-to-CI boundary: 7 of 106 baselines differing by antialiasing
 * alone, indistinguishable from a real change. `browser/run-in-container.sh` is the
 * one way to run or update these, and `playwright.config.ts` skips them outside it, so
 * a developer running the behaviour suite never sees a failure they cannot act on.
 *
 * The suite is hermetic, so CEE's script is not on the page and the Default Value
 * row reads "Default value editor is unavailable" in every baseline. That is the
 * state being recorded on purpose: it is what an embedder who loads CED alone sees,
 * and it is the only version of the page that is the same twice. What the control
 * looks like when CEE is present is `cef-parity.spec.ts`, which compares it against
 * CEF's own rendering instead of against a picture.
 *
 * Settings stay collapsed except for the metadata-tab shot, which masks the
 * generated property IRI while retaining the layout an author sees.
 */
import { expect, test, type Page } from '@playwright/test';
import { openSettings, applyPreset, openDesigner } from './support';

const DESIGNER = 'cedar-embeddable-designer';

/**
 * Field types that share a question, so one photograph answers it for all of them.
 *
 * The groups are the capability axis the descriptor already draws: what the type
 * collects, and therefore what its card has to show.
 */
const GROUPS: Record<string, readonly string[]> = {
  'simple-inputs': ['Text', 'Paragraph', 'Number', 'Temporal'],
  choices: ['Multiple Choice', 'Checkboxes', 'List', 'Multi-select List'],
  vocabulary: ['Controlled Terms', 'Attribute Value', 'ORCID', 'DOI'],
  static: ['Image', 'Rich Text', 'YouTube', 'Section Break', 'Page Break'],
};

/**
 * Screenshot options every shot shares.
 *
 * No pixel budget. CEE carries one of 120 because its baselines used to cross the
 * laptop-to-CI boundary, where glyph antialiasing alone moved 124 to 393 pixels — but
 * the container removes that boundary, and keeping the budget afterwards only buys
 * blindness. Measured here: changing the version in the header from 0.1.0 to 9.9.9
 * moved fewer than 120 pixels and passed every baseline. Three consecutive container
 * runs agree to the pixel, so zero is what the runs actually support.
 */
const SHOT = {
  animations: 'disabled',
  caret: 'hide',
  maxDiffPixels: 0,
} as const;

/**
 * A designer holding one card of each named type, and nothing else.
 *
 * The three starting fields are removed first, so each group's photograph is of that
 * group. Waiting on the card count rather than on the last click: a new card scrolls
 * in smoothly, and a screenshot taken during that reads a card mid-flight.
 */
async function designerShowing(
  page: Page,
  labels: readonly string[],
  preset: 'basic' | 'semantic' | 'modular' = 'modular',
) {
  await openDesigner(page);
  await applyPreset(page, preset);
  const designer = page.locator(DESIGNER);

  // The delete control carries a title and no text, which is what names it here.
  const starting = designer.locator('[id^=field-card-]');
  for (let remaining = await starting.count(); remaining > 0; remaining--) {
    await designer.locator('[id^=field-card-]').first().getByTitle('Delete field').first().click();
  }
  await expect.poll(async () => starting.count(), { timeout: 10_000 }).toBe(0);

  for (const label of labels) {
    await designer
      .getByRole('button', { name: /^Add field$/ })
      .first()
      .click();
    await designer.getByRole('button', { name: label, exact: true }).click();
    await designer.locator('input[aria-label="Field name"]:focus').fill(label);
  }
  await expect.poll(async () => starting.count(), { timeout: 15_000 }).toBe(labels.length);
  // Field insertion scrolls the designer's own viewport. Reset that viewport,
  // after the insertion frame, rather than the unrelated host window.
  await designer.locator('.designer-grid').evaluate(async (grid) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    grid.parentElement!.scrollTo({ top: 0, behavior: 'instant' });
  });
  return designer;
}

test.describe('the designer', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  for (const [group, labels] of Object.entries(GROUPS)) {
    test(`shows ${group} fields`, async ({ page }) => {
      const designer = await designerShowing(page, labels);
      await expect(designer).toHaveScreenshot(`${group}.png`, {
        ...SHOT,
        mask: [designer.locator('.designer-identity__version')],
      });
    });
  }

  /**
   * The three profiles on one template, which is the only way to see what a preset
   * actually changes. Basic hides help text and default value; the other two show
   * them, and Modular adds elements.
   */
  for (const preset of ['basic', 'semantic', 'modular'] as const) {
    test(`shows a text field under the ${preset} profile`, async ({ page }) => {
      const designer = await designerShowing(page, ['Text'], preset);
      await expect(designer).toHaveScreenshot(`profile-${preset}.png`, {
        ...SHOT,
        mask: [designer.locator('.designer-identity__version')],
      });
    });
  }

  test('shows the field type palette', async ({ page }) => {
    const designer = await designerShowing(page, ['Text']);
    await designer
      .getByRole('button', { name: /^Add field$/ })
      .first()
      .click();
    const picker = designer.locator('app-field-type-picker');
    await picker.locator('.btn-field-item').first().waitFor({ state: 'visible' });

    await expect(picker).toHaveScreenshot('palette.png', SHOT);
  });

  /**
   * One card with everything open, which is the state an author spends the longest in
   * and the only shot where the settings panels are visible at all.
   */
  test('shows a text field with metadata settings expanded', async ({ page }) => {
    // Masking metadata hides pixels, but random UUID glyph widths can still wrap
    // its IRI onto another line and change the height of the whole card.
    await page.addInitScript(() => {
      let sequence = 0;
      Object.defineProperty(crypto, 'randomUUID', {
        value: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
      });
    });
    const designer = await designerShowing(page, ['Text']);
    const card = designer.locator('[id^=field-card-]').first();
    await openSettings(card, 'Field metadata');

    await expect(card).toHaveScreenshot('card-expanded.png', {
      ...SHOT,
      // Field identities and provenance vary between runs.
      mask: [card.locator('dl.identity dd:not(:first-of-type)')],
    });
  });

  test('shows simple inputs at a narrow width', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    const designer = await designerShowing(page, GROUPS['simple-inputs']);

    await expect(designer).toHaveScreenshot('narrow.png', {
      ...SHOT,
      mask: [designer.locator('.designer-identity__version')],
    });
  });
  for (const width of [1280, 375]) {
    test(`shows inline elements expanded and collapsed at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const designer = await openDesigner(page);
      await applyPreset(page, 'modular');
      await addElementFixture(page, designer);
      const element = designer.locator('app-container-editor').nth(1);
      await element.getByPlaceholder('Enter element name').fill('Study details');
      await nestFixtureFields(page, ['element']);
      await expect(element.locator('app-field-card')).toHaveCount(1);
      await page.mouse.move(0, 0);
      await expect(element).toHaveScreenshot(`element-expanded-${width}.png`, SHOT);
      const settings = element.locator(':scope > .template-header-card > app-element-card');
      await settings.getByRole('button', { name: 'Expand element settings', exact: true }).click();
      await page.mouse.move(0, 0);
      await expect(element).toHaveScreenshot(`element-settings-${width}.png`, SHOT);
      await settings.getByRole('button', { name: 'Collapse element settings', exact: true }).click();
      await element.locator(':scope > .template-header-card .element-toggle').click();
      await page.mouse.move(0, 0);
      await expect(element).toHaveScreenshot(`element-collapsed-${width}.png`, SHOT);
    });
  }
});

test('an unnamed field is quiet until the author leaves its name empty', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Study');
  await designer.getByRole('button', { name: 'Add field', exact: true }).first().click();
  await designer.getByRole('button', { name: 'Text', exact: true }).click();
  const name = designer.locator('input[aria-label="Field name"]:focus');
  await expect(name).toHaveValue('');
  const card = name.locator('xpath=ancestor::app-field-card');
  await page.mouse.move(0, 0);
  await expect(card).toHaveScreenshot('unnamed-field-editing.png', SHOT);
  await name.blur();
  const added = designer.locator('app-field-card').filter({ hasText: 'Field name is required.' });
  await expect(added).toHaveScreenshot('unnamed-field-required.png', SHOT);
  const summary = designer.locator('.validation-summary');
  await summary.locator('summary').click();
  await expect(summary).toHaveScreenshot('validation-summary-expanded.png', SHOT);
});

test('an inactive settings tab still shows its error', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByLabel('Template name', { exact: true }).fill('Study');
  const card = designer.locator('app-field-card').first();
  await card.getByLabel('Allow multiple', { exact: true }).check();
  const panel = await openSettings(card, 'Occurrences');
  await panel.getByLabel('Minimum', { exact: true }).fill('2');
  await panel.getByLabel('Maximum', { exact: true }).fill('1');
  await card.getByRole('tab', { name: 'Display', exact: true }).click();
  await page.mouse.move(0, 0);
  await expect(card).toHaveScreenshot('inactive-tab-error.png', SHOT);
});

test('element deletion confirmation uses the shared dialog actions', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'Basic', exact: true }).click();
  await designer.getByRole('button', { name: /Modular/ }).click();
  await addElementFixture(page);
  await nestFixtureFields(page, ['element']);
  await designer.getByRole('button', { name: 'Delete element Element', exact: true }).click();
  const dialog = designer.getByRole('dialog', { name: 'Delete element?' });
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await expect(dialog).toHaveScreenshot('delete-element.png', SHOT);
});
