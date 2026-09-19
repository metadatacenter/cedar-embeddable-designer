import { expect, test } from '@playwright/test';

test('comparison page renders the four real components and applies host profiles', async ({ page }, testInfo) => {
  test.skip(!process.env.CEF_BUNDLE, 'Needs the real CEE/CEF distribution');
  await page.route('**/cedar-embeddable-editor.js', (route) =>
    route.fulfill({ path: process.env.CEF_BUNDLE!, contentType: 'text/javascript' }),
  );
  await page.goto('/style-comparison.html');
  await expect(page.locator('.status-reference span')).toHaveCount(4);
  await expect(page.locator('.status-reference .error')).toHaveCSS('background-color', 'rgb(254, 243, 242)');
  await expect(page.getByRole('status')).toContainText('Both bundles loaded');
  for (const id of ['cee', 'cef', 'ced', 'cefd']) {
    await expect(page.locator(`#${id} input`).first()).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('comparison.png'), fullPage: true });
  const email = page.locator('#cef').getByPlaceholder('example@domain.com');
  await email.fill('not-an-email');
  await email.press('Tab');
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  const input = page.locator('#cef input').first();
  const box = page.locator('#cef .mat-mdc-text-field-wrapper').first();
  await expect(box).toHaveCSS('height', '36px');
  await page.getByLabel('Entry density').selectOption('authoring');
  await expect(box).toHaveCSS('height', '32px');
  await page.getByLabel('Host overrides', { exact: false }).check();
  await expect(box).toHaveCSS('height', '40px');
  await input.focus();
  await expect(input).toBeFocused();
  await page.getByLabel('Narrow hosts').check();
  await expect(page.locator('main')).toHaveClass(/narrow/);
  await page.getByLabel('Read-only CEE, CEF and CEFD').check();
  await expect(page.locator('#cefd').getByRole('textbox', { name: 'Field name', exact: true })).toBeDisabled();
});

for (const readOnly of [false, true]) {
  test(`CED follows the CEE visual reference with read-only=${readOnly}`, async ({ page }, testInfo) => {
    test.skip(!process.env.CEF_BUNDLE, 'Needs the approved CEE/CEF distribution');
    await page.route('**/cedar-embeddable-editor.js', (route) =>
      route.fulfill({ path: process.env.CEF_BUNDLE!, contentType: 'text/javascript' }),
    );
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto('/style-comparison.html');
    if (readOnly) await page.getByLabel('Read-only CEE, CEF and CEFD').check();
    const designer = page.locator('#ced cedar-embeddable-designer');
    const reference = page.locator('#cee .template-label');
    const title = designer.getByPlaceholder('Template name');
    await expect(title).toHaveValue('Style comparison');
    for (const property of ['font-family', 'color']) {
      await expect(title).toHaveCSS(
        property,
        await reference.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property),
      );
    }
    await expect(title).toHaveCSS('font-size', '14px');
    await expect(title).toHaveCSS('font-weight', '500');
    await expect(designer.locator('.designer-identity__version')).toBeVisible();
    await expect(designer.locator('.template-header-card__gradient')).toHaveCount(0);
    for (const selector of ['.template-header-card', '.field-drag-container']) {
      const surface = designer.locator(selector).first();
      await expect(surface).toHaveCSS('box-shadow', 'none');
      await expect(surface).toHaveCSS('border-radius', selector === '.template-header-card' ? '4px' : '0px');
      await expect(surface).toHaveCSS('border-top-width', '1px');
      await expect(surface).toHaveCSS(
        'background-color',
        await page.locator('#cee .template-card').evaluate((el) => getComputedStyle(el).backgroundColor),
      );
    }
    for (const width of [520, 375]) {
      await designer.evaluate((el, width) => ((el as HTMLElement).style.width = `${width}px`), width);
      await expect(designer.locator('.overview-panel')).toBeHidden();
      const card = designer.locator('app-field-card').first();
      expect(await card.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(width - 60);
      await expect(designer.locator('.template-field-label').first()).toHaveCSS('text-transform', 'none');
      await designer.screenshot({ path: testInfo.outputPath(`ced-${width}.png`) });
    }
    const fieldName = page.locator('#cefd').getByRole('textbox', { name: 'Field name', exact: true });
    if (readOnly) await expect(fieldName).toBeDisabled();
    else await expect(fieldName).toBeEnabled();
  });
}
