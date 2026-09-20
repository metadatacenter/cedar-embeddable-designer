import { expect, test } from '@playwright/test';
import { openDesigner } from './support';

test('user menus and preferences use the shared surface roles', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu', exact: true }).click();
  const menu = designer.locator('.user-menu-dropdown');
  await expect(menu).toHaveCSS('border-radius', '4px');
  await expect(menu).toHaveCSS('padding', '4px');
  const preferences = menu.getByRole('button', { name: 'Preferences', exact: true });
  await expect(preferences).toHaveCSS('min-height', '36px');
  await expect(preferences).toHaveCSS('padding', '8px 12px');
  await preferences.click();
  const modal = designer.locator('.cedar-modal-surface');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveCSS('border-radius', '4px');
  await expect(modal).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(designer.locator('.cedar-modal-backdrop')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.4)');
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`menu and modal respect ${reducedMotion} motion and shared layers`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    const designer = await openDesigner(page);
    await designer.getByRole('button', { name: 'User Menu', exact: true }).click();
    const menu = designer.locator('.user-menu-dropdown');
    await expect(menu).toHaveCSS('z-index', '100');
    await expect(menu).toHaveCSS('animation-duration', reducedMotion === 'reduce' ? '1e-05s' : '0.2s');
    await menu.getByRole('button', { name: 'Preferences', exact: true }).click();
    const modal = designer.locator('.cedar-modal-surface');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveCSS('z-index', '1000');
    await expect(modal).toHaveCSS('animation-duration', reducedMotion === 'reduce' ? '1e-05s' : '0.2s');
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(modal).toHaveCount(0);
  });
}
