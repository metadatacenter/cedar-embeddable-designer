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
    await expect
      .poll(() => menu.evaluate((el) => Number.parseFloat(getComputedStyle(el).animationDuration)))
      .toBe(reducedMotion === 'reduce' ? 0.00001 : 0.2);
    await menu.getByRole('button', { name: 'Preferences', exact: true }).click();
    const modal = designer.locator('.cedar-modal-surface');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveCSS('z-index', '1000');
    await expect
      .poll(() => modal.evaluate((el) => Number.parseFloat(getComputedStyle(el).animationDuration)))
      .toBe(reducedMotion === 'reduce' ? 0.00001 : 0.2);
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(modal).toHaveCount(0);
  });
}

for (const name of ['Preferences', 'Define Presets']) {
  test(`${name} action follows host theme states and stays available`, async ({ page }) => {
    const designer = await openDesigner(page);
    await designer.evaluate((el) => {
      const style = (el as HTMLElement).style;
      style.setProperty('--cedar-color-primary', 'rgb(50, 60, 70)');
      style.setProperty('--cedar-color-primary-strong', 'rgb(70, 80, 90)');
    });
    await designer.getByRole('button', { name: 'User Menu', exact: true }).click();
    await designer.locator('.user-menu-dropdown').getByRole('button', { name, exact: true }).click();
    const dialog = designer.locator('.cedar-modal-surface');
    const done = dialog.locator('.settings-dialog-done');
    await expect(done).toBeInViewport();
    await expect(done).toHaveCSS('background-color', 'rgb(50, 60, 70)');
    await done.hover();
    await expect(done).toHaveCSS('background-color', 'rgb(70, 80, 90)');
    await done.click();
    await expect(dialog).toHaveCount(0);
  });
}

test('modal keyboard order respects hidden controls, radio groups and nested widgets', async ({ page }) => {
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu', exact: true }).click();
  await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
  const modal = designer.locator('.cedar-modal-surface');
  await expect(modal).toBeVisible();
  await modal.evaluate((dialog) => {
    const fixture = document.createElement('section');
    fixture.dataset['keyboardFixture'] = '';
    fixture.innerHTML = `
      <button id="keyboard-first">First fixture control</button>
      <button hidden>Hidden control</button>
      <button disabled tabindex="0">Disabled control</button>
      <button tabindex="-1">Script-only control</button>
      <button style="visibility:hidden">Invisible control</button>
      <div inert><span id="inert-shadow"></span></div>
      <div aria-hidden="true"><button>Hidden subtree</button></div>
      <fieldset disabled><input aria-label="Disabled fieldset control"></fieldset>
      <input type="radio" name="keyboard-fixture" aria-label="First radio">
      <input type="radio" name="keyboard-fixture" aria-label="Second radio" checked>
      <span id="keyboard-shadow"></span>
      <button id="keyboard-last">Last fixture control</button>`;
    fixture.querySelector('#inert-shadow')!.attachShadow({ mode: 'open' }).innerHTML =
      '<button>Inert shadow control</button>';
    fixture.querySelector('#keyboard-shadow')!.attachShadow({ mode: 'open' }).innerHTML =
      '<button>Nested fixture control</button>';
    dialog.append(fixture);
  });
  const first = modal.getByRole('button', { name: 'First fixture control', exact: true });
  const nested = modal.getByRole('button', { name: 'Nested fixture control', exact: true });
  const last = modal.getByRole('button', { name: 'Last fixture control', exact: true });
  const firstRadio = modal.getByRole('radio', { name: 'First radio', exact: true });
  const secondRadio = modal.getByRole('radio', { name: 'Second radio', exact: true });
  await first.focus();
  await page.keyboard.press('Tab');
  await expect(secondRadio).toBeFocused();
  // Native arrow-key selection remains responsible for the radio group.
  await page.keyboard.press('ArrowLeft');
  await expect(firstRadio).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(nested).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(firstRadio).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(first).toBeFocused();

  // An inner widget may handle Tab itself; the surrounding modal must not move focus twice.
  await nested.evaluate((button) =>
    button.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key !== 'Tab') return;
      event.preventDefault();
      const root = (button.getRootNode() as ShadowRoot).host.closest('[data-keyboard-fixture]')!;
      root.querySelector<HTMLElement>('#keyboard-last')!.focus();
    }),
  );
  await nested.focus();
  await page.keyboard.press('Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();

  // A modal that temporarily contains no reachable controls still retains the keyboard.
  await modal.evaluate((dialog) => {
    dialog.replaceChildren();
    (dialog as HTMLElement).focus();
  });
  await page.keyboard.press('Tab');
  await expect(modal).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(modal).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});
