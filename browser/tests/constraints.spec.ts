import { expect, test } from '@playwright/test';
import { applyPreset, child, clickCentred, currentTemplate, openDesigner } from './support';

/**
 * Choosing what constrains a field, which is the designer's reason to exist.
 *
 * The constraint reached no template at all until the model library took over
 * serialization — the panel collected an ontology, a branch or a value set and
 * the exporter dropped every one of them. What fills the panel is
 * `<cedar-term-picker>`, a sibling component the host loads, so these tests stub
 * it: what is under test is the designer's half of that contract.
 */

/** Add a controlled-term field and open its constraint panel. */
async function openConstraintPanel(page: import('@playwright/test').Page) {
  const designer = await openDesigner(page, '?picker=stub');
  await applyPreset(page, 'semantic');
  await designer.getByRole('button', { name: /Add Field/ }).click();
  await designer.getByRole('button', { name: 'Controlled Terms', exact: true }).click();
  return designer.locator('app-controlled-term-config');
}

test('offers term search when the host has loaded the picker', async ({ page }) => {
  const panel = await openConstraintPanel(page);

  await expect(panel.getByRole('button', { name: /Edit controlled-term constraints/ })).toBeVisible();
});

test('says what is missing when the host has not loaded the picker', async ({ page }) => {
  const designer = await openDesigner(page);
  await applyPreset(page, 'semantic');
  await designer.getByRole('button', { name: /Add Field/ }).click();
  await designer.getByRole('button', { name: 'Controlled Terms', exact: true }).click();

  const panel = designer.locator('app-controlled-term-config');
  // A host that has not loaded the picker is a normal state rather than a fault,
  // so the panel names what it needs instead of offering a search that cannot run.
  await expect(panel).toContainText('cedar-term-picker');
  await expect(panel.getByRole('button', { name: /Edit controlled-term constraints/ })).toBeHidden();
});

test('says what is missing when no terminology server is configured', async ({ page }) => {
  const designer = await openDesigner(page, '?picker=stub&terminology=none');
  await applyPreset(page, 'semantic');
  await designer.getByRole('button', { name: /Add Field/ }).click();
  await designer.getByRole('button', { name: 'Controlled Terms', exact: true }).click();

  await expect(designer.locator('app-controlled-term-config')).toContainText('terminologyBaseUrl');
});

test('a chosen term becomes a constraint on the field', async ({ page }) => {
  const panel = await openConstraintPanel(page);
  await clickCentred(panel.getByRole('button', { name: /Edit controlled-term constraints/ }));

  await expect(page.locator('cedar-term-picker')).toBeVisible();
  await page.locator('#stub-pick').click();

  const constraints = child(await currentTemplate(page), 'Controlled Terms')['_valueConstraints'] as {
    classes: Array<Record<string, unknown>>;
  };
  expect(constraints.classes).toHaveLength(1);
  expect(constraints.classes[0]['uri']).toBe('http://purl.obolibrary.org/obo/DOID_162');
  expect(constraints.classes[0]['prefLabel']).toBe('cancer');
  expect(constraints.classes[0]['source']).toBe('DOID');
});

test('a chosen term keeps the version the author pinned', async ({ page }) => {
  const panel = await openConstraintPanel(page);
  await clickCentred(panel.getByRole('button', { name: /Edit controlled-term constraints/ }));
  await page.locator('#stub-pick').click();

  const constraints = child(await currentTemplate(page), 'Controlled Terms')['_valueConstraints'] as {
    classes: Array<Record<string, unknown>>;
  };
  // Without this the constraint resolves against whatever the terminology server
  // serves on the day it is read, which is not what the author chose.
  expect(constraints.classes[0]['version']).toEqual({
    id: 'sha256:8f0c1e',
    effectiveDate: '2026-06-30',
    declaredVersion: 'DOID 2026-06-30',
  });
});

test('choosing a term closes the picker', async ({ page }) => {
  const panel = await openConstraintPanel(page);
  await clickCentred(panel.getByRole('button', { name: /Edit controlled-term constraints/ }));
  await page.locator('#stub-pick').click();

  await expect(page.locator('cedar-term-picker')).toHaveCount(0);
});

test('the picker is told which field it is choosing for, and which server to ask', async ({ page }) => {
  const panel = await openConstraintPanel(page);
  await clickCentred(panel.getByRole('button', { name: /Edit controlled-term constraints/ }));

  const picker = page.locator('cedar-term-picker');
  expect(await picker.evaluate((node) => (node as unknown as { query: string }).query)).toBe('Controlled Terms');
  expect(await picker.evaluate((node) => (node as unknown as { terminologyBaseUrl: string }).terminologyBaseUrl)).toBe(
    'http://localhost:4598/fake-terminology/',
  );
});

test('reopening passes the existing set and additions preserve it', async ({ page }) => {
  const panel = await openConstraintPanel(page);
  for (let i = 0; i < 2; i++) {
    await clickCentred(panel.getByRole('button', { name: 'Edit controlled-term constraints' }));
    await page.locator('#stub-pick').click();
  }
  const constraints = child(await currentTemplate(page), 'Controlled Terms')['_valueConstraints'] as {
    classes: unknown[];
  };
  expect(constraints.classes).toHaveLength(2);
});

test('the real picker preserves saved actions and explicitly clears an invalid default', async ({ page }) => {
  test.skip(!process.env.PICKER_BUNDLE, 'PICKER_BUNDLE names the actual picker bundle.');
  const designer = await openDesigner(page);
  await page.addScriptTag({ path: process.env.PICKER_BUNDLE! });
  if (process.env.CEF_BUNDLE) await page.addScriptTag({ path: process.env.CEF_BUNDLE });
  const { buildTemplate, templateToJson } = await import('../../src/app/core/model/cedar-template');
  const template = templateToJson(
    buildTemplate({
      name: 'Constraints',
      description: '',
      identifier: 'urn:template',
      version: '0.0.1',
      fields: [
        {
          id: 1,
          name: 'Disease',
          type: 'controlledTerms',
          options: [],
          status: 'optional',
          allowMultiple: false,
          defaultValue: { kind: 'iri', iri: 'urn:cancer', label: 'Cancer' },
          controlledTermConstraints: {
            constraints: [
              {
                sourceType: 'ontology',
                ontologyId: 'DOID',
                ontologyName: 'Disease Ontology',
                uri: 'urn:doid',
                version: { id: 'original' },
              },
              {
                sourceType: 'ontology',
                ontologyId: 'NCIT',
                ontologyName: 'Cancer Thesaurus',
                uri: 'urn:ncit',
                version: { id: 'other' },
              },
            ],
            actions: [
              { action: 'delete', termUri: 'urn:cancer', sourceUri: 'urn:doid', source: 'DOID', type: 'OntologyClass' },
            ],
          },
        },
      ],
    }),
  );
  await page.evaluate((value) => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = value;
  }, template);
  await applyPreset(page, 'semantic');
  await page.route('**/fake-terminology/search', (route) =>
    route.fulfill({
      json: {
        query: 'Cancer',
        sources: [
          {
            sourceSystem: 'bioportal',
            sourceAcronym: 'DOID',
            sourceName: 'Disease Ontology',
            served: 'local',
            pinnable: true,
            version: { id: 'original' },
          },
        ],
        results: {
          class: {
            totalCount: 1,
            page: 1,
            pageSize: 25,
            countCapped: false,
            collection: [
              {
                type: 'class',
                sourceSystem: 'bioportal',
                sourceAcronym: 'DOID',
                termIri: 'urn:cancer',
                termLabel: 'Cancer',
                termType: 'class',
                obsolete: false,
                hasChildren: false,
                descendantCount: 0,
              },
            ],
          },
        },
      },
    }),
  );
  await page.route('**/fake-terminology/search/hierarchy*', (route) =>
    route.fulfill({
      json: {
        sourceAcronym: 'DOID',
        termIri: 'urn:cancer',
        termLabel: 'Cancer',
        path: [],
        children: [],
        childCount: 0,
        descendantCount: 0,
      },
    }),
  );
  let checked = false;
  await page.route('**/fake-terminology/bioportal/integrated-search', (route) => {
    const vc = route.request().postDataJSON().parameterObject.valueConstraints;
    expect(vc.ontologies.map((o: { version: { id: string } }) => o.version.id)).toEqual(['other']);
    expect(vc.actions).toEqual([
      { action: 'delete', termUri: 'urn:cancer', sourceUri: 'urn:doid', source: 'DOID', type: 'OntologyClass' },
    ]);
    checked = true;
    return route.fulfill({ json: { collection: [] } });
  });
  const panel = designer.locator('app-controlled-term-config');
  if (process.env.CEF_BUNDLE) {
    const summary = panel.locator('cedar-embeddable-field');
    await expect(summary.getByText(/Disease Ontology/)).toBeVisible();
    await expect(summary.getByText(/Cancer Thesaurus/)).toBeVisible();
    await expect(summary.locator('input')).toHaveCount(0);
  }
  await panel.getByRole('button', { name: 'Edit controlled-term constraints' }).click();
  const picker = panel.locator('cedar-term-picker');
  await expect(picker.locator('.constraint-table').first().locator('tbody tr')).toHaveCount(2);
  await picker.getByRole('button', { name: 'Remove constraint 1', exact: true }).click();
  await picker.getByRole('button', { name: 'Close without choosing', exact: true }).click();
  await expect(picker).toHaveCount(0);
  const cancelled = child(await currentTemplate(page), 'Disease')['_valueConstraints'] as { ontologies: unknown[] };
  expect(cancelled.ontologies).toHaveLength(2);
  await panel.getByRole('button', { name: 'Edit controlled-term constraints' }).click();
  await expect(picker.locator('.constraint-table').first().locator('tbody tr')).toHaveCount(2);

  await picker.getByRole('button', { name: 'Remove constraint 1', exact: true }).click();
  await picker.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('existing default is not permitted');
  expect(checked).toBe(true);
  const before = child(await currentTemplate(page), 'Disease')['_valueConstraints'] as Record<string, unknown>;
  expect(before['defaultValue']).toEqual({ termUri: 'urn:cancer', 'rdfs:label': 'Cancer' });
  await picker.locator('.constraint-set').evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.screenshot({ path: '/tmp/ced-real-constraints.png', fullPage: true });
  await panel.getByRole('button', { name: 'Clear default and apply constraints' }).click();
  await expect(picker).toHaveCount(0);
  const saved = child(await currentTemplate(page), 'Disease')['_valueConstraints'] as Record<string, unknown>;
  expect(saved['defaultValue']).toBeUndefined();
  expect(saved['actions']).toHaveLength(1);
  const final = child(await currentTemplate(page), 'Disease')['_valueConstraints'] as {
    ontologies: Array<{ acronym: string; version: { id: string } }>;
    actions: unknown[];
  };
  expect(final.ontologies.map((o) => [o.acronym, o.version.id])).toEqual([['NCIT', 'other']]);
  expect(final.actions).toEqual(saved['actions']);
});
