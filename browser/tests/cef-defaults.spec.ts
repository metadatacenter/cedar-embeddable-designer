import { fieldNode, newNodeId } from '../../src/app/core/model/container-draft';
import { expect, test, Page } from '@playwright/test';
import { buildTemplate, templateToJson, newContainer, buildContainer } from '../../src/app/core/model/cedar-template';
import { Field } from '../../src/app/core/models/types';
import { openSettings, applyPreset, child, currentTemplate, openDesigner, openPreview } from './support';

// CI supplies a pinned real sibling; local runs opt in by setting CEF_BUNDLE.
async function openField(page: Page, type: string, extra: Partial<Field> = {}, query = '', loadBundle = true) {
  await openDesigner(page, query);
  if (loadBundle) {
    await page.addScriptTag({ path: process.env.CEF_BUNDLE! });
    await page.waitForFunction(() => !!customElements.get('cedar-embeddable-field'));
  }
  const template = templateToJson(
    buildTemplate({
      name: 'Defaults',
      description: '',
      identifier: 'urn:template:defaults',
      version: '0.0.1',
      fields: [
        {
          id: 1,
          type,
          name: 'Value',
          status: 'required',
          allowMultiple: false,
          options: ['A', 'B'],
          defaultValue: { kind: 'none' },
          ...extra,
        },
      ],
    }),
  );
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = template;
  }, template);
  await applyPreset(page, 'semantic');
  await openSettings(page.locator('app-field-card').first());
  return page.locator('app-field-default-value');
}
async function constraints(page: Page) {
  return child(await currentTemplate(page), 'Value')['_valueConstraints'] as Record<string, unknown>;
}

for (const [type, text, stored] of [
  ['paragraph', 'First line\nSecond line', 'First line\nSecond line'],
  ['email', 'author@example.org', 'author@example.org'],
  ['phone', '+1 555 123 4567', '+1 555 123 4567'],
  ['link', 'https://example.org/item', 'https://example.org/item'],
  ['number', '0', '0'],
] as const) {
  test(`${type} default uses the real widget, saves, and clears`, async ({ page }) => {
    const control = await openField(page, type);
    const input = control.locator(type === 'paragraph' ? 'textarea' : 'input').first();
    await input.fill(text);
    await expect.poll(async () => (await constraints(page))['defaultValue']).toBe(stored);
    await input.press('Tab');
    await expect(input).toHaveValue(text);
    const saved = await currentTemplate(page);
    await page.evaluate((template) => {
      (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = template;
    }, saved);
    await openSettings(page.locator('app-field-card').first());
    await expect(input).toHaveValue(text);
    await input.fill('');
    await expect.poll(async () => (await constraints(page))['defaultValue']).toBeUndefined();
  });
}

test('real CEE preview honors deployment display overrides over field metadata', async ({ page }) => {
  await openField(page, 'shortText', { preferredLabel: 'Semantic label', helpText: 'Artifact description' });
  const section = await openSettings(page.locator('app-field-card').first(), 'Display');
  await section.getByLabel('Display label', { exact: true }).fill('Deployment heading');
  await section.getByLabel('Display description', { exact: true }).fill('Deployment help');
  const preview = await openPreview(page);
  await expect(preview.locator('.title-label')).toContainText('Deployment heading');
  await expect(preview.locator('.cee-field-spec-description')).toHaveText('Deployment help');
  await expect(preview.getByText('Semantic label', { exact: true })).toHaveCount(0);
});

for (const type of ['multipleChoice', 'checkboxes', 'singleChoiceList', 'multipleChoiceList']) {
  test(`${type} saves selected options as defaults`, async ({ page }) => {
    const control = await openField(page, type);
    if (type === 'multipleChoice') await control.getByRole('radio', { name: 'A', exact: true }).check();
    else if (type === 'checkboxes') {
      await control.getByRole('checkbox', { name: 'A', exact: true }).check();
      await control.getByRole('checkbox', { name: 'B', exact: true }).check();
    } else {
      await control.getByRole('combobox').click();
      await page.getByRole('option', { name: 'A', exact: true }).click();
      if (type === 'multipleChoiceList') {
        await page.getByRole('option', { name: 'B', exact: true }).click();
        await page.keyboard.press('Escape');
      }
    }
    const wanted = ['checkboxes', 'multipleChoiceList'].includes(type) ? ['A', 'B'] : ['A'];
    await expect
      .poll(async () =>
        ((await constraints(page))['literals'] as Array<{ label: string; selectedByDefault?: boolean }>)
          .filter((x) => x.selectedByDefault)
          .map((x) => x.label),
      )
      .toEqual(wanted);
  });
}

test('time default comes from time segments and restores on reopen', async ({ page }) => {
  const control = await openField(page, 'time');
  await control.getByRole('textbox', { name: 'Hour', exact: true }).fill('14');
  await control.getByRole('textbox', { name: 'Minute', exact: true }).fill('30');
  await control.getByRole('textbox', { name: 'Minute', exact: true }).press('Tab');
  await expect.poll(async () => (await constraints(page))['defaultValue']).toBe('14:30');
  const saved = await currentTemplate(page);
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = template;
  }, saved);
  await openSettings(page.locator('app-field-card').first());
  await expect(control.getByRole('textbox', { name: 'Hour', exact: true })).toHaveValue('14');
  await expect(control.getByRole('textbox', { name: 'Minute', exact: true })).toHaveValue('30');
});

test('a full datetime default retains its granularity and offset in CEF', async ({ page }) => {
  const control = await openField(page, 'date', {
    temporal: { type: 'xsd:dateTime', granularity: 'decimalSecond', timezoneEnabled: true, inputTimeFormat: '24h' },
    defaultValue: { kind: 'temporal', value: '2026-09-09T14:30:10.25+05:30' },
  });
  await expect(control.getByRole('textbox', { name: 'Hour', exact: true })).toHaveValue('14');
  await expect(control.getByRole('textbox', { name: 'Minute', exact: true })).toHaveValue('30');
  expect((await constraints(page))['defaultValue']).toBe('2026-09-09T14:30:10.25+05:30');
  await control.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect.poll(async () => (await constraints(page))['defaultValue']).toBeUndefined();
});

const authorities = [
  ['orcid', 'https://orcid.org/0000-0002-1825-0097'],
  ['ror', 'https://ror.org/03yrm5c26'],
  ['pfas', 'https://comptox.epa.gov/dashboard/chemical/details/DTXSID7020182'],
  ['rrid', 'https://scicrunch.org/resolver/RRID:AB_90755'],
  ['pubmed', 'https://pubmed.ncbi.nlm.nih.gov/12345678/'],
  ['nihGrantId', 'https://reporter.nih.gov/project-details/12345678'],
  ['doi', 'https://doi.org/10.1000/example'],
] as const;
for (const [type, iri] of authorities) {
  test(`${type} default uses the configured authority lookup`, async ({ page }) => {
    await page.route('**/fake-bridge/ext-auth/**', (route) =>
      route.fulfill({ json: { found: true, results: { [iri]: { name: 'Sample record' } } } }),
    );
    const control = await openField(page, type);
    await control.locator('input').first().fill('Sample');
    await page.getByRole('option', { name: /Sample record/ }).click();
    await expect.poll(async () => (await constraints(page))['defaultValue']).toBe(iri);
  });
}

test('controlled default uses the term picker and verifies field membership', async ({ page }) => {
  let checked = false;
  await page.route('**/fake-terminology/bioportal/integrated-search', async (route) => {
    checked = true;
    const body = route.request().postDataJSON();
    expect(body.parameterObject.valueConstraints.ontologies[0].acronym).toBe('DOID');
    await route.fulfill({ json: { collection: [{ '@id': 'http://purl.obolibrary.org/obo/DOID_162' }] } });
  });
  const control = await openField(
    page,
    'controlledTerms',
    {
      controlledTermConstraints: {
        constraints: [{ sourceType: 'ontology', ontologyId: 'DOID', ontologyName: 'Disease Ontology' }],
        actions: [],
      },
    },
    '?picker=stub',
  );
  await control.getByRole('button', { name: 'Choose default term' }).click();
  await control.locator('#stub-pick').click();
  await expect
    .poll(async () => (await constraints(page))['defaultValue'])
    .toEqual({ termUri: 'http://purl.obolibrary.org/obo/DOID_162', 'rdfs:label': 'cancer' });
  expect(checked).toBe(true);
  await control.getByRole('button', { name: 'Clear default' }).click();
  await expect.poll(async () => (await constraints(page))['defaultValue']).toBeUndefined();
});

test('the real picker selects a default within the field vocabulary', async ({ page }) => {
  test.skip(!process.env.PICKER_BUNDLE, 'PICKER_BUNDLE names the actual term-picker bundle.');
  const iri = 'http://purl.obolibrary.org/obo/DOID_162';
  await page.route('**/fake-terminology/search', async (route) => {
    const request = route.request().postDataJSON();
    expect(request.types).toEqual(['class']);
    expect(request.sources).toEqual([{ sourceAcronym: 'DOID', version: { id: 'pinned-release' } }]);
    await route.fulfill({
      json: {
        sources: [
          {
            sourceSystem: 'bioportal',
            sourceAcronym: 'DOID',
            sourceName: 'Disease Ontology',
            served: 'local',
            pinnable: true,
          },
        ],
        results: {
          class: {
            totalCount: 1,
            countCapped: false,
            page: 1,
            pageSize: 25,
            collection: [
              {
                type: 'class',
                sourceSystem: 'bioportal',
                sourceAcronym: 'DOID',
                termIri: iri,
                termType: 'class',
                termLabel: 'cancer',
                obsolete: false,
                hasChildren: false,
                descendantCount: 0,
                matchType: 'termLabel',
              },
            ],
          },
        },
      },
    });
  });
  let browsedPinnedRelease = false;
  await page.route('**/search/hierarchy*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('versionId')).toBe('pinned-release');
    browsedPinnedRelease = true;
    return route.fulfill({
      json: {
        sourceAcronym: 'DOID',
        termIri: iri,
        termLabel: 'cancer',
        children: [],
        childCount: 0,
        descendantCount: 0,
      },
    });
  });
  await page.route('**/fake-terminology/bioportal/integrated-search', (route) => {
    const constraints = route.request().postDataJSON().parameterObject.valueConstraints;
    expect(constraints.ontologies).toHaveLength(3);
    expect(constraints.actions).toHaveLength(1);
    return route.fulfill({ json: { collection: [{ '@id': iri }] } });
  });
  const control = await openField(page, 'controlledTerms', {
    controlledTermConstraints: {
      constraints: [
        {
          sourceType: 'ontology',
          ontologyId: 'DOID',
          ontologyName: 'Disease Ontology',
          version: { id: 'pinned-release' },
        },
        {
          sourceType: 'ontology',
          ontologyId: 'DOID',
          ontologyName: 'Disease Ontology',
          version: { id: 'pinned-release' },
        },
        {
          sourceType: 'ontology',
          ontologyId: 'DOID',
          ontologyName: 'Disease Ontology',
          version: { id: 'another-release' },
        },
      ],
      actions: [
        { action: 'delete', termUri: 'urn:excluded', sourceUri: 'urn:doid', source: 'DOID', type: 'OntologyClass' },
      ],
    },
  });
  await page.addScriptTag({ path: process.env.PICKER_BUNDLE! });
  await control.getByRole('button', { name: 'Choose default term' }).click();
  const picker = control.locator('cedar-term-picker');
  await expect(control.getByRole('dialog', { name: 'Choose default term' })).toBeVisible();
  await expect(picker.getByLabel('Search vocabulary and release').locator('option')).toHaveCount(2);
  await picker.locator('input[type=search]').fill('cancer');
  await expect(picker.locator('.tab')).toHaveCount(1);
  await picker.locator('.rowhead').first().click();
  await picker.locator('.child.pick').first().click();
  await expect.poll(() => browsedPinnedRelease).toBe(true);
  await page.screenshot({ path: '/tmp/ced-controlled-default-dialog.png' });
  await picker.locator('.child.pick').first().dblclick();
  await expect
    .poll(async () => (await constraints(page))['defaultValue'])
    .toEqual({ termUri: iri, 'rdfs:label': 'cancer' });
});

test('an unfinished controlled-term field stays controlled when reopened', async ({ page }) => {
  const control = await openField(page, 'controlledTerms');
  await expect(control.getByRole('status')).toContainText('Choose a vocabulary constraint');
  const before = await currentTemplate(page);
  expect(child(before, 'Value').properties).toHaveProperty('@id');
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = template;
  }, before);
  await openSettings(page.locator('app-field-card').first());
  await expect(page.locator('app-controlled-term-config')).toBeVisible();
});

test('loads CEF after opening a document without losing its saved default', async ({ page }) => {
  const control = await openField(
    page,
    'phone',
    { defaultValue: { kind: 'literal', value: '+1 555 123 4567' } },
    '',
    false,
  );
  expect(await page.evaluate(() => !!customElements.get('cedar-embeddable-field'))).toBe(false);
  await expect.poll(async () => (await constraints(page))['defaultValue']).toBe('+1 555 123 4567');
  await page.addScriptTag({ path: process.env.CEF_BUNDLE! });
  const input = control.locator('input').first();
  await expect(input).toHaveValue('+1 555 123 4567');
  await input.fill('+1 555 987 6543');
  await expect.poll(async () => (await constraints(page))['defaultValue']).toBe('+1 555 987 6543');
});

test('previews an element document through CEE while publishing element artifacts', async ({ page }) => {
  await openDesigner(page);
  await page.addScriptTag({ path: process.env.CEF_BUNDLE! });
  await page.waitForFunction(() => !!customElements.get('cedar-embeddable-editor'));
  const element = newContainer('element', 'Study element');
  element.children.push(
    fieldNode({
      id: newNodeId(),
      name: 'Element field',
      type: 'text',
      status: 'required',
      allowMultiple: false,
      options: [],
      defaultValue: { kind: 'none' },
    }),
  );
  await page.evaluate(
    (artifact) => {
      const designer = document.querySelector('cedar-embeddable-designer') as HTMLElement & { artifact: object };
      designer.artifact = artifact;
    },
    templateToJson(buildContainer(element)),
  );
  const preview = await openPreview(page);
  await expect(preview.locator('.title-label').filter({ hasText: 'Element field' })).toBeVisible();
  expect((await currentTemplate(page))['@type']).toBe('https://schema.metadatacenter.org/core/TemplateElement');
});

for (const type of ['number', 'date']) {
  test(`${type} default aligns with its neighboring settings controls`, async ({ page }) => {
    const control = await openField(page, type, type === 'date' ? { temporal: { type: 'xsd:date', granularity: 'year' } } : {});
    const settings = page.locator('app-field-settings');
    const neighbor = settings.locator('select').first();
    const defaultBox = type === 'number' ? control.locator('input').first() : control.locator('.mat-mdc-text-field-wrapper').first();
    await expect(defaultBox).toBeVisible();
    await expect.poll(async () => (await defaultBox.boundingBox())!.height).toBe(28);
    await expect.poll(async () => (await defaultBox.boundingBox())!.height).toBe((await neighbor.boundingBox())!.height);
    const input = control.locator('input').first();
    await expect(input).toHaveCSS('font-size', await neighbor.evaluate(el => getComputedStyle(el).fontSize));
    await expect(input).toHaveCSS('font-weight', await neighbor.evaluate(el => getComputedStyle(el).fontWeight));
    if (type === 'number') {
      expect((await defaultBox.boundingBox())!.y).toBe((await neighbor.boundingBox())!.y);
      await expect(input).toHaveCSS('border-radius', await neighbor.evaluate(el => getComputedStyle(el).borderRadius));
    }
  });
}

test('Display controls retain the compact authoring scale', async ({ page }) => {
  await openField(page, 'number');
  const panel = await openSettings(page.locator('app-field-card').first(), 'Display');
  for (const input of await panel.locator('input:not([type="checkbox"])').all()) {
    await expect(input).toHaveCSS('height', '28px');
    await expect(input).toHaveCSS('font-size', '11px');
  }
});
