import {expect, test} from '@playwright/test';
import {openDesigner} from './support';

test('user menus and preferences use the shared surface roles', async ({page}) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', {name: 'User Menu', exact: true}).click();
  const menu = designer.locator('.user-menu-dropdown');
  await expect(menu).toHaveCSS('border-radius', '4px');
  await expect(menu).toHaveCSS('padding', '4px');
  const preferences = menu.getByRole('button', {name: 'Preferences', exact: true});
  await expect(preferences).toHaveCSS('min-height', '36px');
  await expect(preferences).toHaveCSS('padding', '8px 12px');
  await preferences.click();
  const modal = designer.locator('.cedar-modal-surface');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveCSS('border-radius', '4px');
  await expect(modal).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(designer.locator('.cedar-modal-backdrop')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.4)');
});
