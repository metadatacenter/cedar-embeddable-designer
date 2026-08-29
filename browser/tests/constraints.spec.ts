import { expect, test } from '@playwright/test';
import { child, clickCentred, currentTemplate, openDesigner } from './support';

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
  await designer.getByRole('button', { name: /Add Field/ }).click();
  await designer.getByRole('button', { name: 'Controlled Terms', exact: true }).click();
  return designer.locator('app-controlled-term-config');
}

test('offers term search when the host has loaded the picker', async ({ page }) => {
  const panel = await openConstraintPanel(page);

  await expect(panel.getByRole('button', { name: /Search the terminology server/ })).toBeVisible();
});

test('says what is missing when the host has not loaded the picker', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: /Add Field/ }).click();
  await designer.getByRole('button', { name: 'Controlled Terms', exact: true }).click();

  const panel = designer.locator('app-controlled-term-config');
  // A host that has not loaded the picker is a normal state rather than a fault,
  // so the panel names what it needs instead of offering a search that cannot run.
  await expect(panel).toContainText('cedar-term-picker');
  await expect(panel.getByRole('button', { name: /Search the terminology server/ })).toBeHidden();
});

test('says what is missing when no terminology server is configured', async ({ page }) => {
  const designer = await openDesigner(page, '?picker=stub&terminology=none');
  await designer.getByRole('button', { name: /Add Field/ }).click();
  await designer.getByRole('button', { name: 'Controlled Terms', exact: true }).click();

  await expect(designer.locator('app-controlled-term-config')).toContainText('terminologyBaseUrl');
});

test('a chosen term becomes a constraint on the field', async ({ page }) => {
  const panel = await openConstraintPanel(page);
  await clickCentred(panel.getByRole('button', { name: /Search the terminology server/ }));

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
  await clickCentred(panel.getByRole('button', { name: /Search the terminology server/ }));
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
  await clickCentred(panel.getByRole('button', { name: /Search the terminology server/ }));
  await page.locator('#stub-pick').click();

  await expect(page.locator('cedar-term-picker')).toHaveCount(0);
});

test('the picker is told which field it is choosing for, and which server to ask', async ({ page }) => {
  const panel = await openConstraintPanel(page);
  await clickCentred(panel.getByRole('button', { name: /Search the terminology server/ }));

  const picker = page.locator('cedar-term-picker');
  expect(await picker.evaluate((node) => (node as unknown as { query: string }).query)).toBe('Controlled Terms');
  expect(await picker.evaluate((node) => (node as unknown as { terminologyBaseUrl: string }).terminologyBaseUrl)).toBe(
    'http://localhost:4598/fake-terminology/',
  );
});
