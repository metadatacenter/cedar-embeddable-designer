import { test, expect } from '@playwright/test';
import { openDesigner, currentTemplate } from './support';

test('authors occurrence limits and rejects an inverted range', async ({ page }) => {
  await openDesigner(page);
  const card = page.locator('#field-card-1');
  await card.getByRole('checkbox', { name: 'Allow multiple', exact: true }).check();
  const settings = card.locator('app-field-settings');
  await settings.getByText('Occurrences', { exact: false }).click();
  await settings.getByLabel('Minimum', { exact: true }).fill('2');
  await settings.getByLabel('Maximum', { exact: true }).fill('5');
  await settings.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title.minItems).toBe(2);
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title.maxItems).toBe(5);
  await settings.getByLabel('Minimum', { exact: true }).fill('8');
  await settings.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(settings.getByRole('alert')).toContainText('minimum no greater');
  expect(((await currentTemplate(page)).properties as any).Title.minItems).toBe(2);
  await page.screenshot({ path: '/tmp/ced-occurrences.png' });
});

test('writes display labels and layout settings', async ({ page }) => {
  await openDesigner(page);
  const settings = page.locator('#field-card-1 app-field-settings');
  const section = settings.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Display' }) });
  await section.locator('summary').click();
  await section.getByLabel('Display label', { exact: true }).fill('Shown title');
  await section.getByLabel('Display description', { exact: true }).fill('Shown help');
  await section.getByLabel('Hidden', { exact: true }).check();
  await section.getByLabel('Continue previous line', { exact: true }).check();
  await section.getByRole('button', { name: 'Apply' }).click();
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
  const section = page
    .locator('#field-card-1 details')
    .filter({ has: page.locator('summary').filter({ hasText: 'Text constraints' }) });
  await section.locator('summary').click();
  await section.getByLabel('Minimum length').fill('2');
  await section.getByLabel('Maximum length').fill('8');
  await section.getByLabel('Regular expression').fill('^[A-Z]+$');
  await section.getByRole('button', { name: 'Apply' }).click();
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Title._valueConstraints)
    .toMatchObject({ minLength: 2, maxLength: 8, regex: '^[A-Z]+$' });
  await section.getByLabel('Regular expression').fill('[');
  await section.getByRole('button', { name: 'Apply' }).click();
  await expect(section.getByRole('alert')).toBeVisible();
});

test('authors numeric datatype bounds precision and units', async ({ page }) => {
  await openDesigner(page);
  const card = page.locator('#field-card-1');
  await card.locator('app-field-card button').first().click();
  await card
    .locator('.field-type-dropdown-container button')
    .filter({ has: page.getByText('Number', { exact: true }) })
    .click();
  const section = card
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: 'Numeric constraints' }) });
  await section.locator('summary').click();
  await section.getByLabel('Datatype').selectOption('xsd:int');
  await section.getByLabel('Minimum value').fill('1');
  await section.getByLabel('Maximum value').fill('12');
  await section.getByLabel('Decimal places').fill('0');
  await section.getByLabel('Unit of measure').fill('mg');
  await section.getByRole('button', { name: 'Apply' }).click();
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Title._valueConstraints)
    .toMatchObject({ numberType: 'xsd:int', minValue: 1, maxValue: 12, decimalPlace: 0, unitOfMeasure: 'mg' });
});

test('authors datetime precision timezone and time format', async ({ page }) => {
  await openDesigner(page);
  const card = page.locator('#field-card-3');
  const section = card
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: 'Temporal settings' }) });
  await section.locator('summary').click();
  await section.getByLabel('Temporal datatype').selectOption('xsd:dateTime');
  await section.getByLabel('Precision').selectOption('second');
  await section.getByLabel('Time format').selectOption('12h');
  await section.getByLabel('Show timezone').check();
  await section.getByRole('button', { name: 'Apply' }).click();
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
