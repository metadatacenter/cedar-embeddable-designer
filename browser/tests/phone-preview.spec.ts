import { expect, test } from '@playwright/test';
import { currentTemplate, openDesigner, openSettings, tabKey } from './support';

for (const embedded of [false, true]) {
  test(`phone Preview returns to the same full-width editing state${embedded ? ' inside a wide host page' : ''}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: embedded ? 1280 : 375, height: 667 });
    const designer = await openDesigner(page, '?cee=stub');
    if (embedded) await designer.evaluate((el) => (el.style.width = '375px'));
    const card = designer.locator('app-field-card').first();
    await card.getByRole('textbox', { name: 'Enter field name', exact: true }).fill('Phone authoring');
    const settings = await openSettings(card, 'Configuration');
    await settings.getByLabel('Display description', { exact: true }).fill('Keep this edit');
    await card.locator('app-property-picker').scrollIntoViewIfNeeded();
    const scroller = designer.locator('.designer-scroll');
    const scroll = await scroller.evaluate((el) => el.scrollTop);
    const artifact = await currentTemplate(page);
    const editorWidth = (await card.boundingBox())!.width;
    expect(editorWidth).toBeGreaterThan(300);

    await designer.getByRole('button', { name: 'Open Preview', exact: true }).click();
    const close = designer.getByRole('button', { name: 'Close Preview', exact: true });
    await expect(close).toBeFocused();
    await expect(scroller).toBeHidden();
    await expect(designer.getByRole('textbox', { name: 'Enter field name', exact: true })).toHaveCount(0);
    const preview = designer.locator('.preview-panel');
    await expect(preview).toBeVisible();
    expect((await preview.boundingBox())!.width).toBeCloseTo((await designer.boundingBox())!.width, 0);
    await page.keyboard.press(tabKey(page));
    await expect(preview.getByRole('combobox', { name: 'Preview mode' })).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(designer.getByRole('button', { name: 'Open Preview', exact: true })).toBeFocused();
    await expect(scroller).toBeVisible();
    await expect(settings).toBeVisible();
    await expect(settings.getByLabel('Display description', { exact: true })).toHaveValue('Keep this edit');
    expect((await card.boundingBox())!.width).toBeCloseTo(editorWidth, 0);
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeCloseTo(scroll, 0);
    expect(await currentTemplate(page)).toEqual(artifact);
  });
}

test('resizing with Preview open keeps the active pane reachable, and Overview returns to editing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 800 });
  const designer = await openDesigner(page, '?cee=stub');
  const name = designer
    .locator('app-field-card')
    .first()
    .getByRole('textbox', { name: 'Enter field name', exact: true });
  await designer.getByRole('button', { name: 'Open Preview', exact: true }).click();
  await expect(name).toBeVisible();
  await name.fill('Retained across resize');
  const artifact = await currentTemplate(page);
  await name.focus();
  // Sample the first painted phone frames: waiting for hidden would miss controls showing
  // through Preview during a visibility transition, even though the final state is correct.
  await designer.evaluate((el) => {
    const frames: string[] = [];
    el.setAttribute('data-phone-frames', 'pending');
    const sample = () => {
      if (el.shadowRoot!.querySelector('.main-content.preview-only')) {
        frames.push(getComputedStyle(el.shadowRoot!.querySelector('.designer-scroll')!).visibility);
        if (frames.length === 4) {
          el.setAttribute('data-phone-frames', JSON.stringify(frames));
          return;
        }
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(designer).not.toHaveAttribute('data-phone-frames', 'pending');
  expect(JSON.parse((await designer.getAttribute('data-phone-frames'))!)).toEqual([
    'hidden',
    'hidden',
    'hidden',
    'hidden',
  ]);
  await expect(designer.locator('.designer-scroll')).toBeHidden();
  await expect(designer.getByRole('button', { name: 'Close Preview', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 900, height: 800 });
  await expect(name).toBeVisible();
  await expect(name).toHaveValue('Retained across resize');
  await expect(designer.locator('.preview-panel')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 667 });
  await designer.getByRole('button', { name: 'Open Overview', exact: true }).click();
  await expect(designer.locator('#ced-overview')).toBeVisible();
  await expect(designer.locator('.preview-panel')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(designer.getByRole('button', { name: 'Open Overview', exact: true })).toBeFocused();
  await expect(name).toBeVisible();
  expect(await currentTemplate(page)).toEqual(artifact);
});
