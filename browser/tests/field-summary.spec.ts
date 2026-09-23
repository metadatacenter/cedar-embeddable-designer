import { expect, test } from '@playwright/test';
import { buildTemplate, fieldToJson, templateToJson } from '../../src/app/core/model/cedar-template';
import { Field } from '../../src/app/core/models/types';
import { currentTemplate, openDesigner, openSettings } from './support';

const fields: Field[] = [
  {
    id: 1,
    type: 'number',
    name: 'Count',
    status: 'optional',
    allowMultiple: false,
    options: [],
    defaultValue: { kind: 'number', value: 5 },
    numeric: { type: 'xsd:int', min: 0, max: 100, decimalPlaces: null, unit: 'units' },
  },
  {
    id: 2,
    type: 'text',
    name: 'Code',
    status: 'optional',
    allowMultiple: false,
    options: [],
    defaultValue: { kind: 'none' },
    textConstraints: { minLength: 0, maxLength: 20, regex: '^ABC' },
  },
  {
    id: 3,
    type: 'time',
    name: 'Time',
    status: 'optional',
    allowMultiple: false,
    options: [],
    defaultValue: { kind: 'none' },
    temporal: { type: 'xsd:time', granularity: 'second', timezoneEnabled: true, inputTimeFormat: '24h' },
  },
];

for (const width of [1280, 375]) {
  test(`field summaries reuse the CEE renderer and update without changing defaults at ${width}`, async ({
    page,
  }, testInfo) => {
    test.skip(!process.env.CEF_BUNDLE, 'Requires the real CEE/CEF distribution');
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    const artifact = templateToJson(
      buildTemplate({ name: 'Summaries', description: '', identifier: '', version: '0.0.1', fields }),
    );
    await page.evaluate((template) => {
      (document.querySelector('cedar-embeddable-designer') as any).template = template;
    }, artifact);
    await expect(designer.locator('app-field-summary')).toHaveCount(3);
    // The optional sibling can register after CED and its artifact are already mounted.
    await page.addScriptTag({ path: process.env.CEF_BUNDLE! });
    const boxes = designer.locator('app-field-summary .cee-spec-box');
    await expect(boxes).toHaveCount(3);
    await expect(boxes.nth(0)).toContainText('integer');
    await expect(boxes.nth(0)).toContainText('min 0');
    await expect(boxes.nth(0)).toContainText('max 100');
    await expect(boxes.nth(0)).toContainText('unit units');
    await expect(boxes.nth(1)).toContainText('20');
    await expect(boxes.nth(1)).toContainText('^ABC');
    await expect(boxes.nth(2)).toContainText('HH:MM:SS');
    // The shared summary must not acquire a second horizontal inset inside the card.
    for (let index = 0; index < (await boxes.count()); index++) {
      const box = boxes.nth(index);
      const card = designer.locator('app-field-card').nth(index);
      const body = card.locator('.field-card-body');
      const expectedLeft = await body.evaluate(
        (el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft),
      );
      expect(Math.abs((await box.boundingBox())!.x - expectedLeft)).toBeLessThanOrEqual(1);
    }
    await designer.screenshot({ path: testInfo.outputPath(`constraint-summary-${width}.png`) });
    const saved = await currentTemplate(page);
    expect(saved).toEqual(artifact);
    // Compare against CEF outside CED: inheritance must not change the presentation.
    await page.evaluate(
      (definition) => {
        const reference = document.createElement('cedar-embeddable-field') as any;
        reference.id = 'summary-reference';
        reference.config = { readOnlyMode: true };
        reference.fieldObject = definition;
        document.body.append(reference);
      },
      fieldToJson({ ...fields[0], defaultValue: { kind: 'none' } }),
    );
    const reference = page.locator('#summary-reference .cee-spec-box');
    await expect(reference).toBeVisible();
    for (const property of [
      'font-family',
      'font-size',
      'color',
      'border-color',
      'border-radius',
      'min-height',
      'padding',
    ]) {
      await expect(boxes.first()).toHaveCSS(
        property,
        await reference.evaluate((el, key) => getComputedStyle(el).getPropertyValue(key), property),
      );
    }
    const constraints = await openSettings(designer.locator('app-field-card').first());
    await constraints.getByLabel('Maximum value', { exact: true }).fill('200');
    await constraints.getByLabel('Maximum value', { exact: true }).press('Tab');
    await expect(boxes.first()).toContainText('max 200');
    expect((await currentTemplate(page)).properties.Count._valueConstraints.defaultValue).toBe(
      artifact.properties.Count._valueConstraints.defaultValue,
    );
    expect(await boxes.first().evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}

for (const type of ['singleChoiceList', 'multipleChoiceList', 'multipleChoice', 'checkboxes']) {
  test(`${type} shows its options in a summary box and follows edits`, async ({ page }) => {
    test.skip(!process.env.CEF_BUNDLE, 'Requires the real CEE/CEF distribution');
    const designer = await openDesigner(page);
    await page.addScriptTag({ path: process.env.CEF_BUNDLE! });
    const artifact = templateToJson(
      buildTemplate({
        name: 'Choice summary',
        description: '',
        identifier: '',
        version: '0.0.1',
        fields: [
          {
            id: 1,
            type,
            name: 'Choices',
            status: 'optional',
            allowMultiple: false,
            options: ['Option A', 'Option B'],
            defaultValue:
              type === 'checkboxes' || type === 'multipleChoiceList'
                ? { kind: 'literals', values: ['Option B'] }
                : { kind: 'literal', value: 'Option B' },
          },
        ],
      }),
    );
    await page.evaluate((template) => {
      (document.querySelector('cedar-embeddable-designer') as any).template = template;
    }, artifact);
    const card = designer.locator('app-field-card').first();
    const box = card.locator('app-field-summary .cee-spec-box');
    await expect(card.getByLabel('Occurrence range')).toHaveCount(0);
    await expect(box).toBeVisible();
    await expect(box).toContainText('Option A');
    await expect(box).toContainText('Option B');
    await expect(box).toHaveText(/values\s*Option A · Option B\s*default\s*Option B/);
    await expect(
      card.locator('app-field-summary input[type=radio], app-field-summary input[type=checkbox]'),
    ).toHaveCount(0);
    expect(await currentTemplate(page)).toEqual(artifact);
    await openSettings(card, 'Constraints');
    await card.getByRole('textbox', { name: 'Option 2', exact: true }).fill('Changed option');
    await card.getByRole('textbox', { name: 'Option 2', exact: true }).press('Tab');
    await expect(box).toContainText('Changed option');
    await expect(box).not.toContainText('Option B');
  });
}

test('occurrence ranges follow limits and repetition beside the field name', async ({ page }) => {
  const designer = await openDesigner(page);
  const artifact = templateToJson(
    buildTemplate({
      name: 'Ranges',
      description: '',
      identifier: '',
      version: '0.0.1',
      fields: [{ ...fields[0], allowMultiple: true, minItems: 3, maxItems: 4 }],
    }),
  );
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as any).template = template;
  }, artifact);
  const card = designer.locator('app-field-card').first();
  const range = card.getByLabel('Occurrence range');
  const required = card.getByLabel('Required', { exact: true });
  await expect(required).toHaveCount(0);
  await card.getByLabel('Requirement', { exact: true }).selectOption('required');
  await expect(required).toHaveText('*');
  await expect(card.locator('.field-heading > input + .required-mark + .occurrence-range')).toHaveText('(3 .. 4)');
  await card.getByLabel('Requirement', { exact: true }).selectOption('recommended');
  await expect(required).toHaveCount(0);
  await card.getByLabel('Requirement', { exact: true }).selectOption('optional');
  await expect(required).toHaveCount(0);
  await expect(range).toHaveText('(3 .. 4)');
  await expect(range).toHaveCSS('align-self', 'baseline');
  await expect(card.getByRole('textbox', { name: 'Field name', exact: true })).toHaveCSS('align-self', 'baseline');
  await openSettings(card, 'Occurrences');
  await card.getByLabel('Maximum', { exact: true }).fill('');
  await card.getByLabel('Maximum', { exact: true }).press('Tab');
  await expect(range).toHaveText('(3 .. ∞)');
  await card.getByLabel('Allow multiple', { exact: true }).uncheck();
  await expect(range).toHaveCount(0);
});

test('toggling repetition keeps the field header and preview stationary', async ({ page }) => {
  test.skip(!process.env.CEF_BUNDLE, 'Requires the real CEE/CEF distribution');
  const designer = await openDesigner(page);
  await page.addScriptTag({ path: process.env.CEF_BUNDLE! });
  await page.evaluate(
    (template) => {
      (document.querySelector('cedar-embeddable-designer') as any).template = template;
    },
    templateToJson(
      buildTemplate({
        name: 'Stable layout',
        description: '',
        identifier: '',
        version: '0.0.1',
        fields: [{ ...fields[0], type: 'phone', numeric: undefined, defaultValue: { kind: 'none' } }],
      }),
    ),
  );
  const card = designer.locator('app-field-card').first();
  await openSettings(card, 'Constraints');
  await page.evaluate(() => {
    document.body.style.setProperty('--cedar-font-size', '16px');
    document.body.style.setProperty('--cedar-font-size-small', '14px');
  });
  const targets = [
    card.getByRole('textbox', { name: 'Field name', exact: true }),
    card.locator('app-field-summary'),
    card.locator('.field-header'),
    card.locator('.field-type-icon'),
    card.locator('.field-actions'),
  ];
  const previewInput = card.locator('app-field-summary .cee-spec-box').first();
  await expect(previewInput).toBeVisible();
  const mounted = await previewInput.elementHandle();
  const before = await Promise.all(targets.map((target) => target.boundingBox()));
  await card.getByLabel('Allow multiple', { exact: true }).check();
  await expect(card.getByLabel('Occurrence range')).toBeVisible();
  expect(await mounted!.evaluate((el) => el.isConnected)).toBe(true);
  for (let i = 0; i < targets.length; i++) {
    const after = (await targets[i].boundingBox())!;
    expect(after.y).toBe(before[i]!.y);
    expect(after.height).toBeCloseTo(before[i]!.height, 0);
  }
});
