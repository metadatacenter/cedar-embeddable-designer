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
  await expect(settings.getByRole('alert')).toHaveCSS('font-size', '12px');
  expect(((await currentTemplate(page)).properties as any).Title.minItems).toBe(2);
  const display = await openSettings(card, 'Display');
  await display.getByLabel('Name', { exact: true }).fill('Immediate label');
  await expect(display.getByRole('alert')).toHaveCount(0);
  await openSettings(card, 'Occurrences');
  await expect(settings.getByLabel('Minimum', { exact: true })).toHaveValue('8');
  await expect(settings.getByRole('alert')).toContainText('minimum no greater');
  await settings.getByLabel('Maximum', { exact: true }).fill('10');
  await expect(settings.getByRole('alert')).toHaveCount(0);
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).Title.minItems).toBe(8);

  await page.screenshot({ path: '/tmp/ced-occurrences.png' });
});

test('writes the display name, description and layout settings', async ({ page }) => {
  await openDesigner(page);
  const settings = page.locator('#field-card-1 app-field-settings');
  const section = await openSettings(page.locator('#field-card-1'), 'Display');
  await section.getByLabel('Name', { exact: true }).fill('Shown title');
  await section.getByLabel('Description', { exact: true }).fill('Shown help');
  await section.getByLabel('Hidden', { exact: true }).check();
  await section.getByLabel('Continue previous line', { exact: true }).check();
  // The name is the one the card's header shows, so it lands where the header writes it.
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).Title['skos:prefLabel'])
    .toBe('Shown title');
  await expect
    .poll(async () => (await currentTemplate(page))._ui)
    .toMatchObject({ propertyDescriptions: { Title: 'Shown help' } });
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
  const section = await openSettings(page.locator('app-field-card').first(), 'Constraints');
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
  const section = await openSettings(card, 'Constraints');
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
  const section = await openSettings(card, 'Constraints');
  await section.getByLabel('Temporal type').selectOption('xsd:dateTime');
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
  await expect(card.locator('.field-type-label').filter({ hasText: 'Date and time' })).toBeVisible();
  await page.screenshot({ path: '/tmp/ced-temporal-settings.png' });
  await section.getByLabel('Temporal type').selectOption('xsd:time');
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
  await designer
    .getByRole('button', { name: /^Add field$/ })
    .last()
    .click();
  await designer.locator('app-field-type-picker').getByRole('button', { name: 'Image', exact: true }).click();
  await expect(designer.locator('app-field-card')).toHaveCount(4);
  const card = designer.locator('app-field-card').last();
  await card.getByRole('textbox', { name: 'Field display name', exact: true }).fill('Picture');
  const section = await openSettings(card, 'Content');
  await section.getByLabel('Width').fill('640');
  await expect.poll(async () => ((await currentTemplate(page)).properties as any).picture._ui._size?.width).toBe(640);
  await section.getByLabel('Height').fill('360');
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any).picture._ui._size)
    .toEqual({ width: 640, height: 360 });
  await designer
    .getByRole('button', { name: /^Add field$/ })
    .last()
    .click();
  await designer.locator('app-field-type-picker').getByRole('button', { name: 'Rich Text', exact: true }).click();
  await expect(designer.locator('app-field-card')).toHaveCount(5);
  await card.getByRole('textbox', { name: 'Field display name', exact: true }).fill('Rich content');
  await openSettings(card, 'Content');
  await expect(card.getByRole('tab').first()).toHaveText('Display');
  await card.getByRole('textbox', { name: 'Content', exact: true }).fill('<p>First</p>\n<p>Second</p>');
  await expect
    .poll(async () => ((await currentTemplate(page)).properties as any)['rich_content']._ui._content)
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

test('one Temporal palette entry supports date, time and date-time without changing field identity', async ({
  page,
}) => {
  const designer = await openDesigner(page);
  await designer
    .getByRole('button', { name: /^Add field$/ })
    .last()
    .click();
  const picker = designer.locator('app-field-type-picker');
  await expect(picker.getByRole('button', { name: 'Temporal', exact: true })).toHaveCount(1);
  await expect(picker.getByRole('button', { name: /^(Date|Time|Date and time)$/ })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Temporal', exact: true }).click();
  await designer.locator('input[aria-label="Field display name"]:focus').fill('Temporal');
  await expect(designer.locator('app-field-card')).toHaveCount(4);
  const card = designer.locator('app-field-card').last();
  const settings = await openSettings(card, 'Constraints');
  const original = ((await currentTemplate(page)).properties as any).temporal['@id'];
  for (const [type, preview] of [
    ['xsd:time', 'Time'],
    ['xsd:dateTime', 'Date and time'],
    ['xsd:date', 'Date'],
  ]) {
    await settings.getByLabel('Temporal type', { exact: true }).selectOption(type);
    await expect(card.getByPlaceholder(preview, { exact: true })).toBeVisible();
    await expect
      .poll(async () => {
        const field = ((await currentTemplate(page)).properties as any).temporal;
        return [field['@id'], field._valueConstraints.temporalType];
      })
      .toEqual([original, type]);
  }
});

test('metadata keys are editable and unique within their parent while names and labels may repeat', async ({
  page,
}) => {
  const designer = await openDesigner(page);
  const cards = designer.locator('app-field-card');
  const first = cards.nth(0);
  const second = cards.nth(1);
  await first.getByLabel('Field display name', { exact: true }).fill('Repeated');
  await second.getByLabel('Field display name', { exact: true }).fill('Repeated');
  const display = await openSettings(first, 'Display');
  await expect(display.getByLabel('Preferred name', { exact: true })).toHaveCount(0);
  // The Display tab shows the name typed in the header.
  await expect(display.getByLabel('Name', { exact: true })).toHaveValue('Repeated');
  await display.getByLabel('Name', { exact: true }).fill('Same label');
  const otherDisplay = await openSettings(second, 'Display');
  await otherDisplay.getByLabel('Name', { exact: true }).fill('Same label');
  const metadata = await openSettings(first, 'Field metadata');
  await expect(metadata.getByLabel('Key', { exact: true })).toHaveValue('Title');
  await metadata.getByLabel('Key', { exact: true }).fill('subject');
  const otherMetadata = await openSettings(second, 'Field metadata');
  const key = otherMetadata.getByLabel('Key', { exact: true });
  await key.fill('subject');
  await expect(otherMetadata.getByRole('alert')).toContainText('already uses that key');
  await key.fill('');
  await expect(otherMetadata.getByRole('alert')).toContainText('Key is required');
  await key.fill('category');
  await expect(otherMetadata.getByRole('alert')).toHaveCount(0);
  const saved = await currentTemplate(page);
  expect((saved.properties as any).subject['schema:name']).toBe('Title');
  expect((saved.properties as any).subject['skos:prefLabel']).toBe('Same label');
  expect((saved.properties as any).category['schema:name']).toBe('Category');
  expect((saved.properties as any).category['skos:prefLabel']).toBe('Same label');
});

test('the Display tab name is the header name, ignoring a copied fallback and editing an authored override', async ({
  page,
}) => {
  const designer = await openDesigner(page);
  const header = () =>
    designer.locator('app-field-card').first().getByRole('textbox', { name: 'Field display name', exact: true });
  let display = await openSettings(designer.locator('app-field-card').first(), 'Display');
  await expect(display.getByLabel('Name', { exact: true })).toHaveValue('Title');
  await expect(display.getByLabel('Name', { exact: true })).toHaveAttribute('placeholder', 'Field name');
  // Typing in the header shows in the Display tab as it is typed.
  await header().fill('Heading');
  await expect(display.getByLabel('Name', { exact: true })).toHaveValue('Heading');

  // A parent label that only repeats the key is the writer's filler, not a second name.
  const artifact = await currentTemplate(page);
  expect((artifact._ui as any).propertyLabels.Title).toBe('Title');
  (artifact._ui as any).propertyLabels.Title = 'Study title';
  await page.evaluate((value) => {
    (document.querySelector('cedar-embeddable-designer') as HTMLElement & { artifact: object }).artifact = value;
  }, artifact);
  // An authored override is the name both places show, and both edit it.
  display = await openSettings(designer.locator('app-field-card').first(), 'Display');
  await expect(display.getByLabel('Name', { exact: true })).toHaveValue('Study title');
  await expect(header()).toHaveValue('Study title');
  await display.getByLabel('Name', { exact: true }).fill('Study heading');
  await expect(header()).toHaveValue('Study heading');
  await expect
    .poll(async () => (await currentTemplate(page))._ui)
    .toMatchObject({ propertyLabels: { Title: 'Study heading' } });
});
