import { test, expect } from '@playwright/test';
import type { CedarEmbeddableFieldDesignerElement } from '../../src/app/ced-public-api';

declare global {
  interface Window {
    fieldEvents: { type: string; detail: unknown }[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/field-host.html');
  await page.waitForFunction(
    () => typeof (document.getElementById('field') as CedarEmbeddableFieldDesignerElement)?.newArtifact === 'function',
  );
});

test('opens the shared field picker in a dialog, supports cancel and keeps invalid saves blocked', async ({ page }) => {
  const picker = page.getByRole('dialog', { name: 'Choose field type', exact: true });
  await expect(picker.locator('app-field-type-picker')).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Text', exact: true }).locator('app-icon')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Field name', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await page.getByRole('button', { name: 'Choose field type', exact: true }).click();
  await picker.getByRole('button', { name: 'Number', exact: true }).click();
  await expect(picker).toHaveCount(0);
  const name = page.getByRole('textbox', { name: 'Field name', exact: true });
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'false');
  await expect
    .poll(() => page.evaluate(() => (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).canSave))
    .toBe(false);
  await name.press('Tab');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
});

for (const [label, type] of [
  ['Text', 'textfield'],
  ['Paragraph', 'textarea'],
  ['Number', 'numeric'],
  ['Temporal', 'temporal'],
  ['Email', 'email'],
  ['Link', 'link'],
  ['Phone', 'phone-number'],
  ['Controlled Terms', 'textfield'],
]) {
  test(`creates and reopens a ${label} field through the public component`, async ({ page }) => {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Display', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Field metadata', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Field name', exact: true }).fill(`My ${label}`);
    await expect
      .poll(() =>
        page.evaluate(() => (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).canSave),
      )
      .toBe(true);
    const artifact = await page.evaluate(
      () => (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).currentArtifact!,
    );
    expect(artifact['schema:name']).toBe(`My ${label}`);
    expect((artifact['_ui'] as Record<string, unknown>).inputType).toBe(type);
    await page.evaluate(
      (artifact) => (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).loadArtifact(artifact),
      artifact,
    );
    await expect(page.getByRole('textbox', { name: 'Field name', exact: true })).toHaveValue(`My ${label}`);
    await expect(page.getByRole('tab', { name: 'Display', exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).isDirty),
      )
      .toBe(false);
    await page.getByRole('textbox', { name: 'Field name', exact: true }).fill('Edited again');
    await expect
      .poll(() =>
        page.evaluate(() => (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).isDirty),
      )
      .toBe(true);
  });
}

test('preserves a manual collapse during edits and opens settings for the next field', async ({ page }) => {
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse field settings' }).click();
  await page.getByRole('textbox', { name: 'Field name', exact: true }).fill('Collapsed field');
  await expect(page.getByRole('tab', { name: 'Display', exact: true })).toBeHidden();
  await page.evaluate(() =>
    (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).newArtifact('number'),
  );
  await expect(page.getByRole('tab', { name: 'Display', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Constraints', exact: true })).toBeVisible();
});

test('hides placement controls, uses shadow styles and emits current artifacts', async ({ page }) => {
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('textbox', { name: 'Field name', exact: true }).fill('Reusable text');
  await expect(page.getByRole('combobox', { name: 'Requirement' })).toHaveCount(0);
  await expect(page.getByText('Allow multiple', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Collapse field settings' })).toBeVisible();
  await expect(page.getByLabel('Display label', { exact: true })).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Occurrences' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Field metadata' }).click();
  await expect(page.getByText('Property IRI', { exact: true })).toHaveCount(0);
  const background = await page
    .getByRole('textbox', { name: 'Field name', exact: true })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).not.toBe('rgb(255, 105, 180)');
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.fieldEvents
          .filter((e) => e.type === 'artifactChange')
          .map((e) => (e.detail as Record<string, unknown>)['schema:name'])
          .includes('Reusable text'),
      ),
    )
    .toBe(true);
});

test('isolates two instances and enforces host read-only state', async ({ page }) => {
  await page.evaluate(() => {
    const a = document.getElementById('field') as CedarEmbeddableFieldDesignerElement;
    a.newArtifact('text');
    const b = document.createElement('cedar-embeddable-field-designer') as CedarEmbeddableFieldDesignerElement;
    b.id = 'second';
    document.body.append(b);
    b.newArtifact('number');
  });
  await page.locator('#field').getByRole('textbox', { name: 'Field name', exact: true }).fill('First');
  await page.locator('#second').getByRole('textbox', { name: 'Field name', exact: true }).fill('Second');
  await page.evaluate(() => {
    (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).readOnly = true;
  });
  await expect(page.locator('#field').getByRole('textbox', { name: 'Field name', exact: true })).toBeDisabled();
  await expect(page.locator('#second').getByRole('textbox', { name: 'Field name', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).readOnly = false;
  });
  await expect(page.locator('#field').getByRole('textbox', { name: 'Field name', exact: true })).toBeEnabled();
});

test('keeps invalid numeric settings dirty and unsaveable until corrected', async ({ page }) => {
  await page.getByRole('button', { name: 'Number', exact: true }).click();
  await page.getByRole('textbox', { name: 'Field name', exact: true }).fill('Measured value');
  await page.evaluate(() => {
    const field = document.getElementById('field') as CedarEmbeddableFieldDesignerElement;
    field.loadArtifact(field.currentArtifact!);
  });
  await expect(page.getByRole('tab', { name: 'Constraints', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Constraints', exact: true }).click();
  await page.getByLabel('Minimum value', { exact: true }).fill('10');
  await page.evaluate(() => document.body.style.setProperty('--cedar-control-error', '#993311'));
  await page.getByLabel('Maximum value', { exact: true }).fill('5');
  await expect(page.getByRole('alert').first()).toHaveCSS('color', 'rgb(153, 51, 17)');
  await expect
    .poll(() => page.evaluate(() => (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).canSave))
    .toBe(false);
  await expect
    .poll(() => page.evaluate(() => (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).isDirty))
    .toBe(true);
  await expect(page.getByLabel('Maximum value', { exact: true })).toHaveValue('5');
  await page.getByLabel('Maximum value', { exact: true }).fill('15');
  await expect
    .poll(() => page.evaluate(() => (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).canSave))
    .toBe(true);
  const constraints = await page.evaluate(
    () =>
      (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).currentArtifact!['_valueConstraints'],
  );
  expect(constraints).toMatchObject({ minValue: 10, maxValue: 15 });
});

test('standalone fields cannot be saved with an empty or whitespace name', async ({ page }) => {
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Field name', exact: true });
  for (const blank of ['', '   ']) {
    await name.fill(blank);
    await name.blur();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Field name is required.', { exact: true }).first()).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).canSave),
      )
      .toBe(false);
  }
  await name.fill('Named field');
  await expect
    .poll(() => page.evaluate(() => (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).canSave))
    .toBe(true);
});
