import { addElementFixture } from './support';
import { expect, test } from '@playwright/test';
import { openDesigner } from './support';

for (const width of [1280, 375]) {
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
    const element = root.locator('.template-header-card').nth(1);
    const elementBody = element.locator('.template-header-card__body');
    const elementToggle = element.getByRole('button', { name: /element settings/ });
    await elementBody.click({ position: { x: 8, y: 35 } });
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'true');
    await element.locator('.template-field-label').first().click();
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'false');
    await element.locator('.template-field-label').first().click();
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'true');
    await element.getByPlaceholder('Element name').click();
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'true');
    await element.locator('.element-toggle').click();
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'true');
    await elementBody.click({ position: { x: 8, y: 35 } });
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: testInfo.outputPath('headers.png') });
  });
}
