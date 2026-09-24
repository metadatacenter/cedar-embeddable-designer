import { addElementFixture, nestFixtureFields } from './support';
import { expect, test } from '@playwright/test';
import { openDesigner } from './support';

for (const width of [1280, 375]) {
  test(`template header click finishes before empty-name errors appear at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    const header = designer.locator('app-container-editor').first().locator(':scope > .template-header-card');
    const name = header.getByPlaceholder('Template name');
    await name.click();
    await expect(designer.locator('.validation-summary')).toHaveCount(0);
    const bounds = (await header.locator('.template-header-card__body').boundingBox())!;
    await page.mouse.move(bounds.x + 8, bounds.y + 10);
    await page.mouse.down();
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    await expect(designer.locator('.validation-summary')).toHaveCount(0);
    await page.mouse.up();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(header.getByRole('button', { name: 'Collapse template settings', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(designer.locator('.validation-summary')).toContainText('1 error — fix before saving');
  });

  test(`header space toggles settings without intercepting controls at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const designer = await openDesigner(page);
    const root = designer.locator('app-container-editor').first();
    const rootHeader = root.locator(':scope > .template-header-card');
    const body = rootHeader.locator('.template-header-card__body');
    const rootToggle = rootHeader.getByRole('button', { name: /template settings/ });
    await body.click({ position: { x: 8, y: 10 } });
    await expect(rootToggle).toHaveAttribute('aria-expanded', 'true');
    await rootHeader.getByPlaceholder('Template name').click();
    await expect(rootToggle).toHaveAttribute('aria-expanded', 'true');
    await body.click({ position: { x: 8, y: 10 } });
    await expect(rootToggle).toHaveAttribute('aria-expanded', 'false');
    await rootHeader.locator('.template-field-label').first().click();
    await expect(rootToggle).toHaveAttribute('aria-expanded', 'true');
    await rootHeader.locator('.template-field-label').first().click();
    await expect(rootToggle).toHaveAttribute('aria-expanded', 'false');
    if (width === 1280) {
      const name = rootHeader.getByPlaceholder('Template name');
      const group = name.locator('..');
      const groupBox = (await group.boundingBox())!;
      const inputBox = (await name.boundingBox())!;
      expect(inputBox.width).toBeLessThan(groupBox.width - 10);
      const position = { x: groupBox.width - 3, y: inputBox.y - groupBox.y + inputBox.height / 2 };
      await group.click({ position });
      await expect(rootToggle).toHaveAttribute('aria-expanded', 'true');
      await group.click({ position });
      await expect(rootToggle).toHaveAttribute('aria-expanded', 'false');
    }
    await rootToggle.focus();
    await page.keyboard.press('Enter');
    await expect(rootToggle).toHaveAttribute('aria-expanded', 'true');
    await rootToggle.click();

    const card = designer.locator('app-field-card').first();
    const header = card.locator('.field-header');
    const toggle = card.getByRole('button', { name: /field settings/ });
    await header.locator('.field-type-icon').click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await header.getByRole('textbox', { name: 'Field name' }).click();
    await header.getByLabel('Allow multiple', { exact: true }).check();
    await header.locator('.field-drag-handle').click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await header.locator('.field-type-icon').click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    if (width === 1280) {
      const heading = header.locator('.field-heading');
      const bounds = (await heading.boundingBox())!;
      await heading.click({ position: { x: bounds.width - 3, y: bounds.height / 2 } });
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await heading.click({ position: { x: bounds.width - 3, y: bounds.height / 2 } });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }

    await page.getByRole('button', { name: 'Basic', exact: true }).click();
    await page.getByRole('button', { name: /Modular/ }).click();
    await addElementFixture(page, root);
    await nestFixtureFields(page, ['element']);
    const element = root.locator('.template-header-card').nth(1);
    const elementBody = element.locator('.template-header-card__body');
    const elementToggle = element.getByRole('button', { name: /element settings/ });
    await elementBody.click({ position: { x: 8, y: 35 } });
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'true');
    await element.locator('.template-field-label').first().click();
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'false');
    await element.locator('.template-field-label').first().click();
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'true');
    await element.getByPlaceholder('Enter element name').click();
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'true');
    await element.locator('.element-toggle').click();
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'true');
    await elementBody.click({ position: { x: 8, y: 35 } });
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: testInfo.outputPath('headers.png') });
  });
}

test('an unnamed field keeps its expanded tabs while its name is edited', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: /^Add field$/ }).click();
  await designer.locator('app-field-type-picker').getByRole('button', { name: 'Text', exact: true }).click();
  const card = designer.locator('app-field-card').last();
  const name = card.getByRole('textbox', { name: 'Field name', exact: true });
  const toggle = card.getByRole('button', { name: /field settings/ });
  await expect(name).toBeFocused();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await name.click();
  await expect(name).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const bounds = (await name.boundingBox())!;
  // A small release outside the input must not become a header-toggle click.
  await page.mouse.move(bounds.x + 1, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x - 1, bounds.y + bounds.height / 2);
  await page.mouse.up();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await name.click();
  await page.keyboard.type('New field');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

for (const kind of ['field', 'element'] as const) {
  for (const width of [1280, 375]) {
    test(`physical ${kind} expand survives blank-name validation at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const designer = await openDesigner(page);
      if (kind === 'element') {
        await designer.getByRole('button', { name: 'Basic', exact: true }).click();
        await designer.getByRole('button', { name: /Modular/ }).click();
      }
      const insert = designer.getByRole('button', { name: `Add ${kind} here`, exact: true }).first();
      await insert.focus();
      await insert.click();
      if (kind === 'field') {
        await designer.locator('app-field-type-picker').getByRole('button', { name: 'Text', exact: true }).click();
      }
      const card = designer.locator(kind === 'field' ? 'app-field-card' : '.nested-header').first();
      const name = card.getByRole('textbox', { name: kind === 'field' ? 'Field name' : 'Element name', exact: true });
      const toggle = card.getByRole('button', { name: `Expand ${kind} settings`, exact: true });
      await expect(name).toBeFocused();
      await card.evaluate((el) => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
      const bounds = (await toggle.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      // Hold across a render; locator clicks can retry after the error moves the button.
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      );
      await page.mouse.up();
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      await expect(card.getByRole('button', { name: `Collapse ${kind} settings`, exact: true })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(card.getByRole('tab', { name: 'Display', exact: true })).toBeVisible();
    });
  }
}

test('keyboard blur still validates a blank name without waiting for a pointer', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: /^Add field$/ }).click();
  await designer.locator('app-field-type-picker').getByRole('button', { name: 'Text', exact: true }).click();
  const name = designer.locator('app-field-card').last().getByRole('textbox', { name: 'Field name', exact: true });
  await expect(name).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
});

test.describe('touch expansion', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 1000 } });
  test('a tap expands an unnamed field and still reports its required name', async ({ page }) => {
    const designer = await openDesigner(page);
    const insert = designer.getByRole('button', { name: 'Add field here', exact: true }).first();
    await insert.focus();
    await insert.click();
    await designer.locator('app-field-type-picker').getByRole('button', { name: 'Text', exact: true }).click();
    const card = designer.locator('app-field-card').first();
    await card.evaluate((el) => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
    const bounds = (await card.getByRole('button', { name: 'Expand field settings', exact: true }).boundingBox())!;
    await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(card.getByRole('textbox', { name: 'Field name', exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(card.getByRole('button', { name: 'Collapse field settings', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
