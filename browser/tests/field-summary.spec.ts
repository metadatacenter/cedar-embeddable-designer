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
    await designer.screenshot({ path: testInfo.outputPath(`constraint-summary-${width}.png`) });
    const saved = await currentTemplate(page);
    expect(saved).toEqual(artifact);
    // Compare against CEF outside CED: inheritance must not change the presentation.
    await page.evaluate(
      (definition) => {
        const reference = document.createElement('cedar-embeddable-field') as any;
        reference.id = 'summary-reference';
        reference.config = { readOnlyMode: true };
        reference.setAttribute('density', 'authoring');
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
