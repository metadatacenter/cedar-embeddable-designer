import { test, expect } from '@playwright/test';
import { applyPreset, openDesigner } from './support';

test('complete names wrap and retain single-line editing semantics after resize', async ({ page }) => {
  const designer = await openDesigner(page);
  const name = designer.getByRole('textbox', { name: 'Enter field name', exact: true }).first();
  const value = 'Participant preferred contact information and follow-up availability';
  await name.fill(value);
  await name.press('Enter');
  await expect(name).toHaveValue(value);
  // A pasted line break is discarded as it was by the previous single-line control.
  await name.evaluate((element) => {
    const input = element as HTMLTextAreaElement;
    input.value = 'Participant\nname';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(name).toHaveValue('Participantname');
  await name.fill(value);
  const templateName = designer.getByRole('textbox', { name: 'Template name', exact: true });
  await templateName.fill(value);
  const card = designer.locator('app-field-card').first();
  const expand = card.getByRole('button', { name: 'Expand field settings', exact: true });
  if (await expand.isVisible()) await expand.click();
  await card.getByRole('tab', { name: 'Configuration', exact: true }).click();
  const displayName = card.getByRole('textbox', { name: 'Display name', exact: true });
  for (const width of [1440, 768, 375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const control of [name, templateName, displayName])
      await expect
        .poll(() =>
          control.evaluate((element) => ({
            horizontal: element.scrollWidth <= element.clientWidth + 1,
            vertical: element.scrollHeight <= element.clientHeight + 1,
          })),
        )
        .toEqual({ horizontal: true, vertical: true });
    await expect(name).toHaveValue(value);
  }
  await name.press('Tab');
  await expect(name).not.toBeFocused();
});

test('narrow name remains clickable after dismissing insertion actions', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  const zone = designer.locator('.insert-zone').nth(1);
  await zone.scrollIntoViewIfNeeded();
  const gap = (await zone.boundingBox())!;
  await page.mouse.move(gap.x + 24, gap.y + gap.height / 2);
  const add = zone.getByRole('button', { name: 'Add field here', exact: true });
  await expect(add).toHaveCSS('pointer-events', 'auto');
  await page.keyboard.press('Escape');
  await expect(add).toHaveCSS('pointer-events', 'none');
  const name = designer.getByRole('textbox', { name: 'Enter field name', exact: true }).nth(1);
  await name.click();
  await expect(name).toBeFocused();
});
