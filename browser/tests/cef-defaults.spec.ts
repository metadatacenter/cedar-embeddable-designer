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
    const summary = page.locator('app-field-summary .cee-spec-box');
    await expect(summary).toContainText('default');
    await expect(summary).toContainText(text.replace(/\s+/g, ' '));
    await expect(input).toHaveValue(text);
    const saved = await currentTemplate(page);
    await page.evaluate((template) => {
      (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = template;
    }, saved);
    await expect(page.locator('app-field-card').first().locator('.settings-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await openSettings(page.locator('app-field-card').first());
    await expect(input).toHaveValue(text);
    await input.fill('');
    await expect.poll(async () => (await constraints(page))['defaultValue']).toBeUndefined();
    await expect(summary).not.toContainText('default');
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
    await expect(page.locator('app-field-summary .cee-spec-box')).toContainText('default ' + wanted.join(' · '));
    if (type === 'singleChoiceList' || type === 'multipleChoiceList') {
      await expect(control.getByRole('button', { name: 'Clear', exact: true })).toHaveCount(
        type === 'singleChoiceList' ? 1 : 0,
      );
    }
  });
}

test('time default comes from time segments and restores on reopen', async ({ page }) => {
  const control = await openField(page, 'time');
  await control.getByRole('textbox', { name: 'Hour', exact: true }).fill('14');
  await control.getByRole('textbox', { name: 'Minute', exact: true }).fill('30');
  await control.getByRole('textbox', { name: 'Minute', exact: true }).press('Tab');
  await expect.poll(async () => (await constraints(page))['defaultValue']).toBe('14:30');
  await expect(page.locator('app-field-summary .cee-spec-box')).toContainText('default 14:30');
  const saved = await currentTemplate(page);
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = template;
  }, saved);
  await expect(page.locator('app-field-card').first().locator('.settings-toggle')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
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
    const input = control.locator('input').first();
    await input.click();
    await expect(input).toBeFocused();
    await page.keyboard.type('Sample');
    await page.getByRole('option', { name: /Sample record/ }).click();
    await expect.poll(async () => (await constraints(page))['defaultValue']).toBe(iri);
    await expect(page.locator('app-field-summary .cee-spec-box')).toContainText('default ' + iri);
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
  const chooser = control.getByRole('button', { name: 'Edit default term' });
  const constraintEdit = page.getByRole('button', { name: 'Edit controlled-term constraints' });
  for (const property of ['fontSize', 'fontWeight', 'color', 'lineHeight', 'textUnderlineOffset'] as const) {
    const expected = await constraintEdit.evaluate((node, key) => getComputedStyle(node)[key], property);
    await expect.poll(() => chooser.evaluate((node, key) => getComputedStyle(node)[key], property)).toBe(expected);
  }
  const constraintBox = page.locator('app-controlled-term-config .cee-spec-box');
  const previewBox = page.locator('app-field-summary .cee-spec-box');
  for (const property of ['fontSize', 'minHeight', 'borderRadius'] as const) {
    const expected = await previewBox.evaluate((node, key) => getComputedStyle(node)[key], property);
    await expect
      .poll(() => constraintBox.evaluate((node, key) => getComputedStyle(node)[key], property))
      .toBe(expected);
  }
  const valueBox = (await control.locator('.default-value-control').boundingBox())!;
  const actionBox = (await chooser.boundingBox())!;
  expect(actionBox.x).toBeGreaterThanOrEqual(valueBox.x + valueBox.width);
  expect(Math.abs(actionBox.y + actionBox.height / 2 - valueBox.y - valueBox.height / 2)).toBeLessThan(2);
  await control.getByRole('button', { name: 'Edit default term' }).click();
  await control.locator('#stub-pick').click();
  await expect
    .poll(async () => (await constraints(page))['defaultValue'])
    .toEqual({ termUri: 'http://purl.obolibrary.org/obo/DOID_162', 'rdfs:label': 'cancer' });
  await expect(page.locator('app-field-summary .cee-spec-box')).toContainText(/default.*cancer/i);
  expect(checked).toBe(true);
  await page.setViewportSize({ width: 375, height: 900 });
  const narrowValue = (await control.locator('.default-value-control').boundingBox())!;
  const narrowActions = (await control.locator('.default-value-actions').boundingBox())!;
  expect(narrowActions.y).toBeGreaterThanOrEqual(narrowValue.y + narrowValue.height);
  expect(narrowActions.x + narrowActions.width).toBeCloseTo(narrowValue.x + narrowValue.width, 0);

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
  await control.getByRole('button', { name: 'Edit default term' }).click();
  const picker = control.locator('cedar-embeddable-term-picker');
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
    const control = await openField(
      page,
      type,
      type === 'date' ? { temporal: { type: 'xsd:date', granularity: 'year' } } : {},
    );
    const settings = page.locator('app-field-settings');
    const neighbor = settings.getByRole('combobox', {
      name: type === 'number' ? 'Datatype' : 'Temporal type',
      exact: true,
    });
    const defaultBox =
      type === 'number' ? control.locator('input').first() : control.locator('.mat-mdc-text-field-wrapper').first();
    await expect(defaultBox).toBeVisible();
    await expect.poll(async () => (await defaultBox.boundingBox())!.height).toBe(36);
    await expect
      .poll(async () => (await defaultBox.boundingBox())!.height)
      .toBe((await neighbor.boundingBox())!.height);
    const input = control.locator('input').first();
    await expect(input).toHaveCSS('font-size', await neighbor.evaluate((el) => getComputedStyle(el).fontSize));
    await expect(input).toHaveCSS('font-weight', await neighbor.evaluate((el) => getComputedStyle(el).fontWeight));
    if (type === 'number') {
      expect((await defaultBox.boundingBox())!.y).toBe((await neighbor.boundingBox())!.y);
      await expect(input).toHaveCSS(
        'border-radius',
        await neighbor.evaluate((el) => getComputedStyle(el).borderRadius),
      );
    }
  });
}

test('Display controls use the standard CEE scale', async ({ page }) => {
  await openField(page, 'number');
  const panel = await openSettings(page.locator('app-field-card').first(), 'Display');
  for (const input of await panel.locator('input:not([type="checkbox"])').all()) {
    await expect(input).toHaveCSS('height', '36px');
    // Authoring and CEE use the same readable body scale.
    await expect(input).toHaveCSS('font-size', '14px');
  }
});

for (const host of ['CED', 'CEFD']) {
  test(`${host} passes inherited density overrides to native settings and nested CEF`, async ({ page }) => {
    if (host === 'CED') {
      await openField(page, 'date');
    } else {
      await page.goto('/field-host.html');
      await page.addScriptTag({ path: process.env.CEF_BUNDLE! });
      await page.getByRole('button', { name: 'Temporal', exact: true }).click();
      await page.getByRole('textbox', { name: 'Field name', exact: true }).fill('Date field');
      await openSettings(page.locator('app-field-card'), 'Constraints');
    }
    const native = page.getByRole('combobox', { name: 'Temporal type', exact: true });
    const cef = page.locator('app-field-default-value cedar-embeddable-field');
    const cefBox = cef.locator('.mat-mdc-text-field-wrapper').first();
    await expect.poll(async () => (await cefBox.boundingBox())!.height).toBe(36);
    await page.evaluate(() => {
      document.body.style.setProperty('--cedar-control-height', '44px');
      document.body.style.setProperty('--cedar-control-font-size', '16px');
      document.body.style.setProperty('--cedar-control-line-height', '24px');
      document.body.style.setProperty('--cedar-control-radius', '9px');
      document.body.style.setProperty('--cedar-control-border', '#654321');
      document.body.style.setProperty('--cedar-control-focus', '#663399');
    });
    await expect(native).toHaveCSS('height', '44px');
    await expect(native).toHaveCSS('font-size', '16px');
    await expect(native).toHaveCSS('border-radius', '9px');
    await expect(native).toHaveCSS('border-top-color', 'rgb(101, 67, 33)');
    await page.keyboard.press('Tab');
    await native.focus();
    await expect(native).toHaveCSS('outline-color', 'rgb(102, 51, 153)');
    await expect(native).toHaveCSS('outline-width', '2px');
    await expect(native).toHaveCSS('outline-offset', '2px');
    await expect.poll(async () => (await cefBox.boundingBox())!.height).toBe(44);
    await expect(cef.locator('input').first()).toHaveCSS('font-size', '16px');
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(native).toBeVisible();
    await expect(cefBox).toBeVisible();
    await page.evaluate(() => document.body.removeAttribute('style'));
    await expect(native).toHaveCSS('height', '36px');
    await expect.poll(async () => (await cefBox.boundingBox())!.height).toBe(36);
  });
}

for (const [type, invalid] of [
  ['email', 'e'],
  ['link', 'not a URL'],
] as const) {
  test(`${type} default reports one specific validation error`, async ({ page }) => {
    const control = await openField(page, type);
    const input = control.locator('input').first();
    if (type === 'email') expect((await input.getAttribute('placeholder')) || '').toBe('');
    await input.fill(invalid);
    await input.press('Tab');
    await expect(control).not.toContainText('Enter a valid default value.');
    await expect(control.locator('mat-error, .ced-field-error')).toHaveCount(1);
    expect((await constraints(page))['defaultValue']).toBeUndefined();
    await input.fill(type === 'email' ? 'person@example.org' : 'https://example.org');
    await input.press('Tab');
    await expect(control.locator('mat-error, .ced-field-error')).toHaveCount(0);
  });
}

for (const [type, granularity] of [
  ['xsd:date', 'year'],
  ['xsd:date', 'month'],
  ['xsd:date', 'day'],
  ['xsd:dateTime', 'minute'],
  ['xsd:dateTime', 'second'],
  ['xsd:dateTime', 'decimalSecond'],
  ['xsd:time', 'minute'],
  ['xsd:time', 'second'],
  ['xsd:time', 'decimalSecond'],
] as const) {
  test(`${type} ${granularity} default controls center their icons`, async ({ page }) => {
    const control = await openField(page, type === 'xsd:time' ? 'time' : 'date', {
      temporal: { type, granularity, timezoneEnabled: true, inputTimeFormat: '24h' },
    });
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      const toggle = control.locator('mat-datepicker-toggle');
      if (type !== 'xsd:time') {
        const box = (await control.locator('.cee-temporal-date .mat-mdc-text-field-wrapper').boundingBox())!;
        const icon = (await toggle.locator('mat-icon').boundingBox())!;
        expect(Math.abs(icon.y + icon.height / 2 - box.y - box.height / 2)).toBeLessThanOrEqual(1);
      } else await expect(toggle).toHaveCount(0);
    }
  });
}

test('radio default selection and clearing keep every option stationary', async ({ page }) => {
  const control = await openField(page, 'multipleChoice');
  const rows = control.locator('.choice-option-row');
  const geometry = () =>
    rows.evaluateAll((nodes) =>
      nodes.map((node) => {
        const { y, height } = node.getBoundingClientRect();
        return { y, height };
      }),
    );
  const before = await geometry();
  for (const name of ['A', 'B']) {
    await control.getByRole('radio', { name, exact: true }).check();
    await expect.poll(geometry).toEqual(before);
  }
  await control.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect.poll(geometry).toEqual(before);
});

for (const type of ['checkboxes', 'multipleChoice', 'singleChoiceList', 'multipleChoiceList']) {
  test(`${type} option text and row spacing match default choices and host overrides`, async ({ page }) => {
    await openField(page, type);
    const card = page.locator('app-field-card').first();
    await openSettings(card, 'Constraints');
    if (type === 'checkboxes') await expect(card.getByRole('tab', { name: 'Occurrences' })).toHaveCount(0);
    const option = card.getByRole('textbox', { name: 'Option 1', exact: true });
    const isList = type.endsWith('List');
    if (isList) await card.locator('app-field-default-value').getByRole('combobox').click();
    const labels = isList
      ? page.locator('.mat-mdc-option .mdc-list-item__primary-text')
      : card.locator('app-field-default-value .mdc-label');
    await expect(labels.first()).toBeVisible();
    for (const override of [false, true]) {
      if (override) {
        await page.locator('cedar-embeddable-designer').evaluate((host) => {
          const style = (host as HTMLElement).style;
          style.setProperty('--cedar-control-font-size', '16px');
          style.setProperty('--cedar-control-line-height', '28px');
          style.setProperty('--cedar-choice-row-height', '36px');
        });
      }
      for (const property of ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color']) {
        await expect(option).toHaveCSS(
          property,
          await labels.first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property),
        );
      }
      await expect(option).toHaveCSS('font-size', override ? '16px' : '14px');
      const rows = card.locator('.choice-option-row');
      const a = (await rows.nth(0).boundingBox())!;
      const b = (await rows.nth(1).boundingBox())!;
      expect(b.y - a.y).toBe(override ? 36 : 28);
      // Overlay opening animates its scale; wait for the settled row geometry.
      await expect
        .poll(async () => {
          const x = (await labels.nth(0).boundingBox())!;
          const y = (await labels.nth(1).boundingBox())!;
          return Math.abs(b.y - a.y - (y.y - x.y));
        })
        .toBeLessThan(0.1);
    }
  });
}

for (const type of ['singleChoiceList', 'multipleChoiceList']) {
  test(`${type} long default labels grow beyond the shared minimum without clipping`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    const label = 'An option with a long descriptive label that must wrap onto several lines';
    const control = await openField(page, type, { options: [label, 'Short'] });
    await control.getByRole('combobox').click();
    const option = page.getByRole('option', { name: label, exact: true });
    const text = option.locator('.mdc-list-item__primary-text');
    await expect(option).toBeVisible();
    const metrics = await text.evaluate((el) => ({ height: el.clientHeight, content: el.scrollHeight }));
    expect(metrics.height).toBeGreaterThan(28);
    expect(metrics.content).toBeLessThanOrEqual(metrics.height);
  });
}
