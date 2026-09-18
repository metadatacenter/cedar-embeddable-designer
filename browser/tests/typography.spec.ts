import { expect, test } from '@playwright/test';
import { openDesigner } from './support';

for (const width of [375, 1280]) {
  test(`collapsed sidebar count fits without covering the icon at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const designer = await openDesigner(page);
    await designer.locator('.user-menu-container button').first().click();
    await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
    await designer.getByRole('radio', { name: /Library Sidebar/ }).check();
    await designer.getByRole('button', { name: 'Done', exact: true }).click();
    await designer.getByTitle('Collapse sidebar', { exact: true }).click();
    const badge = designer.locator('.badge-count-indicator');
    await expect(badge).toBeVisible();
    const geometry = await badge.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const icon = element.parentElement!.querySelector('app-icon')!.getBoundingClientRect();
      const container = element.closest('.collapsed-indicator')!.getBoundingClientRect();
      return {
        size: getComputedStyle(element).fontSize,
        weight: getComputedStyle(element).fontWeight,
        fits: element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight,
        belowIcon: box.top >= icon.bottom,
        inside: box.left >= container.left && box.right <= container.right && box.bottom <= container.bottom,
      };
    });
    expect(geometry).toEqual({ size: '12px', weight: '500', fits: true, belowIcon: true, inside: true });
  });
}
