import { expect, test } from '@playwright/test';
import {
  clickCentred,
  openDesigner,
  openSettings,
  currentTemplate,
  child,
  applyPreset,
  addElementFixture,
} from './support';
import type { CedarEmbeddableDesignerElement } from '../../src/app/ced-public-api';

const report = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).validate(),
  );

test('invalid edits reach wrappers, cards and overview; summary opens the affected setting', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Test template');
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
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Test template');
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
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Test template');
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

test('blank and whitespace names block saving and summary navigation focuses the name', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Test template');
  await applyPreset(page, 'modular');
  await addElementFixture(page, designer);
  for (const name of [
    designer.getByRole('textbox', { name: 'Template name', exact: true }),
    designer.getByRole('textbox', { name: 'Element name', exact: true }).first(),
    designer.getByRole('textbox', { name: 'Field name', exact: true }).first(),
  ]) {
    const original = await name.inputValue();
    for (const blank of ['', '   ']) {
      await name.fill(blank);
      await name.blur();
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      await expect.poll(async () => (await report(page)).canSave).toBe(false);
      expect((await report(page)).issues.some((issue) => issue.setting === 'name')).toBe(true);
    }
    await designer.locator('.validation-summary summary').click();
    await designer.locator('.validation-summary button').filter({ hasText: 'name is required' }).first().click();
    await expect(name).toBeFocused();
    await name.fill(original);
    await expect(name).toHaveAttribute('aria-invalid', 'false');
    await expect.poll(async () => (await report(page)).canSave).toBe(true);
  }
});

test('new fields and elements focus an unnamed draft and defer errors until blur', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('textbox', { name: 'Template name', exact: true }).fill('Study');
  await applyPreset(page, 'modular');
  await designer.getByRole('button', { name: 'Add field', exact: true }).first().click();
  await designer.getByRole('button', { name: 'Text', exact: true }).click();
  const field = designer.getByRole('textbox', { name: 'Field name', exact: true }).last();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('');
  await expect(field).toHaveAttribute('aria-invalid', 'false');
  await expect(designer.locator('.validation-summary')).toHaveCount(0);
  await expect.poll(async () => (await report(page)).canSave).toBe(false);
  await field.blur();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(designer.locator('.validation-summary')).toContainText('1 error — fix before saving');
  await expect(designer.locator('.validation-summary')).toHaveCSS('color', 'rgb(180, 35, 24)');
  await field.fill('Study title');
  await expect.poll(async () => (await report(page)).canSave).toBe(true);
  await designer.getByRole('button', { name: 'Add element', exact: true }).first().click();
  const element = designer.getByRole('textbox', { name: 'Element name', exact: true }).last();
  await expect(element).toBeFocused();
  await expect(element).toHaveValue('');
  await expect(element).toHaveAttribute('aria-invalid', 'false');
  await expect.poll(async () => (await report(page)).canSave).toBe(false);
  await element.fill('   ');
  await element.blur();
  await expect(element).toHaveAttribute('aria-invalid', 'true');
  await element.fill('Study details');
  await expect.poll(async () => (await report(page)).canSave).toBe(true);
});

test('field error badge aligns its icon and text with the field name', async ({ page }) => {
  const designer = await openDesigner(page);
  const card = designer.locator('app-field-card').first();
  const name = card.getByRole('textbox', { name: 'Field name', exact: true });
  await name.fill('');
  await name.blur();
  const badge = card.locator('.validation-badge');
  await expect(badge).toContainText('1 error');
  for (const width of [1280, 700]) {
    await page.setViewportSize({ width, height: 900 });
    const alignment = await card.evaluate((element) => {
      const input = element.querySelector<HTMLInputElement>('.field-heading > input')!;
      const text = element.querySelector('.validation-badge > span')!.getBoundingClientRect();
      const icon = element.querySelector('.validation-badge svg')!.getBoundingClientRect();
      const style = getComputedStyle(input);
      const nameCenter =
        input.getBoundingClientRect().top +
        parseFloat(style.borderTopWidth) +
        parseFloat(style.paddingTop) +
        parseFloat(style.lineHeight) / 2;
      return { nameCenter, textCenter: text.top + text.height / 2, iconCenter: icon.top + icon.height / 2 };
    });
    expect(Math.abs(alignment.textCenter - alignment.nameCenter)).toBeLessThanOrEqual(1);
    expect(Math.abs(alignment.iconCenter - alignment.textCenter)).toBeLessThanOrEqual(1);
  }
});

test('validation summary centers its heading and indents expanded issues', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByLabel('Template name', { exact: true }).fill('Study');
  const name = designer.getByLabel('Field name', { exact: true }).first();
  await name.fill('');
  await name.blur();
  const notice = designer.locator('.validation-summary');
  await notice.locator('summary').click();
  await expect(notice.locator('li').first()).toBeVisible();
  const layout = await notice.evaluate((el) => {
    const summary = el.querySelector('summary')!;
    const box = summary.getBoundingClientRect();
    const children = [...summary.children].map((child) => child.getBoundingClientRect());
    const left = Math.min(...children.map((child) => child.left));
    const right = Math.max(...children.map((child) => child.right));
    return {
      delta: Math.abs((left + right) / 2 - (box.left + box.right) / 2),
      indent: parseFloat(getComputedStyle(el.querySelector('ul')!).paddingInlineStart),
    };
  });
  expect(layout.delta).toBeLessThanOrEqual(1);
  expect(layout.indent).toBeGreaterThan(0);
});

test('an invalid blank field name remains editable with real keystrokes', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByLabel('Template name', { exact: true }).fill('Study');
  const card = designer.locator('app-field-card').first();
  const name = card.getByLabel('Field name', { exact: true });
  await name.fill('');
  await name.blur();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await openSettings(card, 'Display');
  const bounds = (await name.boundingBox())!;
  // Hit the top edge physically: locator.click() would retry around an overlay.
  await page.mouse.click(bounds.x + 30, bounds.y + 2);
  await expect(name).toBeFocused();
  await page.keyboard.type('Study title', { delay: 80 });
  await expect(name).toHaveValue('Study title');
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'false');
});

test('tabs retain their error marker when another tab is selected', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByLabel('Template name', { exact: true }).fill('Study');
  const card = designer.locator('app-field-card').first();
  await card.getByLabel('Allow multiple', { exact: true }).check();
  const panel = await openSettings(card, 'Occurrences');
  await panel.getByLabel('Minimum', { exact: true }).fill('2');
  await panel.getByLabel('Maximum', { exact: true }).fill('1');
  const tab = card.getByRole('tab', { name: 'Occurrences', exact: true });
  await expect(tab).toHaveAttribute('aria-description', 'Contains errors');
  await expect(tab).toHaveCSS('border-bottom-color', 'rgb(180, 35, 24)');
  await card.getByRole('tab', { name: 'Display', exact: true }).click();
  await expect(tab).toHaveAttribute('aria-selected', 'false');
  await expect(tab).toHaveCSS('border-bottom-color', 'rgb(180, 35, 24)');
  await expect(card.getByRole('tab', { name: 'Display', exact: true })).not.toHaveAttribute('aria-description');
  await tab.click();
  await panel.getByLabel('Maximum', { exact: true }).fill('3');
  await expect(tab).not.toHaveAttribute('aria-description');
  await expect(tab).not.toHaveCSS('border-bottom-color', 'rgb(180, 35, 24)');
});

for (const inputType of ['radio', 'checkbox', 'list']) {
  test(`unnamed ${inputType} options remain invalid when settings close and recover when named or removed`, async ({
    page,
  }) => {
    const designer = await openDesigner(page);
    const template = await currentTemplate(page);
    const choice = child(template, 'Category');
    (choice._ui as Record<string, unknown>).inputType = inputType;
    choice._valueConstraints = { literals: [{ label: 'First' }] };
    template['schema:name'] = 'Choices';
    await page.evaluate((artifact) => {
      (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).artifact =
        artifact as never;
    }, template);
    const card = designer.locator('app-field-card').nth(1);
    await openSettings(card, 'Constraints');
    await clickCentred(card.getByRole('button', { name: 'Add option', exact: true }));
    await expect(card.getByLabel('Option 2', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect.poll(async () => (await report(page)).canSave).toBe(false);
    await clickCentred(card.getByRole('button', { name: 'Collapse field settings', exact: true }));
    await expect(card).toContainText('1 error');
    await expect.poll(async () => (await report(page)).canSave).toBe(false);
    await openSettings(card, 'Constraints');
    await card.getByLabel('Option 2', { exact: true }).fill('Second');
    await expect.poll(async () => (await report(page)).canSave).toBe(true);
    await clickCentred(card.getByRole('button', { name: 'Add option', exact: true }));
    await card.getByRole('button', { name: 'Delete option', exact: true }).last().click();
    await expect.poll(async () => (await report(page)).canSave).toBe(true);
  });
}

test('key errors are attached directly below the key and preserve the previous schema', async ({ page }) => {
  const designer = await openDesigner(page);
  const card = designer.locator('app-field-card').first();
  await openSettings(card);
  await card.getByRole('tab', { name: 'Field metadata', exact: true }).click();
  const key = card.getByLabel('Key', { exact: true });
  const before = await currentTemplate(page);
  for (const invalid of ['', '@context', '__proto__', 'Category']) {
    await key.fill(invalid);
    await expect(key).toHaveAttribute('aria-invalid', 'true');
    const error = card
      .locator('dd')
      .filter({ has: page.locator('input[name="deploymentName"]') })
      .getByRole('alert');
    await expect(error).toBeVisible();
    const inputBox = (await key.boundingBox())!;
    const errorBox = (await error.boundingBox())!;
    expect(errorBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height);
    expect(await currentTemplate(page)).toEqual(before);
  }
  await key.fill('type');
  await expect(key).toHaveAttribute('aria-invalid', 'false');
  expect((await currentTemplate(page)).properties).toHaveProperty('type');
});

for (const kind of ['template', 'element'] as const) {
  test(`new ${kind} names stay quiet until blur while saving remains blocked`, async ({ page }) => {
    const designer = await openDesigner(page);
    const start = () =>
      page.evaluate((kind) => {
        (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).newArtifact(kind);
      }, kind);
    await start();
    const name = designer.getByRole('textbox', {
      name: kind === 'template' ? 'Template name' : 'Element name',
      exact: true,
    });
    await expect(name).toHaveValue('');
    await expect(designer.locator('.validation-summary')).toHaveCount(0);
    await expect.poll(async () => (await report(page)).canSave).toBe(false);
    await name.fill('   ');
    await expect(name).toHaveAttribute('aria-invalid', 'false');
    await expect(designer.locator('.validation-summary')).toHaveCount(0);
    await name.press('Tab');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(designer.locator('.validation-summary')).toContainText('1 error — fix before saving');
    await expect.poll(async () => (await report(page)).canSave).toBe(false);
    await name.fill('Study');
    await expect(designer.locator('.validation-summary')).toHaveCount(0);
    await expect.poll(async () => (await report(page)).canSave).toBe(true);
    await start();
    await expect(designer.locator('.validation-summary')).toHaveCount(0);
    await expect.poll(async () => (await report(page)).canSave).toBe(false);
  });
}

test('summary counts only revealed name errors, while validation includes untouched names', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.evaluate(() =>
    (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).newArtifact('template'),
  );
  await designer.getByRole('button', { name: 'Add field', exact: true }).click();
  await designer.getByRole('button', { name: 'Text', exact: true }).click();
  const name = designer.getByRole('textbox', { name: 'Field name', exact: true });
  await expect(name).toBeFocused();
  await expect(designer.locator('.validation-summary')).toHaveCount(0);
  await name.press('Tab');
  await expect(designer.locator('.validation-summary')).toContainText('1 error — fix before saving');
  await expect(designer.locator('.validation-summary li')).toHaveCount(1);
  expect((await report(page)).issues.filter((issue) => issue.setting === 'name')).toHaveLength(2);
  await expect.poll(async () => (await report(page)).canSave).toBe(false);
});

test('adding the first field reveals a missing element name even when it was never focused', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.evaluate(() =>
    (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).newArtifact('element'),
  );
  const elementName = designer.getByRole('textbox', { name: 'Element name', exact: true });
  await expect(designer.locator('.validation-summary')).toHaveCount(0);
  await designer.getByRole('button', { name: 'Add field', exact: true }).click();
  await designer.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(elementName).toHaveAttribute('aria-invalid', 'true');
  await designer.getByRole('textbox', { name: 'Field name', exact: true }).fill('Study title');
  await expect(designer.locator('.validation-summary')).toContainText('1 error — fix before saving');
  await expect.poll(async () => (await report(page)).canSave).toBe(false);
  await elementName.fill('Study');
  await expect(designer.locator('.validation-summary')).toHaveCount(0);
  await expect.poll(async () => (await report(page)).canSave).toBe(true);
});
