import { test, expect } from '@playwright/test';
import { openDesigner } from './support';

test('designer icons use shared meanings, square sizes and decorative SVGs', async ({ page }) => {
  const designer = await openDesigner(page);
  await expect(designer.locator('.template-header-card__icon svg')).toHaveAttribute(
    'data-cedar-icon',
    'artifact-template',
  );
  await expect(designer.locator('app-field-card').first().locator('.field-type-icon svg')).toHaveAttribute(
    'data-cedar-icon',
    'field-text',
  );
  const icons = designer.locator('app-icon svg');
  expect(await icons.count()).toBeGreaterThan(5);
  for (const icon of await icons.all()) {
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expect(icon).toHaveAttribute('focusable', 'false');
    await expect(icon).toHaveAttribute('stroke-width', '2');
    const box = await icon.boundingBox();
    if (box) {
      expect([16, 20, 24]).toContain(box.width);
      expect(box.height).toBe(box.width);
    }
  }
});
