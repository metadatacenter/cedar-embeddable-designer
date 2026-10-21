import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  addElementFixture,
  applyPreset,
  child,
  currentTemplate,
  nestFixtureFields,
  openDesigner,
  openSettings,
} from './support';

type Kind = 'field' | 'element';
type Relation = 'linked' | 'copied';

/** A repository boundary, deliberately capable of returning late, incomplete or inconsistent answers. */
async function prepare(page: Page, kind: Kind, relation: Relation, answer: unknown, published = true) {
  const designer = await openDesigner(page);
  if (kind === 'element') {
    await applyPreset(page, 'modular');
    await addElementFixture(page);
    await nestFixtureFields(page, ['Element']);
  }
  const key = kind === 'field' ? 'Title' : 'Element';
  const newer = await page.evaluate(
    ({ key, relation, answer, published }) => {
      const host = document.querySelector('cedar-embeddable-designer') as any;
      const template = structuredClone(host.currentTemplate);
      template['schema:name'] = 'Version journey';
      const held = template.properties[key].items ?? template.properties[key];
      const original = held['@id'];
      const newer = `${original}-release`;
      const next = {
        ...structuredClone(held),
        '@id': newer,
        'bibo:status': published ? 'bibo:published' : 'bibo:draft',
        'pav:version': '1.3.0',
      };
      delete next['pav:derivedFrom'];
      Object.assign(
        held,
        relation === 'linked'
          ? { 'bibo:status': 'bibo:published', 'pav:version': '1.2.0' }
          : {
              '@id': `${original}-copy`,
              'bibo:status': 'bibo:draft',
              'pav:version': '0.0.1',
              'pav:derivedFrom': original,
            },
      );
      if (relation === 'linked') delete held['pav:derivedFrom'];
      const state = ((window as any).__versionJourney = {
        answer,
        next,
        loads: 0,
        checks: [] as any[],
        pending: false,
        replies: [] as any[],
        listing: [
          { id: newer, name: key, version: '1.3.0', publicationStatus: next['bibo:status'] },
          { id: original, name: key, version: '1.2.0', publicationStatus: 'bibo:published' },
        ],
      });
      host.childSource = {
        search: async () => ({ results: [] }),
        versions: async () => state.listing,
        load: async (result: { id: string }) => {
          state.loads++;
          if (result.id !== newer) throw new Error('Unexpected candidate');
          return state.next;
        },
        compatibility: async (current: any, candidate: any) => {
          state.checks.push({ current: structuredClone(current), candidate: structuredClone(candidate) });
          // The deliberate disregard for aborts proves that CED itself rejects late replies.
          if (state.pending) return new Promise((resolve) => state.replies.push(resolve));
          if (state.answer === 'failure') throw new Error('Assessment unavailable');
          return state.answer;
        },
      };
      host.artifact = template;
      return newer;
    },
    { key, relation, answer, published },
  );
  const expectedId = newer.replace(/-release$/, relation === 'copied' ? '-copy' : '');
  await expect.poll(async () => child(await currentTemplate(page), key)['@id']).toBe(expectedId);
  await expect(designer.getByText(/fix before saving/)).toHaveCount(0);
  const settings =
    kind === 'field' ? designer.locator('app-field-card').first() : designer.locator('app-element-card').first();
  return { designer, settings, key, newer };
}

async function versionPanel(settings: Locator, kind: Kind) {
  if (kind === 'field') return openSettings(settings, 'Version');
  await settings.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  const toggle = settings.locator('.settings-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await settings.getByRole('tab', { name: 'Version', exact: true }).click();
  return settings.getByRole('tabpanel', { name: 'Version', exact: true });
}

const assessments = [
  { name: 'compatible', answer: { compatible: true }, allowed: true, verdict: 'compatible' },
  {
    name: 'unknown compatibility with no instances',
    answer: { compatible: null, invalidatedInstances: 0 },
    allowed: true,
    verdict: 'unknown',
  },
  {
    name: 'unknown compatibility with instances',
    answer: { compatible: null, invalidatedInstances: 2 },
    allowed: false,
    verdict: 'unknown',
  },
  {
    name: 'breaking with zero affected instances',
    answer: { compatible: false, invalidatedInstances: 0 },
    allowed: true,
    verdict: 'breaking',
  },
  {
    name: 'breaking with existing instances',
    answer: { compatible: false, invalidatedInstances: 2 },
    allowed: false,
    verdict: 'blocked',
  },
  { name: 'missing instance impact', answer: { compatible: false }, allowed: false, verdict: 'unknown' },
  {
    name: 'fractional instance impact',
    answer: { compatible: false, invalidatedInstances: 0.5 },
    allowed: false,
    verdict: 'unknown',
  },
  {
    name: 'contradictory compatibility',
    answer: { compatible: true, invalidatedInstances: 1 },
    allowed: false,
    verdict: 'unknown',
  },
  { name: 'failed assessment', answer: 'failure', allowed: false, verdict: 'unknown' },
] as const;

for (const kind of ['field', 'element'] as const) {
  for (const relation of ['linked', 'copied'] as const) {
    for (const assessment of assessments) {
      test(`${relation} ${kind}: ${assessment.name} governs replacement without changing placement`, async ({
        page,
      }) => {
        const { settings, key, newer } = await prepare(page, kind, relation, assessment.answer);
        const before = await currentTemplate(page);
        if (kind === 'field' && relation === 'linked' && assessment.name === 'compatible')
          await page.screenshot({ path: test.info().outputPath('ordinary-editor.png'), fullPage: true });
        const panel = await versionPanel(settings, kind);
        const action = panel.getByRole('button', {
          name: relation === 'linked' ? /^Upgrade to/ : /^Replace with origin/,
        });
        if (!assessment.allowed) {
          await expect(
            panel.getByText(
              assessment.verdict === 'blocked'
                ? 'Upgrading would invalidate 2 instances of this template. Create a new version of the template to upgrade.'
                : 'Whether it is compatible could not be checked.',
            ),
          ).toBeVisible();
          await expect(action).toHaveCount(0);
          await expect(panel.getByRole('dialog')).not.toBeVisible();
          if (kind === 'field' && relation === 'copied' && assessment.name === 'missing instance impact')
            await page.screenshot({ path: test.info().outputPath('unknown-impact.png'), fullPage: true });
          expect(await currentTemplate(page)).toEqual(before);
          return;
        }
        await expect(action).toHaveText(
          `${relation === 'linked' ? 'Upgrade to' : 'Replace with origin'} v1.3.0${assessment.verdict === 'unknown' ? '' : ` (${assessment.verdict})`}`,
        );
        await expect(panel.getByText('Whether it is compatible could not be checked.')).toHaveCount(
          assessment.verdict === 'unknown' ? 1 : 0,
        );
        if (kind === 'field' && relation === 'linked' && assessment.name === 'compatible')
          await page.screenshot({ path: test.info().outputPath('compatible-version.png'), fullPage: true });
        await action.click();
        if (relation === 'copied') {
          const dialog = panel.getByRole('dialog');
          await expect(dialog).toBeVisible();
          expect(await currentTemplate(page)).toEqual(before);
          await dialog.getByRole('button', { name: 'Replace', exact: true }).click();
        }
        await expect.poll(async () => child(await currentTemplate(page), key)['@id']).toBe(newer);
        const after = await currentTemplate(page);
        expect(child(after, key)).toMatchObject({ 'pav:version': '1.3.0', 'bibo:status': 'bibo:published' });
        expect(after['@context']).toEqual(before['@context']);
        expect(after._ui).toEqual(before._ui);
        expect(after.required).toEqual(before.required);
        expect(Object.keys(after.properties as object)).toEqual(Object.keys(before.properties as object));
        for (const [sibling, value] of Object.entries(before.properties as object)) {
          if (sibling !== key) expect((after.properties as any)[sibling]).toEqual(value);
        }
        if (kind === 'element') expect(child(after, key).properties).toEqual(child(before, key).properties);
        // The host can store and reopen the resulting definition without losing its identity or placement.
        await page.evaluate((artifact) => {
          (document.querySelector('cedar-embeddable-designer') as any).artifact = artifact;
        }, after);
        await expect.poll(() => currentTemplate(page)).toEqual(after);
      });
    }
  }
}

for (const kind of ['field', 'element'] as const) {
  test(`${kind}: a copy selects a published release ahead of a newer draft`, async ({ page }) => {
    const { settings, key, newer } = await prepare(page, kind, 'copied', { compatible: true });
    await page.evaluate(() => {
      (window as any).__versionJourney.listing.unshift({
        id: 'https://repo.metadatacenter.org/draft',
        name: 'Unfinished',
        version: '2.0.0',
        publicationStatus: 'bibo:draft',
      });
    });
    const panel = await versionPanel(settings, kind);
    const replace = panel.getByRole('button', { name: 'Replace with origin v1.3.0 (compatible)', exact: true });
    await expect(replace).toBeVisible();
    await expect(panel.getByRole('button', { name: /v2\.0\.0/ })).toHaveCount(0);
    await replace.click();
    await panel.getByRole('dialog').getByRole('button', { name: 'Replace', exact: true }).click();
    await expect.poll(async () => child(await currentTemplate(page), key)['@id']).toBe(newer);
  });

  test(`${kind}: a copy with only draft sources offers no replacement`, async ({ page }) => {
    const { settings } = await prepare(page, kind, 'copied', { compatible: true }, false);
    await page.evaluate(() => {
      const state = (window as any).__versionJourney;
      state.listing = state.listing.map((item: any) => ({ ...item, publicationStatus: 'bibo:draft' }));
    });
    const before = await currentTemplate(page);
    const panel = await versionPanel(settings, kind);
    await expect(panel.getByText('Looking for newer versions.')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /^Replace with origin/ })).toHaveCount(0);
    expect(await currentTemplate(page)).toEqual(before);
    expect(await page.evaluate(() => (window as any).__versionJourney.loads)).toBe(0);
  });

  test(`${kind}: a sibling edit while assessment is pending rejects the old reply and assesses again`, async ({
    page,
  }) => {
    const { designer, settings } = await prepare(page, kind, 'copied', { compatible: true });
    await page.evaluate(() => {
      (window as any).__versionJourney.pending = true;
    });
    const panel = await versionPanel(settings, kind);
    await expect(panel.getByText('Checking whether it is compatible.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__versionJourney.replies.length)).toBe(1);
    // Root fields remain editable while this child's Version tab stays open.
    const fields = designer.locator('app-field-card');
    const rootSibling = kind === 'field' ? fields.nth(1) : fields.first();
    await rootSibling.getByRole('textbox', { name: 'Enter field name', exact: true }).fill('Edited sibling');
    await expect.poll(() => page.evaluate(() => (window as any).__versionJourney.replies.length)).toBeGreaterThan(1);
    await page.evaluate(() => {
      const state = (window as any).__versionJourney;
      for (const reply of state.replies.slice(1)) reply({ compatible: false, invalidatedInstances: 2 });
    });
    await expect(panel.getByText(/Upgrading would invalidate 2 instances/)).toBeVisible();
    await page.evaluate(() => {
      (window as any).__versionJourney.replies[0]({ compatible: true });
    });
    await expect(panel.getByRole('button', { name: /^Replace with origin/ })).toHaveCount(0);
    await expect(panel.getByText(/Upgrading would invalidate 2 instances/)).toBeVisible();
    expect(JSON.stringify(await currentTemplate(page))).toContain('Edited sibling');
  });
}

test('editing a copy retires its verdict, and reopening Version reloads and reassesses the candidate', async ({
  page,
}) => {
  const { settings, key } = await prepare(page, 'field', 'copied', { compatible: true });
  let panel = await versionPanel(settings, 'field');
  await expect(panel.getByRole('button', { name: /^Replace with origin/ })).toBeVisible();
  const presentation = await openSettings(settings, 'Presentation');
  await presentation.getByLabel('Field name', { exact: true }).fill('Customized field');
  await page.evaluate(() => {
    const state = (window as any).__versionJourney;
    state.next['schema:description'] = 'Fresh repository representation';
    state.answer = { compatible: false, invalidatedInstances: 3 };
  });
  panel = await versionPanel(settings, 'field');
  await expect(panel.getByText(/Upgrading would invalidate 3 instances/)).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Replace with origin/ })).toHaveCount(0);
  const state = await page.evaluate(() => {
    const state = (window as any).__versionJourney;
    return { loads: state.loads, assessment: state.checks.at(-1) };
  });
  expect(state.loads).toBeGreaterThanOrEqual(2);
  expect(state.assessment.current['schema:name']).toBe('Customized field');
  expect(state.assessment.candidate['schema:description']).toBe('Fresh repository representation');
  expect(child(await currentTemplate(page), key)['schema:name']).toBe('Customized field');
});
