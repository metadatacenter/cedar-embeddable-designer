import { expect, test } from '@playwright/test';
import { applyPreset, child, currentTemplate, fieldOrder, openDesigner, nestFixtureFields } from './support';

for (const nested of [false, true]) {
  test(`overview reorders ${nested ? 'nested' : 'root'} fields only on drop`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const designer = await openDesigner(page);
    let editor = designer.locator('app-container-editor').first();
    if (nested) {
      await applyPreset(page, 'modular');
      await designer.getByRole('button', { name: 'Add Element', exact: true }).click();
      await nestFixtureFields(page, ['Element'], 2);
      await designer.locator('.overview-panel').getByRole('button', { name: 'Element', exact: true }).click();
      editor = designer.locator('app-container-editor').last();
      await expect(editor.locator('app-field-card input[aria-label="Field name"]').first()).toHaveValue('Title');
      await expect(editor.locator('app-field-card')).toHaveCount(2);
    }
    const outline = designer.locator('app-container-outline').last();
    const rows = outline.locator(':scope > ul > li');
    const handle = rows.first().getByRole('button', { name: 'Reorder Title', exact: true });
    const last = rows.last();
    const before = await currentTemplate(page);
    const names = await editor
      .locator('app-field-card input[aria-label="Field name"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
    const alignment = await rows.first().evaluate((el) => {
      const icon = el.querySelector('.select-node app-icon')!.getBoundingClientRect();
      const handle = el.querySelector('.outline-drag-handle')!.getBoundingClientRect();
      const row = el.querySelector('.outline-row')!.getBoundingClientRect();
      return { iconLeft: icon.left - row.left, handleRight: row.right - handle.right };
    });
    expect(alignment.iconLeft).toBeLessThanOrEqual(10);
    expect(alignment.handleRight).toBeLessThanOrEqual(10);
    const from = (await handle.boundingBox())!;
    const to = (await last.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, { steps: 3 });
    await page.mouse.move(from.x + from.width / 2, to.y + to.height - 2, { steps: 12 });
    await expect(page.locator('.cdk-drag-preview')).toBeVisible();
    expect(await currentTemplate(page)).toEqual(before);
    expect(
      await editor
        .locator('app-field-card input[aria-label="Field name"]')
        .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
    ).toEqual(names);
    await page.mouse.up();
    const expected = [...names.slice(1), names[0]];
    await expect
      .poll(async () =>
        fieldOrder(nested ? child(await currentTemplate(page), 'Element') : await currentTemplate(page)),
      )
      .toEqual(expected);
    await expect
      .poll(async () =>
        editor
          .locator('app-field-card input[aria-label="Field name"]')
          .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
      )
      .toEqual(expected);
  });
}
