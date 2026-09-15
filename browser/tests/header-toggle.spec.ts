import { expect, test } from '@playwright/test';
import { openDesigner } from './support';

for (const width of [1280, 375]) {
  test(`header space toggles settings without intercepting controls at ${width}`, async ({ page }) => {
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

    await page.getByRole('button', { name: 'Basic', exact: true }).click();
    await page.getByRole('button', { name: /Modular/ }).click();
    await root.getByRole('button', { name: 'Add Element', exact: true }).click();
    const element = root.locator('.template-header-card').nth(1);
    const elementBody = element.locator('.template-header-card__body');
    const elementToggle = element.getByRole('button', { name: /element settings/ });
    await elementBody.click({ position: { x: 8, y: 35 } });
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'true');
    await element.getByPlaceholder('Element name').click();
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'true');
    await element.locator('.element-toggle').click();
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'true');
    await elementBody.click({ position: { x: 8, y: 35 } });
    await expect(elementToggle).toHaveAttribute('aria-expanded', 'false');
  });
}
