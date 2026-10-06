import { test, expect, type Locator } from '@playwright/test';
import {
  openDesigner,
  openSettings,
  currentTemplate,
  applyPreset,
  addElementFixture,
  templateName,
  fieldName,
} from './support';

for (const width of [1440, 768, 375]) {
  test(`field settings start collapsed and tabs preserve live edits at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    await expect(designer.getByPlaceholder('Template name')).toHaveValue('');
    await expect(designer.getByRole('button', { name: 'Save field to library' })).toHaveCount(0);
    await expect(designer.getByRole('tab')).toHaveCount(0);
    const card = designer.locator('app-field-card').first();
    const before = await currentTemplate(page);
    const metadata = await openSettings(card, 'Display');
    await expect(card.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
    await metadata.getByLabel('Name', { exact: true }).fill('Live label');
    await openSettings(card, 'Field metadata');
    await card.getByRole('button', { name: 'Collapse field settings' }).click();
    await expect(card.getByRole('tab')).toHaveCount(0);
    await openSettings(card, 'Display');
    await expect(metadata.getByLabel('Name', { exact: true })).toHaveValue('Live label');
    // One name in two places: the header follows the Display tab as it is typed.
    await expect(card.getByRole('textbox', { name: 'Field display name', exact: true })).toHaveValue('Live label');
    expect(((await currentTemplate(page)).properties as any).Title['skos:prefLabel']).toBe('Live label');
    expect((await currentTemplate(page))['@id']).toEqual(before['@id']);
    const tab = card.getByRole('tab', { name: 'Display', exact: true });
    await tab.focus();
    await page.keyboard.press('End');
    await expect(card.getByRole('tab', { name: 'Field metadata', exact: true })).toBeFocused();
    await expect(card.getByRole('tabpanel', { name: 'Field metadata', exact: true })).toBeVisible();
    const measurements = await card.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const arrow = el.querySelector('.settings-toggle')!.getBoundingClientRect();
      return {
        center: Math.abs((arrow.left + arrow.right) / 2 - (rect.left + rect.right) / 2),
        dragCenter: Math.abs(
          (el.querySelector('.field-drag-handle')!.getBoundingClientRect().left +
            el.querySelector('.field-drag-handle')!.getBoundingClientRect().right) /
            2 -
            (arrow.left + arrow.right) / 2,
        ),
        overflow: el.scrollWidth - el.clientWidth,
      };
    });
    expect(measurements.dragCenter).toBeLessThanOrEqual(1);
    expect(measurements.center).toBeLessThanOrEqual(1);
    expect(measurements.overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `/tmp/ced-tabs-${width}.png` });
  });
}

test('header controls share a vertical center and version is right aligned', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  const card = designer.locator('app-field-card').first();
  const centers = await card.evaluate((el) =>
    ['.field-drag-handle', '[aria-label="Requirement"]', '[aria-label="Delete field"]'].map((s) => {
      const r = el.querySelector(s)!.getBoundingClientRect();
      return r.y + r.height / 2;
    }),
  );
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
  await expect(designer.getByRole('textbox', { name: 'Version', exact: true })).toHaveCSS('text-align', 'right');
});

test('compact cards keep controls close and enabled trash icons themed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const designer = await openDesigner(page);
  const card = designer.locator('app-field-card').first();
  const spacing = await card.evaluate((el) => {
    const cardRect = el.getBoundingClientRect();
    const header = el.querySelector('fieldset')!.getBoundingClientRect();
    const preview = el.querySelector('input[disabled]')!.getBoundingClientRect();
    const toggle = el.querySelector('.settings-toggle')!.getBoundingClientRect();
    return {
      top: header.top - cardRect.top,
      afterHeader: preview.top - header.bottom,
      belowPreview: cardRect.bottom - preview.bottom,
      toggleHeight: toggle.height,
    };
  });
  expect(spacing.top).toBeLessThanOrEqual(8);
  expect(spacing.afterHeader).toBeLessThanOrEqual(6);
  expect(spacing.belowPreview).toBeLessThanOrEqual(18);
  expect(spacing.toggleHeight).toBe(14);
  await designer.evaluate((el) => (el as HTMLElement).style.setProperty('--cedar-color-primary', 'rgb(91, 32, 124)'));
  await expect(card.getByRole('button', { name: 'Delete field' }).locator('svg')).toHaveCSS(
    'color',
    'rgb(91, 32, 124)',
  );
});

test('template header shows stored publication status beside the version', async ({ page }) => {
  const designer = await openDesigner(page);
  const status = designer.getByLabel('Publication status', { exact: true });
  await expect(status).toHaveText('Draft');
  // A template stored without a status is a draft, as the model library and Java read it.
  for (const [stored, label] of [
    ['bibo:published', 'Published'],
    ['bibo:draft', 'Draft'],
    [null, 'Draft'],
  ]) {
    await page.evaluate((value) => {
      const host = document.querySelector('cedar-embeddable-designer') as any;
      const template = structuredClone(host.currentTemplate);
      template['bibo:status'] = value;
      host.template = template;
    }, stored);
    await expect(status).toHaveText(label);
  }
});

test('field headers omit version and publication status', async ({ page }) => {
  const designer = await openDesigner(page);
  for (const [version, status] of [
    [null, null],
    ['1.2.0', null],
    [null, 'bibo:published'],
    ['1.2.0', 'bibo:draft'],
  ]) {
    await page.evaluate(
      ({ version, status }) => {
        const host = document.querySelector('cedar-embeddable-designer') as any;
        const template = structuredClone(host.currentTemplate);
        template.properties.Title['pav:version'] = version;
        template.properties.Title['bibo:status'] = status;
        host.template = template;
      },
      { version, status },
    );
    const identity = designer.locator('app-field-card').first().getByLabel('Field version and publication status');
    await expect(identity).toHaveCount(0);
  }
});

test('an unnamed template, element or field shows a line to write its name on, without moving it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const designer = await openDesigner(page);
  const resolve = (token: string) =>
    designer.evaluate((host, token) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${token})`;
      host.shadowRoot!.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    }, token);
  const rule = await resolve('--cedar-border-rule');
  const primary = await resolve('--cedar-color-primary');
  const underline = (name: Locator) => name.evaluate((el) => getComputedStyle(el).borderBottomColor);
  const line = (name: Locator) => name.evaluate((el) => getComputedStyle(el).backgroundImage);
  const height = (name: Locator) => name.evaluate((el) => el.getBoundingClientRect().height);

  // A template and an element use the header input's own underline, which focus turns primary.
  const template = templateName(page);
  await expect(template).toHaveValue('');
  await expect.poll(() => underline(template)).toBe(rule);
  await template.focus();
  await expect.poll(() => underline(template)).toBe(primary);
  const unnamed = await height(template);
  await template.fill('Study');
  await template.blur();
  await expect.poll(() => underline(template)).toBe('rgba(0, 0, 0, 0)');
  expect(await height(template)).toBe(unnamed);

  await applyPreset(page, 'modular');
  await addElementFixture(page, designer.locator('app-container-editor').first());
  const element = designer.getByPlaceholder('Enter element name');
  await expect.poll(() => underline(element)).toBe('rgba(0, 0, 0, 0)');
  await element.fill('');
  await expect.poll(() => underline(element)).toBe(primary);
  await element.blur();
  await expect.poll(() => underline(element)).toBe(rule);

  // A field name has no border, so its line is drawn inside the box: primary while the card is selected.
  const field = fieldName(page);
  expect(await line(field)).toBe('none');
  const named = await height(field);
  await field.fill('');
  await expect.poll(() => line(field)).toBe(`linear-gradient(${primary}, ${primary})`);
  expect(await height(field)).toBe(named);
  await fieldName(page, 1).focus();
  await expect.poll(() => line(field)).toBe(`linear-gradient(${rule}, ${rule})`);
});

for (const width of [1440, 768, 375]) {
  test(`text constraint inputs align without overflow at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    const card = designer.locator('app-field-card').first();
    await openSettings(card, 'Constraints');
    const fields = card.locator('.constraint-fields');
    const inputs = fields.locator('input');
    const boxes = await inputs.evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right };
      }),
    );
    expect(boxes).toHaveLength(3);
    const bounds = await fields.boundingBox();
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(box.right).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
    }
    if (bounds!.width > 400) {
      expect(Math.max(...boxes.map((b) => b.y)) - Math.min(...boxes.map((b) => b.y))).toBeLessThan(1);
    } else {
      expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
      expect(boxes[2].y).toBeGreaterThan(boxes[1].y);
    }
  });
}
