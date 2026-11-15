import { expect, test } from '@playwright/test';
import { buildTemplate, templateToJson } from '../../src/app/core/model/cedar-template';
import {
  tabKey,
  addElementFixture,
  currentTemplate,
  applyPreset,
  openDesigner,
  openPreview,
  openSettings,
} from './support';

async function fixture(page: import('@playwright/test').Page, empty = false) {
  const designer = await openDesigner(page, '?cee=stub');
  const artifact = templateToJson(
    buildTemplate({
      name: 'Review fixture',
      description: '',
      identifier: '',
      version: '0.0.1',
      fields: empty
        ? []
        : [
            {
              id: 1,
              type: 'text',
              name: 'Sample',
              status: 'optional',
              allowMultiple: false,
              options: [],
              defaultValue: { kind: 'none' },
              propertyIri: 'https://schema.metadatacenter.org/properties/12345678-1234-1234-1234-123456789012',
            },
          ],
    }),
  );
  await designer.evaluate((el, value) => {
    (el as any).template = value;
  }, artifact);
  await expect(designer.locator('app-field-card')).toHaveCount(empty ? 0 : 1);
  return designer;
}

test('Overview opens while empty and after deleting the final field', async ({ page }) => {
  const designer = await fixture(page, true);
  const panel = designer.locator('#ced-overview');
  await expect(panel).toBeVisible();
  await designer.getByRole('button', { name: 'Close Overview', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await designer.getByRole('button', { name: 'Open Overview', exact: true }).click();
  await expect(panel).toBeVisible();
  await fixture(page);
  await designer.getByRole('button', { name: 'Delete field', exact: true }).click();
  await expect(designer.locator('app-field-card')).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(designer.getByRole('button', { name: 'Close Overview', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

for (const width of [1100, 768]) {
  test(`a short field name and type stay together when their content fits at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await fixture(page);
    await openPreview(page);
    const card = designer.locator('app-field-card');
    await expect
      .poll(async () => {
        const name = (await card.locator('.field-name').boundingBox())!;
        const type = (await card.locator('.field-type-label').boundingBox())!;
        return Math.abs(name.y + name.height / 2 - type.y - type.height / 2);
      })
      .toBeLessThan(4);
    const name = (await card.locator('.field-name').boundingBox())!;
    const type = (await card.locator('.field-type-label').boundingBox())!;
    expect(type.x - name.x - name.width).toBeLessThan(24);
  });
}

test('template type stays distinct from identity and version in a narrow split pane', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  const designer = await fixture(page);
  await openPreview(page);
  const card = designer.locator('.template-header-card').first();
  await expect
    .poll(async () => {
      const type = (await card.locator('.container-type-label').boundingBox())!;
      const name = (await card.locator('.template-header-row .template-field-label').first().boundingBox())!;
      const version = (await card.locator('.version-group .template-field-label').boundingBox())!;
      return type.y + type.height - Math.min(name.y, version.y);
    })
    .toBeLessThanOrEqual(0);
  await expect(card.getByRole('textbox', { name: 'Version', exact: true })).toHaveValue('0.0.1');
  await expect(card.getByRole('group', { name: 'Publication status', exact: true })).toHaveText('Draft');
  await card.locator('.container-type-label').click();
  await expect(card.getByRole('button', { name: 'Collapse template settings', exact: true })).toBeVisible();
  await card.locator('.container-type-label').click();
  await expect(card.getByRole('button', { name: 'Expand template settings', exact: true })).toBeVisible();
});

for (const width of [768, 375]) {
  test(`Property IRI remains readable with Preview at ${width}`, async ({ page }) => {
    const designer = await fixture(page);
    await openPreview(page);
    await page.setViewportSize({ width, height: 1000 });
    const card = designer.locator('app-field-card');
    await openSettings(card, 'Configuration');
    const iri = card.locator('app-property-picker .iri');
    await iri.scrollIntoViewIfNeeded();
    const box = (await iri.boundingBox())!;
    const property = (await card.locator('app-property-picker .property').boundingBox())!;
    // An identifier may wrap, but its value must keep a useful share of the available row.
    expect(box.width).toBeGreaterThan(property.width * 0.8);
    expect(box.height).toBeLessThan(200);
    for (const button of await card.locator('app-property-picker .property button').all()) {
      const rect = (await button.boundingBox())!;
      expect(rect.x + rect.width).toBeLessThanOrEqual(property.x + property.width + 1);
    }
    await card.getByLabel('Allow multiple', { exact: true }).check();
    const name = card.locator('.field-name');
    await name.scrollIntoViewIfNeeded();
    expect((await name.boundingBox())!.width).toBeGreaterThan(30);
    const range = (await card.locator('.occurrence-range').boundingBox())!;
    const action = (await card.locator('.field-actions').boundingBox())!;
    expect(range.x + range.width).toBeLessThanOrEqual(action.x + 1);
  });
}

test('pointer insertion follows the revealed gap action', async ({ page }) => {
  const designer = await fixture(page);
  await applyPreset(page, 'modular');
  const zone = designer.locator('.insert-zone').first();
  await zone.hover();
  await zone.getByRole('button', { name: 'Add element here', exact: true }).click();
  await expect(designer.getByPlaceholder('Enter element name', { exact: true })).toBeVisible();
});

for (const width of [1440, 768, 375]) {
  test(`a required Overview marker stays with the final word at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await fixture(page);
    const card = designer.locator('app-field-card');
    await card.getByRole('textbox', { name: 'Enter field name', exact: true }).fill('Participant code');
    const panel = await openSettings(card, 'Configuration');
    await panel.getByLabel('Requirement', { exact: true }).selectOption('required');
    const open = designer.getByRole('button', { name: 'Open Overview', exact: true });
    if (await open.isVisible()) await open.click();
    const name = designer.locator('app-container-outline .node-name').first();
    await expect(name.locator('.required-mark')).toBeVisible();
    const geometry = await name.evaluate((el) => {
      const text = [...el.querySelector('.required-name-tail')!.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)!;
      const end = (text.textContent ?? '').trimEnd().length;
      const range = document.createRange();
      range.setStart(text, end - 1);
      range.setEnd(text, end);
      const letter = range.getBoundingClientRect();
      const mark = el.querySelector('.required-mark')!.getBoundingClientRect();
      return { letter: letter.y, mark: mark.y };
    });
    expect(Math.abs(geometry.letter - geometry.mark)).toBeLessThan(2);
    await expect(designer.getByRole('group', { name: 'Participant code', exact: true })).toHaveCount(1);
    expect(Object.keys((await currentTemplate(page)).properties!)).toContain('Sample');
  });
}

for (const kind of ['field', 'element'] as const) {
  for (const width of [768, 375]) {
    test(`${kind} occurrence controls remain a consecutive group at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const designer = await fixture(page);
      if (kind === 'element') {
        await applyPreset(page, 'modular');
        await addElementFixture(page, designer);
      }
      await openPreview(page);
      const card = designer.locator(kind === 'field' ? 'app-field-card' : 'app-element-card').first();
      const panel =
        kind === 'field'
          ? await openSettings(card, 'Configuration')
          : card.getByRole('tabpanel', { name: 'Configuration' });
      if (kind === 'element') await card.getByRole('button', { name: 'Expand element settings', exact: true }).click();
      const multiple = panel.getByLabel('Allow multiple', { exact: true });
      await multiple.check();
      await expect(panel.getByLabel('Minimum', { exact: true })).toBeEnabled();
      await multiple.focus();
      await page.keyboard.press(tabKey(page));
      await expect(panel.getByLabel('Minimum', { exact: true })).toBeFocused();
      await page.keyboard.press(tabKey(page));
      await expect(panel.getByLabel('Maximum', { exact: true })).toBeFocused();
      const group = panel.locator('.configuration-occurrences');
      const geometry = await group.evaluate((el) => {
        const min = el.querySelector('input[type="number"]')!.getBoundingClientRect();
        const max = el.querySelectorAll('input[type="number"]')[1].getBoundingClientRect();
        const bounds = el.querySelector('.configuration-bounds')!.getBoundingClientRect();
        return { available: bounds.width, minY: min.y, maxY: max.y, right: max.right, edge: bounds.right };
      });
      if (width === 768) {
        expect(geometry.available).toBeGreaterThanOrEqual(208);
        expect(Math.abs(geometry.minY - geometry.maxY)).toBeLessThan(1);
      } else {
        expect(geometry.available).toBeLessThan(208);
        expect(geometry.maxY - geometry.minY).toBeGreaterThan(36);
      }
      for (const label of ['Minimum', 'Maximum']) {
        const input = panel.getByLabel(label, { exact: true });
        await input.fill(label === 'Minimum' ? '1' : '3');
        await expect(input).toHaveValue(label === 'Minimum' ? '1' : '3');
      }
      expect(geometry.right).toBeLessThanOrEqual(geometry.edge + 1);
      await expect(group.getByLabel('Key', { exact: true })).toHaveCount(0);
      if (kind === 'element') {
        await panel.getByLabel('Display name', { exact: true }).fill('Visit label');
        await expect(designer.getByRole('group', { name: 'Visit label', exact: true })).toHaveCount(1);
      }
    });
  }
}

test('field and element card names follow placement labels without renaming stored definitions or keys', async ({
  page,
}) => {
  const designer = await fixture(page);
  await applyPreset(page, 'modular');
  await addElementFixture(page, designer);
  const artifact = await currentTemplate(page);
  const order = (artifact._ui as any).order as string[];
  const labels = (artifact._ui as any).propertyLabels;
  const definitions = order.map((key) => (artifact.properties as any)[key]['schema:name']);
  order.forEach((key, index) => (labels[key] = `Placement label ${index + 1}`));
  await designer.evaluate((el, value) => {
    (el as any).template = value;
  }, artifact);
  for (let index = 0; index < order.length; index++) {
    await expect(designer.getByRole('group', { name: `Placement label ${index + 1}`, exact: true })).toHaveCount(1);
  }
  const saved = await currentTemplate(page);
  expect((saved._ui as any).order).toEqual(order);
  expect(order.map((key) => (saved.properties as any)[key]['schema:name'])).toEqual(definitions);
});
