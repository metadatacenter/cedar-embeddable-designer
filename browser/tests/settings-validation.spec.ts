import { expect, test } from '@playwright/test';
import { openDesigner, openSettings, currentTemplate, child } from './support';
import type { CedarEmbeddableDesignerElement } from '../../src/app/ced-public-api';

const report = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).validate(),
  );

test('invalid edits reach wrappers, cards and overview; summary opens the affected setting', async ({ page }) => {
  const designer = await openDesigner(page);
  const source = await currentTemplate(page);
  child(source, 'Title')._valueConstraints = { minLength: 2, maxLength: 8, regex: '^[A-Z]+$' };
  await page.evaluate((artifact) => {
    const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
    element.artifact = artifact as never;
    (window as unknown as { reports: unknown[] }).reports = [];
    element.addEventListener('validationChange', (event) =>
      (window as unknown as { reports: unknown[] }).reports.push(event.detail),
    );
  }, source);
  const card = designer.locator('app-field-card').first();
  const panel = await openSettings(card, 'Constraints');
  const input = panel.getByRole('textbox', { name: 'Default value', exact: true });
  await input.fill('OK');
  const saved = await currentTemplate(page);
  await input.fill('lower');
  await expect.poll(async () => (await report(page)).canSave).toBe(false);
  expect((await report(page)).issues[0]).toMatchObject({ setting: 'defaultValue', source: 'draft', severity: 'error' });
  await expect(card.locator('.validation-badge')).toContainText('1 error');
  await expect(designer.locator('.field-drag-container.invalid')).toHaveCount(1);
  await expect(designer.locator('.field-drag-container.invalid')).toHaveCSS('outline-color', 'rgb(180, 35, 24)');
  await expect(designer.locator('.field-drag-container.invalid')).toHaveCSS('--tw-ring-color', '#b42318');
  await expect(designer.locator('.field-drag-container.invalid .field-selection-bar')).toHaveCSS(
    'background-color',
    'rgb(180, 35, 24)',
  );
  await expect(designer.locator('.outline-row.invalid').first()).toBeAttached();
  expect(await currentTemplate(page)).toEqual(saved);
  expect(
    await page.evaluate(() => {
      const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
      element.validate().issues.length = 0;
      return element.canSave;
    }),
  ).toBe(false);
  await card.getByRole('button', { name: 'Collapse field settings', exact: true }).click();
  await designer.locator('.validation-summary summary').click();
  await designer.locator('.validation-summary button').first().click();
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await input.fill('YES');
  await expect.poll(async () => (await report(page)).valid).toBe(true);
  await expect(designer.locator('.validation-summary')).toHaveCount(0);
  await expect(designer.locator('.field-drag-container.invalid')).toHaveCount(0);
  await expect(card.locator('..').locator('.field-selection-bar')).not.toHaveCSS(
    'background-color',
    'rgb(180, 35, 24)',
  );
  expect(
    await page.evaluate(() =>
      (window as unknown as { reports: { canSave: boolean }[] }).reports.some((r) => !r.canSave),
    ),
  ).toBe(true);
});

test('settings and default errors coexist and malformed occurrence input blocks saving', async ({ page }) => {
  const designer = await openDesigner(page);
  const card = designer.locator('app-field-card').first();
  const panel = await openSettings(card, 'Constraints');
  await panel.getByLabel('Minimum length', { exact: true }).fill('8');
  await panel.getByLabel('Maximum length', { exact: true }).fill('2');
  await panel.getByRole('textbox', { name: 'Default value', exact: true }).fill('abc');
  await expect.poll(async () => (await report(page)).issues.length).toBe(2);
  await panel.getByLabel('Maximum length', { exact: true }).fill('12');
  await expect.poll(async () => (await report(page)).issues.length).toBe(1);
  await panel.getByRole('textbox', { name: 'Default value', exact: true }).fill('abcdefgh');
  await expect.poll(async () => (await report(page)).valid).toBe(true);
  await card.getByLabel('Allow multiple', { exact: true }).check();
  const occurrences = await openSettings(card, 'Occurrences');
  const min = occurrences.getByLabel('Minimum', { exact: true });
  await min.pressSequentially('1e');
  await expect.poll(async () => (await report(page)).canSave).toBe(false);
  await min.fill('1');
  await expect.poll(async () => (await report(page)).canSave).toBe(true);
});

test('CEF invalid events block saving without replacing the last valid default', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.evaluate(() => {
    if (!customElements.get('cedar-embeddable-field'))
      customElements.define(
        'cedar-embeddable-field',
        class extends HTMLElement {
          config = {};
          fieldObject = {};
          value = { kind: 'none' };
          get currentValue() {
            return this.value;
          }
        },
      );
  });
  const card = designer.locator('app-field-card').last();
  await openSettings(card, 'Constraints');
  const cef = card.locator('app-field-default-value cedar-embeddable-field');
  await expect(cef).toBeAttached();
  const saved = await currentTemplate(page);
  await cef.evaluate((element) =>
    element.dispatchEvent(
      new CustomEvent('valueChange', { detail: { valid: false, value: { kind: 'literal', value: 'bad' } } }),
    ),
  );
  await expect.poll(async () => (await report(page)).canSave).toBe(false);
  expect(await currentTemplate(page)).toEqual(saved);
  await cef.evaluate((element) =>
    element.dispatchEvent(new CustomEvent('valueChange', { detail: { valid: true, value: { kind: 'none' } } })),
  );
  await expect.poll(async () => (await report(page)).canSave).toBe(true);
});
