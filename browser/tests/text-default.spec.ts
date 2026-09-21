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
  await expect(card.getByRole('button', { name: 'Clear default', exact: true })).toHaveCount(0);
  await input.fill('');
  await expect(input).toHaveValue('');
  await expect.poll(async () => defaultOf(await currentTemplate(page))).toBeUndefined();
});

test('paragraph limits restore, reject invalid drafts, and clear without exposing regex', async ({ page }) => {
  await withFieldElement(page);
  const template = await currentTemplate(page);
  const paragraph = child(template, 'Title');
  (paragraph['_ui'] as Record<string, unknown>)['inputType'] = 'textarea';
  Object.assign(paragraph['_valueConstraints'] as Record<string, unknown>, {
    minLength: 2,
    maxLength: 4,
    defaultValue: 'AB',
  });
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = template;
  }, template);
  const card = page.locator('app-field-card').first();
  await openSettings(card);
  const min = card.getByLabel('Minimum length', { exact: true });
  const max = card.getByLabel('Maximum length', { exact: true });
  await expect(min).toHaveValue('2');
  await expect(max).toHaveValue('4');
  await expect(card.getByLabel('Regular expression', { exact: true })).toHaveCount(0);
  const input = card.getByRole('textbox', { name: 'Default value', exact: true });
  await expect(input).toHaveValue('AB');
  for (const value of ['A', 'ABCDE']) {
    await input.fill(value);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(defaultOf(await currentTemplate(page))).toBe('AB');
  }
  await input.fill('A\nB');
  await expect(input).toHaveAttribute('aria-invalid', 'false');
  await expect.poll(async () => defaultOf(await currentTemplate(page))).toBe('A\nB');
  await min.fill('5');
  await expect(card.locator('app-field-settings').getByRole('alert')).toBeVisible();
  expect(
    (child(await currentTemplate(page), 'Title')['_valueConstraints'] as Record<string, unknown>)['minLength'],
  ).toBe(2);
  await min.fill('');
  await max.fill('');
  await expect
    .poll(async () => child(await currentTemplate(page), 'Title')['_valueConstraints'])
    .toMatchObject({ defaultValue: 'A\nB' });
  const constraints = child(await currentTemplate(page), 'Title')['_valueConstraints'] as Record<string, unknown>;
  expect(constraints['minLength']).toBeUndefined();
  expect(constraints['maxLength']).toBeUndefined();
});
