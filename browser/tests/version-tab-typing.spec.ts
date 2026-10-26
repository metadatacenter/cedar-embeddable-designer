import { expect, test, type Page } from '@playwright/test';
import { currentTemplate, openDesigner, openSettings } from './support';

const STORED = 'https://repo.metadatacenter.org/templates/version-tab-typing';
const NEWER = 'https://repo.metadatacenter.org/template-fields/version-tab-typing-newer';

type Watched = Window & { __versionCalls: number; __versionTabChanges: number };

/**
 * Store the template under an identity, optionally make its Title a linked published field with a
 * newer version, and give it a host that answers a versions lookup after a delay, as a repository
 * does, counting each lookup it is asked for.
 */
async function storedTemplate(page: Page, linkTitle: boolean): Promise<void> {
  await page.evaluate(
    ({ stored, newer, linkTitle }) => {
      const host = document.querySelector('cedar-embeddable-designer') as any;
      const template = structuredClone(host.currentTemplate);
      Object.assign(template, { '@id': stored, 'pav:version': '0.0.1', 'bibo:status': 'bibo:draft' });
      const title = template.properties.Title;
      if (linkTitle) Object.assign(title, { 'bibo:status': 'bibo:published', 'pav:version': '1.2.0' });
      const watched = window as unknown as { __versionCalls: number };
      watched.__versionCalls = 0;
      host.childSource = {
        async search() {
          return { results: [] };
        },
        async load() {
          return structuredClone({ ...title, '@id': newer, 'pav:version': '1.3.0' });
        },
        async versions(reference: { id: string }) {
          watched.__versionCalls++;
          await new Promise((resolve) => setTimeout(resolve, 150));
          return reference.id === stored
            ? [{ id: stored, name: 'Template', version: '0.0.1', publicationStatus: 'bibo:draft', owner: 'test1' }]
            : [
                { id: newer, name: 'Title', version: '1.3.0', publicationStatus: 'bibo:published', owner: 'test1' },
                {
                  id: title['@id'],
                  name: 'Title',
                  version: '1.2.0',
                  publicationStatus: 'bibo:published',
                  owner: 'test1',
                },
              ];
        },
        async compatibility() {
          return { compatible: true };
        },
      };
      host.artifact = template;
    },
    { stored: STORED, newer: NEWER, linkTitle },
  );
}

/** Open the template's own Version tab, and count what changes in it from then on. */
async function watchTemplateVersionTab(page: Page) {
  const designer = page.locator('cedar-embeddable-designer');
  const settings = designer.locator('app-container-settings').first();
  const toggle = settings.locator('.settings-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await settings.getByRole('tab', { name: 'Version', exact: true }).click();
  const panel = settings.getByRole('tabpanel', { name: 'Version', exact: true });
  // Opening the tab looks the versions up; let those answers arrive before watching.
  await expect.poll(() => page.evaluate(() => (window as unknown as Watched).__versionCalls)).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await panel.evaluate((element) => {
    const watched = window as unknown as Watched;
    watched.__versionTabChanges = 0;
    // A closed replacement dialog names its field, so its text follows the name; nothing shows it.
    new MutationObserver((records) => {
      watched.__versionTabChanges += records.filter((record) => !record.target.parentElement?.closest('dialog')).length;
    }).observe(element, { childList: true, subtree: true, characterData: true });
  });
  return { panel, calls: () => page.evaluate(() => (window as unknown as Watched).__versionCalls) };
}

async function typeIntoSecondFieldName(page: Page): Promise<void> {
  const card = page.locator('cedar-embeddable-designer').locator('app-field-card').nth(1);
  await card
    .getByRole('textbox', { name: 'Enter field name', exact: true })
    .pressSequentially(' renamed', { delay: 40 });
}

test("typing a field name leaves the template's Version tab still and asks the host nothing", async ({ page }) => {
  await openDesigner(page);
  await storedTemplate(page, false);
  await expect.poll(async () => (await currentTemplate(page))['@id']).toBe(STORED);
  const { calls } = await watchTemplateVersionTab(page);
  const before = await calls();

  await typeIntoSecondFieldName(page);
  await page.waitForTimeout(800);

  expect(await calls()).toBe(before);
  expect(await page.evaluate(() => (window as unknown as Watched).__versionTabChanges)).toBe(0);
});

test("typing a field name rechecks a linked child's verdict once, after the typing pauses, and keeps its versions shown", async ({
  page,
}) => {
  const designer = await openDesigner(page);
  await storedTemplate(page, true);
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title['pav:version']).toBe('1.2.0');
  const panel = await openSettings(designer.locator('app-field-card').first(), 'Version');
  const newest = panel.getByText('The newest available published version is v1.3.0.', { exact: false });
  await expect(newest).toBeVisible();
  await page.waitForTimeout(400);
  const calls = () => page.evaluate(() => (window as unknown as Watched).__versionCalls);
  const before = await calls();

  await typeIntoSecondFieldName(page);
  // The versions stay while the edit's verdict is asked for again.
  await expect(newest).toBeVisible();
  await page.waitForTimeout(800);

  // One lookup for the linked child after the pause, not one per keystroke.
  expect(await calls()).toBe(before + 1);
  await expect(newest).toBeVisible();
});
