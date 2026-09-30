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
  // Inspect one rendered snapshot; asynchronously loaded summaries can replace icons.
  const rendered = await icons.evaluateAll((nodes) =>
    nodes.map((icon) => {
      const box = icon.getBoundingClientRect();
      return {
        hidden: icon.getAttribute('aria-hidden'),
        focusable: icon.getAttribute('focusable'),
        stroke: icon.getAttribute('stroke-width'),
        width: box.width,
        height: box.height,
      };
    }),
  );
  for (const icon of rendered) {
    expect(icon.hidden).toBe('true');
    expect(icon.focusable).toBe('false');
    expect(icon.stroke).toBe('2');
    if (icon.width || icon.height) {
      expect([16, 20, 24]).toContain(icon.width);
      expect(icon.height).toBe(icon.width);
    }
  }
});
