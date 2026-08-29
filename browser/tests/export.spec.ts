import { expect, test } from '@playwright/test';
import { DESIGNER, openDesigner, openExport, templateName } from './support';

/**
 * What the export panels show, which is the only place an author sees the
 * artifact they are building.
 *
 * The panels each rendered their own copy of the same highlighter, in different
 * colours, from a serializer that gave them different identifiers for one
 * template. What they show now is the model library's output, and it is the same
 * output in both.
 */

test.describe('the preview panel', () => {
  test('shows the template as CEDAR JSON-LD', async ({ page }) => {
    await openDesigner(page);
    const panel = await openExport(page, 'JSON');

    const code = panel.locator('pre.code-content');
    await expect(code).toContainText('"@type": "https://schema.metadatacenter.org/core/Template"');
    await expect(code).toContainText('"@context"');
    await expect(code).toContainText('"pav": "http://purl.org/pav/"');
  });

  test('shows the same template as CEDAR YAML', async ({ page }) => {
    await openDesigner(page);
    const panel = await openExport(page, 'YAML');

    const code = panel.locator('pre.code-content');
    // The library's structural YAML, which is a different vocabulary from the
    // JSON-LD above rather than a reformatting of it.
    await expect(code).toContainText('type: template');
    await expect(code).toContainText('children:');
    await expect(code).toContainText('type: text-field');
  });

  test('leaves one space after a YAML key', async ({ page }) => {
    await openDesigner(page);
    const panel = await openExport(page, 'YAML');

    const text = await panel.locator('pre.code-content').innerText();

    // The highlighter prepended a space to a value that already had one, which
    // made the library's output look like something it had not written.
    expect(text).not.toMatch(/^\s*\w[\w-]*:\s{2}\S/m);
  });

  test('tracks an edit', async ({ page }) => {
    await openDesigner(page);
    const panel = await openExport(page, 'JSON');

    await templateName(page).fill('Tracked');

    await expect(panel.locator('pre.code-content')).toContainText('"schema:name": "Tracked"');
  });
});

test('both panels agree on the template', async ({ page }) => {
  await openDesigner(page);
  const panel = await openExport(page, 'JSON');
  const fromPanel = await panel.locator('pre.code-content').innerText();

  const accordions = page.locator(DESIGNER).locator('app-cedar-export-accordions');
  await accordions.locator('.accordion-header', { hasText: 'JSON Schema' }).click();
  const fromAccordion = await accordions.locator('pre.code-content').first().innerText();

  // Each used to build the template itself through a serializer that minted new
  // identifiers per call, so the two showed different artifacts for one editor
  // state. They read one memoized value now.
  expect(fromAccordion).toBe(fromPanel);
});

test('both panels highlight with the same palette', async ({ page }) => {
  await openDesigner(page);
  const panel = await openExport(page, 'JSON');
  const accordions = page.locator(DESIGNER).locator('app-cedar-export-accordions');
  await accordions.locator('.accordion-header', { hasText: 'JSON Schema' }).click();

  const panelKey = panel.locator('.hl-key').first();
  const accordionKey = accordions.locator('.hl-key').first();

  // A key was #38bdf8 in one and #79c0ff in the other, which is what two copies
  // of a stylesheet drift into.
  expect(await accordionKey.evaluate((node) => getComputedStyle(node).color)).toBe(
    await panelKey.evaluate((node) => getComputedStyle(node).color),
  );
});
