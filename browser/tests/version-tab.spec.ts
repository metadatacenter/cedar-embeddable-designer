import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { currentTemplate, openDesigner, openSettings } from './support';

const NEWER = 'https://repo.metadatacenter.org/template-fields/version-tab-newer';

/**
 * Make the Title field a published field at 1.2.0 and give the designer a host whose repository
 * holds a newer published version, 1.3.0, which it judges compatible.
 */
async function linkTitle(page: Page, compatible = true): Promise<string> {
  return page.evaluate(
    ({ newer, compatible }) => {
      const host = document.querySelector('cedar-embeddable-designer') as any;
      const template = structuredClone(host.currentTemplate);
      const title = template.properties.Title;
      Object.assign(title, { 'bibo:status': 'bibo:published', 'pav:version': '1.2.0' });
      const upgraded = { ...structuredClone(title), '@id': newer, 'pav:version': '1.3.0' };
      const opened: string[] = [];
      (window as any).__opened = opened;
      host.childSource = {
        async search() {
          return { results: [] };
        },
        async load(result: { id: string }) {
          return structuredClone(result.id === newer ? upgraded : title);
        },
        async versions() {
          return [
            { id: newer, name: 'Title', version: '1.3.0', publicationStatus: 'bibo:published', owner: 'test1' },
            { id: title['@id'], name: 'Title', version: '1.2.0', publicationStatus: 'bibo:published', owner: 'test1' },
          ];
        },
        async compatibility() {
          return compatible ? { compatible: true } : { compatible: false, invalidatedInstances: 2 };
        },
        open(reference: { id: string }) {
          opened.push(reference.id);
        },
      };
      host.artifact = template;
      return title['@id'];
    },
    { newer: NEWER, compatible },
  );
}

test('a linked field shows its version and status on the Version tab and upgrades to a compatible version', async ({
  page,
}) => {
  const designer = await openDesigner(page);
  const original = await linkTitle(page);
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title['pav:version']).toBe('1.2.0');
  const card = designer.locator('app-field-card').first();

  const metadata = await openSettings(card, 'Metadata');
  await expect(metadata.locator('dt').filter({ hasText: /^Version$/ })).toHaveCount(0);
  await expect(metadata.locator('dt').filter({ hasText: /^Publication status$/ })).toHaveCount(0);

  const version = await openSettings(card, 'Version');
  const value = (label: string) =>
    version
      .locator('dt')
      .filter({ hasText: new RegExp(`^${label}$`) })
      .locator('+ dd');
  await expect(value('Version')).toHaveText('1.2.0');
  await expect(value('Publication status')).toHaveText('Published');
  await expect(value('Reuse')).toHaveText('Linked');
  await expect(value('Owner')).toHaveText('test1');
  await expect(version.getByText('This is Title v1.2.0.')).toBeVisible();
  await expect(version.getByText('v1.3.0 is the newest version.')).toBeVisible();
  await expect(version.getByRole('button')).toHaveText([
    'Open original',
    'Upgrade to v1.3.0 (compatible)',
    'Detach to edit',
  ]);
  // The accessibility suite audits every tab of a field made here; this audits a linked one, whose
  // tab has buttons. Two frames let the tab's render settle first.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);

  await version.getByRole('button', { name: 'Open original' }).click();
  expect(await page.evaluate(() => (window as any).__opened)).toEqual([original]);

  await version.getByRole('button', { name: 'Upgrade to v1.3.0 (compatible)' }).click();
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title['@id']).toBe(NEWER);
  // The child's key is how the template stores it, and an upgrade keeps it.
  expect(Object.keys((await currentTemplate(page)).properties as object)).toContain('Title');
  await expect(value('Version')).toHaveText('1.3.0');
  await expect(version.getByText('This is the newest version.')).toBeVisible();
});

test('a breaking version that would invalidate instances is not offered, and detaching makes an editable copy', async ({
  page,
}) => {
  const designer = await openDesigner(page);
  const original = await linkTitle(page, false);
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title['pav:version']).toBe('1.2.0');
  const card = designer.locator('app-field-card').first();
  const version = await openSettings(card, 'Version');
  await expect(
    version.getByText(
      'Upgrading would invalidate 2 instances of this template. Create a new version of the template to upgrade.',
    ),
  ).toBeVisible();
  await expect(version.getByRole('button')).toHaveText(['Open original', 'Detach to edit']);

  await version.getByRole('button', { name: 'Detach to edit' }).click();
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Title['pav:derivedFrom'])
    .toBe(original);
  const title = ((await currentTemplate(page)).properties as any).Title;
  expect(title['@id']).not.toBe(original);
  expect(title).toMatchObject({ 'bibo:status': 'bibo:draft', 'pav:version': '0.0.1' });
  await expect(
    version
      .locator('dt')
      .filter({ hasText: /^Reuse$/ })
      .locator('+ dd'),
  ).toHaveText('Copy');
  // The copy is editable, as a field made here is.
  const presentation = await openSettings(card, 'Presentation');
  await expect(presentation.getByLabel('Field name', { exact: true })).toBeEnabled();
});

test("the template's Version tab summarizes its linked children", async ({ page }) => {
  const designer = await openDesigner(page);
  await linkTitle(page);
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title['pav:version']).toBe('1.2.0');
  const settings = designer.locator('app-container-settings').first();
  const toggle = settings.locator('.settings-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(settings.getByRole('tab')).toHaveText(['Presentation', 'Annotations', 'Metadata', 'Version']);
  await settings.getByRole('tab', { name: 'Version', exact: true }).click();
  const panel = settings.getByRole('tabpanel', { name: 'Version', exact: true });
  await expect(panel.getByText('Linked and copied children')).toBeVisible();
  await expect(
    panel
      .locator('dt')
      .filter({ hasText: /^Title$/ })
      .locator('+ dd'),
  ).toContainText('Linked, v1.2.0. v1.3.0 is the newest version.');
  await panel.getByRole('button', { name: 'Upgrade all compatible' }).click();
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title['@id']).toBe(NEWER);
});
