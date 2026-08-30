import { expect, test } from '@playwright/test';
import { openDesigner, openExport, templateName } from './support';

/**
 * What the export accordions show, which is where an author reads the artifact
 * they are building.
 *
 * There were two of these, each rendering its own copy of the same highlighter in
 * different colours, from a serializer that gave them different identifiers for
 * one template. The second lived in the preview panel, which now renders the
 * template as a form instead.
 */

test('shows the template as CEDAR JSON-LD', async ({ page }) => {
  await openDesigner(page);
  const panel = await openExport(page, 'JSON Schema');

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
  const panel = await openExport(page, 'JSON Schema');

  await templateName(page).fill('Tracked');

  await expect(panel.locator('pre.code-content')).toContainText('"schema:name": "Tracked"');
});
