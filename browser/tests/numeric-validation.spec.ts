import { expect, test } from '@playwright/test';
import { openDesigner, openSettings, currentTemplate, child } from './support';

test('numeric constraints reject invalid drafts and preserve saved settings until corrected', async ({ page }) => {
  const designer = await openDesigner(page);
  const card = designer.locator('app-field-card').first();
  // Use a numeric fixture supplied through the public artifact input.
  const source = await currentTemplate(page);
  const field = child(source, 'Title');
  field._ui = { inputType: 'numeric' };
  field._valueConstraints = { numberType: 'xsd:byte', minValue: 0, maxValue: 100 };
  await page.evaluate((artifact) => {
    (document.querySelector('cedar-embeddable-designer') as HTMLElement & { artifact: object }).artifact = artifact;
  }, source);
  const panel = await openSettings(card, 'Constraints');
  const minimum = panel.getByLabel('Minimum value', { exact: true });
  const maximum = panel.getByLabel('Maximum value', { exact: true });
  const error = panel.getByRole('alert');
  const saved = await currentTemplate(page);
  for (const value of ['22222', '-129', '0.5']) {
    await minimum.fill(value);
    await expect(error).toBeVisible();
    await expect(error).not.toContainText('Title:');
    expect(await currentTemplate(page)).toEqual(saved);
  }
  await minimum.fill('-128');
  await expect(error).toHaveCount(0);
  await maximum.fill('128');
  await expect(error).toContainText('range');
  await maximum.fill('127');
  await expect(error).toHaveCount(0);
  const places = panel.getByLabel('Decimal places', { exact: true });
  await places.fill('2');
  await expect(error).toContainText('0 or left empty');
  await places.fill('0');
  await expect(error).toHaveCount(0);
  await minimum.fill('');
  await minimum.pressSequentially('1e');
  await expect(error).toContainText('valid number');
  await minimum.fill('-10');
  await expect(error).toHaveCount(0);
});

test('native numeric defaults validate numbers, bounds and integer datatype without CEF', async ({ page }) => {
  const designer = await openDesigner(page);
  const source = await currentTemplate(page);
  const field = child(source, 'Title');
  field._ui = { inputType: 'numeric' };
  field._valueConstraints = { numberType: 'xsd:byte', minValue: 0, maxValue: 100 };
  await page.evaluate((artifact) => {
    (document.querySelector('cedar-embeddable-designer') as HTMLElement & { artifact: object }).artifact = artifact;
  }, source);
  const panel = await openSettings(designer.locator('app-field-card').first());
  const input = panel.getByRole('textbox', { name: 'Default value', exact: true });
  const value = async () =>
    (child(await currentTemplate(page), 'Title')._valueConstraints as Record<string, unknown>).defaultValue;
  await input.fill('0');
  await expect.poll(value).toBe('0');
  for (const text of ['abc', '1e', '-1', '101', '22222', '1.5']) {
    await input.fill(text);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(await value()).toBe('0');
  }
  await input.fill('42');
  await expect.poll(value).toBe('42');
  await input.fill('');
  await expect.poll(value).toBeUndefined();
});
