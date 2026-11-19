import { expect, test } from '@playwright/test';
import nestedTemplate from '../../src/app/core/model/fixtures/corpus/template-028.json' with { type: 'json' };
import { currentTemplate, openDesigner, templateName } from './support';

/**
 * A stored definition in the form the designer writes it back.
 *
 * A schema title is derived from the artifact's name, and a literal the author has not selected may
 * be written with `selectedByDefault: false` or without the flag. Neither is content an import may
 * change, so both are left out of the comparison; everything else must come back as stored.
 */
function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entry]) => key !== 'title' && !(key === 'selectedByDefault' && entry === false))
      .map(([key, entry]) => [key, comparable(entry)]),
  );
}

test('opens an element-containing template without dropping nested content', async ({ page }) => {
  await openDesigner(page);
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as HTMLElement & { template: object }).template = template;
  }, nestedTemplate);
  await expect(page.locator('app-element-card').first()).toBeVisible();
  const saved = await currentTemplate(page);
  expect(saved['_ui']).toEqual(nestedTemplate['_ui']);
  // The top-level `_ui` names only the element. Its own `properties`, `_ui` and `required`, and the
  // definition of every field inside it, are what an import can lose.
  const nested = (document: Record<string, unknown>) =>
    (document['properties'] as Record<string, unknown>)['Read & Understood Catalog'];
  expect(comparable(nested(saved))).toEqual(comparable(nested(nestedTemplate)));
  const element = page.locator('app-container-editor').nth(1);
  const toggle = element.locator(':scope > .template-header-card .element-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(element.locator(':scope > .container-content')).toBeHidden();
  await toggle.click();
  await expect(element.locator(':scope > .container-content')).toBeVisible();
  expect(await currentTemplate(page)).toEqual(saved);
});

for (const published of [false, true]) {
  test(`preserves provenance and publication while ${published ? 'inspecting a published template' : 'editing a draft'}`, async ({
    page,
  }) => {
    const designer = await openDesigner(page);
    const original = await currentTemplate(page);
    const imported = {
      ...original,
      'bibo:status': published ? 'bibo:published' : 'bibo:draft',
      'pav:createdOn': '2026-09-01T00:00:00Z',
      'pav:createdBy': 'urn:test:creator',
    };
    await designer.evaluate((el: any, template) => {
      el.template = template;
    }, imported);
    if (published) {
      await expect(templateName(page)).toBeDisabled();
      const settings = designer.locator('app-container-settings');
      await settings.locator('.settings-toggle').click();
      await settings.getByRole('tab', { name: 'Metadata', exact: true }).click();
      await expect(settings.getByRole('tabpanel')).toContainText('2026-09-01T00:00:00Z');
    } else {
      await templateName(page).fill('Edited title');
      await templateName(page).blur();
    }
    await expect
      .poll(() => currentTemplate(page))
      .toMatchObject({
        'schema:name': published ? original['schema:name'] : 'Edited title',
        'bibo:status': imported['bibo:status'],
        'pav:createdOn': imported['pav:createdOn'],
        'pav:createdBy': imported['pav:createdBy'],
      });
  });
}
