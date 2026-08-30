import { expect, test } from '@playwright/test';
import { openDesigner, openPreview, templateName } from './support';

/**
 * The preview, which renders the template with CEE rather than with an
 * approximation of it.
 *
 * `<cedar-embeddable-editor>` is a sibling component the host loads, so these
 * tests stub it the way the constraint tests stub the term picker: the contract
 * under test is the designer's half of it — what it hands over, and when it
 * hands it over again.
 */

interface Mount {
  config: { readOnlyMode: boolean; showTemplateDescription: boolean };
  template: Record<string, unknown>;
}

const mounts = (page: import('@playwright/test').Page): Promise<Mount[]> =>
  page.evaluate(() => (window as unknown as { __ceeMounts: Mount[] }).__ceeMounts);

test('renders the template with CEE', async ({ page }) => {
  await openDesigner(page, '?cee=stub');
  const panel = await openPreview(page);

  await expect(panel.locator('cedar-embeddable-editor')).toBeVisible();
  await expect.poll(async () => (await mounts(page)).length).toBeGreaterThan(0);

  const [first] = await mounts(page);
  expect(first.template['@type']).toBe('https://schema.metadatacenter.org/core/Template');
  expect(first.template['schema:name']).toBe('Untitled Template');
});

test('hands CEE a read-only configuration', async ({ page }) => {
  await openDesigner(page, '?cee=stub');
  await openPreview(page);

  await expect.poll(async () => (await mounts(page)).length).toBeGreaterThan(0);

  // The designer is where a template is changed, so a preview that took input
  // would be collecting answers nothing keeps.
  const [first] = await mounts(page);
  expect(first.config.readOnlyMode).toBe(true);
});

test('replaces the editor when the template changes', async ({ page }) => {
  await openDesigner(page, '?cee=stub');
  const panel = await openPreview(page);
  await expect.poll(async () => (await mounts(page)).length).toBeGreaterThan(0);

  await templateName(page).fill('Renamed');

  // CEE takes one assignment to `templateObject` and reports and ignores a
  // second, so following an edit means a new element rather than a new template
  // on the old one.
  await expect.poll(async () => (await mounts(page)).at(-1)?.template['schema:name']).toBe('Renamed');
  await expect(panel.locator('cedar-embeddable-editor')).toHaveCount(1);
});

test('rebuilds once for a burst of typing, not once per keystroke', async ({ page }) => {
  await openDesigner(page, '?cee=stub');
  await openPreview(page);
  await expect.poll(async () => (await mounts(page)).length).toBeGreaterThan(0);

  const before = (await mounts(page)).length;
  await templateName(page).pressSequentially('Study', { delay: 30 });
  await expect.poll(async () => (await mounts(page)).at(-1)?.template['schema:name']).toContain('Study');

  // Booting a form renderer per character is what the quiet period exists to
  // prevent: five keystrokes must not mean five editors.
  expect((await mounts(page)).length - before).toBeLessThan(5);
});

test('says so when the host has not loaded CEE', async ({ page }) => {
  await openDesigner(page);
  const panel = await openPreview(page);

  await expect(panel).toContainText('cedar-embeddable-editor');
  await expect(panel.locator('cedar-embeddable-editor')).toHaveCount(0);
});
