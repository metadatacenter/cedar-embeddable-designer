import { expect, test } from '@playwright/test';
import type { CedarEmbeddableDesignerElement, CedJsonObject } from '../../src/app/ced-public-api';

test('local test1 can search and insert a reusable element in the default Modular profile', async ({ page }) => {
  test.skip(!process.env.CED_LOCAL_REPOSITORY, 'Opt-in: requires demo:serve and the local CEDAR stack.');
  await page.goto('http://localhost:4599/');
  const designer = page.locator('cedar-embeddable-designer');
  await expect(designer.getByRole('button', { name: 'Modular', exact: true })).toBeVisible();
  await expect(designer.locator('input[type="file"]')).toHaveCount(0);
  await designer.getByRole('button', { name: 'Import element', exact: true }).click();
  await designer.getByRole('searchbox').fill('Study');
  await designer.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(designer.getByRole('table', { name: 'Search results' })).toContainText('No elements found.');
  await expect(designer.getByRole('alert')).toHaveCount(0);
  for (const query of ['Princ', 'princ', 'Princ Inv', 'Principal Investigator']) {
    await designer.getByRole('searchbox').fill(query);
    await designer.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(designer.getByRole('row', { name: 'Select Principal Investigator', exact: true })).toBeVisible();
  }
  await designer.getByRole('row', { name: 'Select Principal Investigator', exact: true }).click();
  await expect(designer.getByRole('table', { name: 'Selected children' })).toContainText('Published');
  await designer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(designer.getByRole('dialog')).toHaveCount(0);
  const child = await page.evaluate(() => {
    const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
    return (element.currentArtifact['properties'] as CedJsonObject)['Principal Investigator'] as CedJsonObject;
  });
  expect(child['@type']).toBe('https://schema.metadatacenter.org/core/TemplateElement');
  expect(child['bibo:status']).toBe('bibo:published');
});
