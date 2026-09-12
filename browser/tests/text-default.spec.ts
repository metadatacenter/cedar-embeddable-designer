import { expect, test, Page } from '@playwright/test';
import { openSettings, applyPreset, child, currentTemplate, openDesigner, publishedTemplates } from './support';

async function withFieldElement(page: Page): Promise<void> {
  await openDesigner(page);
  await applyPreset(page, 'semantic');
  await openSettings(page.locator('app-field-card').first());
}

function defaultOf(template: Record<string, unknown>): unknown {
  return (child(template, 'Title')['_valueConstraints'] as Record<string, unknown>)['defaultValue'];
}

test('a text default is edited natively, published, and cleared without rebuilding while typing', async ({ page }) => {
  await withFieldElement(page);
  const input = page.locator('.field-drop-item').first().locator('app-field-default-value input');
  await expect(input).toBeVisible();
  await input.evaluate((node) => node.setAttribute('data-kept', 'yes'));
  await input.pressSequentially('Untitled study', { delay: 25 });
  await expect.poll(async () => defaultOf(await currentTemplate(page))).toBe('Untitled study');
  await expect.poll(async () => defaultOf((await publishedTemplates(page)).at(-1)!)).toBe('Untitled study');
  await expect(input).toHaveAttribute('data-kept', 'yes');
  await expect(input).toBeFocused();
  await input.fill('');
  await expect.poll(async () => defaultOf(await currentTemplate(page))).toBeUndefined();
});

test('opening a saved template restores its native text default', async ({ page }) => {
  await withFieldElement(page);
  const template = await currentTemplate(page);
  (child(template, 'Title')['_valueConstraints'] as Record<string, unknown>)['defaultValue'] = 'Saved title';
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = template;
  }, template);
  await openSettings(page.locator('app-field-card').first());
  const input = page.locator('.field-drop-item').first().locator('app-field-default-value input');
  await expect(input).toHaveValue('Saved title');
  await expect.poll(async () => defaultOf(await currentTemplate(page))).toBe('Saved title');
});

test('native text defaults work without CEF', async ({ page }) => {
  const designer = await openDesigner(page);
  const template = await currentTemplate(page);
  (child(template, 'Title')['_valueConstraints'] as Record<string, unknown>)['defaultValue'] = 'Saved title';
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = template;
  }, template);
  await applyPreset(page, 'semantic');
  await openSettings(page.locator('app-field-card').first());
  const control = designer.locator('.field-drop-item').first().locator('app-field-default-value');
  await expect(control.locator('input')).toHaveValue('Saved title');
  await control.locator('input').fill('Changed title');
  await expect.poll(async () => defaultOf(await currentTemplate(page))).toBe('Changed title');
});

test('native text defaults evaluate regex and length constraints without saving invalid edits', async ({ page }) => {
  await withFieldElement(page);
  const card = page.locator('app-field-card').first();
  await card.getByLabel('Minimum length', { exact: true }).fill('2');
  await card.getByLabel('Maximum length', { exact: true }).fill('4');
  await card.getByLabel('Regular expression', { exact: true }).fill('^[A-Z]+$');
  const input = card.getByRole('textbox', { name: 'Default value', exact: true });
  await input.fill('AB');
  await expect.poll(async () => defaultOf(await currentTemplate(page))).toBe('AB');
  for (const text of ['abc', 'A', 'ABCDE']) {
    await input.fill(text);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(card.locator('app-field-default-value').getByRole('alert')).toBeVisible();
    expect(defaultOf(await currentTemplate(page))).toBe('AB');
  }
  await input.fill('XYZ');
  await expect(input).toHaveAttribute('aria-invalid', 'false');
  await expect.poll(async () => defaultOf(await currentTemplate(page))).toBe('XYZ');
  await card.getByRole('button', { name: 'Clear default', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect.poll(async () => defaultOf(await currentTemplate(page))).toBeUndefined();
});
