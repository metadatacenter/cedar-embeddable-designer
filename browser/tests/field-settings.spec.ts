import { test, expect } from '@playwright/test';
import { openSettings, openDesigner, currentTemplate, applyPreset } from './support';

test('authors occurrence limits and rejects an inverted range', async ({ page }) => {
  await openDesigner(page);
  const card = page.locator('app-field-card').first();
  await card.getByRole('checkbox', { name: 'Allow multiple', exact: true }).check();
  const settings = card.locator('app-field-settings');
  await openSettings(card, 'Occurrences');
  await settings.getByLabel('Minimum', { exact: true }).fill('2');
  await settings.getByLabel('Maximum', { exact: true }).fill('5');
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title.minItems).toBe(2);
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title.maxItems).toBe(5);
  await settings.getByLabel('Minimum', { exact: true }).fill('8');
  await expect(settings.getByRole('alert')).toContainText('minimum no greater');
  expect(((await currentTemplate(page)).properties as any).Title.minItems).toBe(2);
  const display = await openSettings(card, 'Display');
  await display.getByLabel('Display label', { exact: true }).fill('Immediate label');
  await expect(display.getByRole('alert')).toHaveCount(0);
  await openSettings(card, 'Occurrences');
  await expect(settings.getByLabel('Minimum', { exact: true })).toHaveValue('8');
  await expect(settings.getByRole('alert')).toContainText('minimum no greater');
  await settings.getByLabel('Maximum', { exact: true }).fill('10');
  await expect(settings.getByRole('alert')).toHaveCount(0);
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title.minItems).toBe(8);

  await page.screenshot({ path: '/tmp/ced-occurrences.png' });
});

test('writes display labels and layout settings', async ({ page }) => {
  await openDesigner(page);
  const settings = page.locator('#field-card-1 app-field-settings');
  const section = await openSettings(page.locator('#field-card-1'), 'Display');
  await section.getByLabel('Display label', { exact: true }).fill('Shown title');
  await section.getByLabel('Display description', { exact: true }).fill('Shown help');
  await section.getByLabel('Hidden', { exact: true }).check();
  await section.getByLabel('Continue previous line', { exact: true }).check();
  await expect
    .poll(async () => (await currentTemplate(page))._ui)
    .toMatchObject({ propertyLabels: { Title: 'Shown title' }, propertyDescriptions: { Title: 'Shown help' } });
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Title._ui)
    .toMatchObject({ hidden: true, continuePreviousLine: true });
});

test('authors recommended fields without marking them required', async ({ page }) => {
  await openDesigner(page);
  const requirement = page.locator('#field-card-1').getByLabel('Requirement', { exact: true });
  await requirement.selectOption('recommended');
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Title._valueConstraints)
    .toMatchObject({ recommendedValue: true, requiredValue: false });
  await requirement.selectOption('required');
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Title._valueConstraints)
    .toMatchObject({ requiredValue: true });
  expect(((await currentTemplate(page)).properties as any).Title._valueConstraints.recommendedValue).toBeUndefined();
});

test('authors text constraints and rejects invalid patterns', async ({ page }) => {
  await openDesigner(page);
  const section = await openSettings(page.locator('app-field-card').first(), 'Text constraints');
  await section.getByLabel('Minimum length').fill('2');
  await section.getByLabel('Maximum length').fill('8');
  await section.getByLabel('Regular expression').fill('^[A-Z]+$');
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Title._valueConstraints)
    .toMatchObject({ minLength: 2, maxLength: 8, regex: '^[A-Z]+$' });
  await section.getByLabel('Regular expression').fill('[');
  await expect(section.getByRole('alert')).toBeVisible();
});

test('authors numeric datatype bounds precision and units', async ({ page }) => {
  await openDesigner(page);
  const card = page.locator('app-field-card').first();
  await loadFieldFixture(page, 'numeric');
  const section = await openSettings(card, 'Numeric constraints');
  await section.getByLabel('Datatype').selectOption('xsd:int');
  await section.getByLabel('Minimum value').fill('1');
  await section.getByLabel('Maximum value').fill('12');
  await section.getByLabel('Decimal places').fill('0');
  await section.getByLabel('Unit of measure').fill('mg');
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Title._valueConstraints)
    .toMatchObject({ numberType: 'xsd:int', minValue: 1, maxValue: 12, decimalPlace: 0, unitOfMeasure: 'mg' });
});

test('authors datetime precision timezone and time format', async ({ page }) => {
  await openDesigner(page);
  const card = page.locator('#field-card-3');
  const section = await openSettings(card, 'Temporal settings');
  await section.getByLabel('Temporal datatype').selectOption('xsd:dateTime');
  await section.getByLabel('Precision').selectOption('second');
  await section.getByLabel('Time format').selectOption('12h');
  await section.getByLabel('Show timezone').check();
  await expect
    .poll(
      async () => ((await currentTemplate(page)).properties as any)['Publication Date']._valueConstraints.temporalType,
    )
    .toBe('xsd:dateTime');
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any)['Publication Date']._ui)
    .toMatchObject({ temporalGranularity: 'second', timezoneEnabled: true, inputTimeFormat: '12h' });
  await expect(card.locator('div.rounded-full').filter({ hasText: 'Date and time' })).toBeVisible();
  await page.screenshot({ path: '/tmp/ced-temporal-settings.png' });
  await section.getByLabel('Temporal datatype').selectOption('xsd:time');
  await expect(section.getByLabel('Precision').locator('option')).toHaveText([
    'hour',
    'minute',
    'second',
    'Fractional second',
  ]);
});

test('authors media dimensions and multiline rich text', async ({ page }) => {
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await designer.getByRole('button', { name: /Add Field/ }).last().click();
  await designer.locator('app-field-type-picker').getByRole('button', { name: 'Image', exact: true }).click();
  await expect(designer.locator('app-field-card')).toHaveCount(4);
  const card = designer.locator('app-field-card').last();
  await card.getByRole('textbox', { name: 'Field name', exact: true }).fill('Picture');
  const section = await openSettings(card, 'Media size');
  await section.getByLabel('Width').fill('640');
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Picture._ui._size?.width).toBe(640);
  await section.getByLabel('Height').fill('360');
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Picture._ui._size)
    .toEqual({ width: 640, height: 360 });
  await designer.getByRole('button', { name: /Add Field/ }).last().click();
  await designer.locator('app-field-type-picker').getByRole('button', { name: 'Rich Text', exact: true }).click();
  await expect(designer.locator('app-field-card')).toHaveCount(5);
  await card.getByRole('textbox', { name: 'Field name', exact: true }).fill('Rich content');
  await openSettings(card, 'Values');
  await card.getByLabel('Content', { exact: true }).fill('<p>First</p>\n<p>Second</p>');
  await expect.poll(async () => ((await currentTemplate(page)).properties as any)['Rich content']._ui._content)
    .toBe('<p>First</p>\n<p>Second</p>');
});

async function loadFieldFixture(page: import('@playwright/test').Page, inputType: string) {
  await page.evaluate((inputType) => {
    const designer = document.querySelector('cedar-embeddable-designer') as any;
    const template = structuredClone(designer.currentTemplate);
    template.properties.Title._ui = { inputType };
    template.properties.Title._valueConstraints = inputType === 'numeric' ? { numberType: 'xsd:decimal' } : {};
    designer.artifact = template;
  }, inputType);
}
