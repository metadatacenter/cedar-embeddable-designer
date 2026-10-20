import { expect, test } from '@playwright/test';
import { openDesigner, currentTemplate } from './support';
import type { CedarEmbeddableDesignerElement, CedarEmbeddableFieldDesignerElement } from '../../src/app/ced-public-api';

test('host findings reveal the exact field setting, clear on correction, and retain the artifact', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Study');
  const before = await currentTemplate(page);
  await page.evaluate(() => {
    const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
    element.validationFindings = [
      { location: '/properties/Title/_valueConstraints/regex', message: 'Review this pattern', severity: 'error' },
    ];
  });
  const summary = designer.locator('.validation-summary');
  await summary.locator('summary').click();
  await summary.getByRole('button', { name: /Review this pattern/ }).click();
  const input = designer.locator('input[name=regex]');
  await expect(input).toBeFocused();
  await expect(designer.locator('app-field-settings').first().getByRole('alert')).toContainText('Review this pattern');
  expect(await currentTemplate(page)).toEqual(before);
  await input.fill('[A-Z]+');
  await expect(summary).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).canSave,
    ),
  ).toBe(true);
});

test('root findings focus descriptions; unknown warnings remain visible and advisory; replacement clears findings', async ({
  page,
}) => {
  const designer = await openDesigner(page);
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Study');
  await page.evaluate(() => {
    const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
    element.validationFindings = [
      { location: '/schema:description', message: 'Explain this study', severity: 'error' },
    ];
  });
  const summary = designer.locator('.validation-summary');
  await summary.locator('summary').click();
  await summary.getByRole('button', { name: /Explain this study/ }).click();
  const description = designer.getByPlaceholder('Add description...', { exact: true }).first();
  await expect(description).toBeFocused();
  await expect(description).toHaveAttribute('aria-invalid', 'true');
  await description.fill('Description');
  await expect(summary).toHaveCount(0);
  await page.evaluate(() => {
    const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
    element.validationFindings = [{ location: '/unsupported', message: 'Advisory only', severity: 'warning' }];
  });
  await expect(summary.locator('summary')).toContainText('Validation issues (1)');
  await summary.locator('summary').click();
  await expect(summary.getByText('/unsupported: Advisory only', { exact: true })).toBeVisible();
  await expect(summary.locator('button')).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
      const allowed = element.canSave;
      element.loadArtifact(element.currentArtifact);
      return allowed;
    }),
  ).toBe(true);
  await expect(summary).toHaveCount(0);
});

test('standalone field host findings navigate without clearing unsaved input', async ({ page }) => {
  await page.goto('/field-host.html');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('textbox', { name: 'Enter field name', exact: true }).fill('Unsaved field');
  await page.evaluate(() => {
    const element = document.getElementById('field') as CedarEmbeddableFieldDesignerElement;
    element.validationFindings = [{ location: '/schema:description', message: 'Add useful help', severity: 'error' }];
  });
  const summary = page.locator('.validation-summary');
  await summary.locator('summary').click();
  await summary.getByRole('button', { name: /Add useful help/ }).click();
  const description = page.getByPlaceholder('Field description', { exact: true });
  await expect(description).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Enter field name', exact: true })).toHaveValue('Unsaved field');
  await description.fill('Useful help');
  await expect(summary).toHaveCount(0);
});
