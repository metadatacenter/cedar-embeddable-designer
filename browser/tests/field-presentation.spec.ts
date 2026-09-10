import { test, expect } from '@playwright/test';
import { openDesigner, openSettings, currentTemplate, applyPreset } from './support';

for (const width of [1440, 768, 375]) {
  test(`field settings start collapsed and tabs preserve drafts at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    await expect(designer.getByPlaceholder('Template name')).toHaveValue('');
    await expect(designer.getByRole('button', { name: 'Save field to library' })).toHaveCount(0);
    await expect(designer.getByRole('tab')).toHaveCount(0);
    const card = designer.locator('app-field-card').first();
    const before = await currentTemplate(page);
    const metadata = await openSettings(card, 'Field metadata');
    await metadata.getByLabel('Preferred label', { exact: true }).fill('Unapplied draft');
    await openSettings(card, 'Display');
    await card.getByRole('button', { name: 'Collapse field settings' }).click();
    await expect(card.getByRole('tab')).toHaveCount(0);
    await openSettings(card, 'Field metadata');
    await expect(metadata.getByLabel('Preferred label', { exact: true })).toHaveValue('Unapplied draft');
    expect(await currentTemplate(page)).toEqual(before);
    const tab = card.getByRole('tab', { name: 'Field metadata', exact: true });
    await tab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(card.getByRole('tab', { name: 'Field identity', exact: true })).toBeFocused();
    await expect(card.getByRole('tabpanel', { name: 'Field identity', exact: true })).toBeVisible();
    const measurements = await card.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const arrow = el.querySelector('.settings-toggle')!.getBoundingClientRect();
      return {
        center: Math.abs((arrow.left + arrow.right) / 2 - (rect.left + rect.right) / 2),
        overflow: el.scrollWidth - el.clientWidth,
      };
    });
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
  await expect(designer.getByPlaceholder('0.0.1')).toHaveCSS('text-align', 'right');
});

test('compact cards keep controls close and enabled trash icons black', async ({ page }) => {
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
  expect(spacing.belowPreview).toBeLessThanOrEqual(26);
  expect(spacing.toggleHeight).toBeGreaterThanOrEqual(24);
  await expect(card.getByRole('button', { name: 'Delete field' }).locator('svg')).toHaveCSS('color', 'rgb(0, 0, 0)');
});

test('template header shows stored publication status beside the version', async ({ page }) => {
  const designer = await openDesigner(page);
  const status = designer.getByLabel('Publication status', { exact: true });
  await expect(status).toHaveText('Draft');
  for (const [stored, label] of [
    ['bibo:published', 'Published'],
    ['bibo:draft', 'Draft'],
    [null, 'No publication status'],
  ]) {
    await page.evaluate((value) => {
      const host = document.querySelector('cedar-embeddable-designer') as any;
      const template = structuredClone(host.currentTemplate);
      template['bibo:status'] = value;
      host.template = template;
    }, stored);
    await expect(status).toHaveText(label!);
  }
});
