import { expect, test } from '@playwright/test';

test('comparison page renders the four real components and applies host profiles', async ({ page }, testInfo) => {
  test.skip(!process.env.CEF_BUNDLE, 'Needs the real CEE/CEF distribution');
  await page.route('**/cedar-embeddable-editor.js', (route) =>
    route.fulfill({ path: process.env.CEF_BUNDLE!, contentType: 'text/javascript' }),
  );
  await page.goto('/style-comparison.html');
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
