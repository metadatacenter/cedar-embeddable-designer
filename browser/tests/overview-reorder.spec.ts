import { addElementFixture } from './support';
import { expect, test } from '@playwright/test';
import { applyPreset, child, currentTemplate, fieldOrder, openDesigner, nestFixtureFields } from './support';

for (const nested of [false, true]) {
  test(`overview reorders ${nested ? 'nested' : 'root'} fields only on drop`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const designer = await openDesigner(page);
    let editor = designer.locator('app-container-editor').first();
    if (nested) {
      await applyPreset(page, 'modular');
      await addElementFixture(page, designer);
      await nestFixtureFields(page, ['Element'], 2);
      await designer.locator('.overview-panel').getByRole('button', { name: 'Element', exact: true }).click();
      editor = designer.locator('app-container-editor').last();
      await expect(editor.locator('app-field-card input[aria-label="Enter field name"]').first()).toHaveValue('Title');
      await expect(editor.locator('app-field-card')).toHaveCount(2);
    }
    const outline = designer.locator('app-container-outline').last();
    const rows = outline.locator(':scope > ul > li');
    const handle = rows.first().getByRole('button', { name: 'Reorder Title', exact: true });
    const last = rows.last();
    const before = await currentTemplate(page);
    const names = await editor
      .locator('app-field-card input[aria-label="Enter field name"]')
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
        .locator('app-field-card input[aria-label="Enter field name"]')
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
          .locator('app-field-card input[aria-label="Enter field name"]')
          .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
      )
      .toEqual(expected);
  });
}

test('Overview elements collapse individually and together without changing the document', async ({ page }) => {
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await addElementFixture(page, designer);
  await nestFixtureFields(page, ['Element'], 2);
  const overview = designer.locator('.overview-panel');
  const before = await currentTemplate(page);
  const toggle = overview.getByRole('button', { name: 'Collapse Element', exact: true });
  await toggle.click();
  await expect(overview.getByRole('button', { name: /^Title/ })).toBeHidden();
  const element = designer.locator('app-container-editor').last();
  const content = element.locator(':scope > .container-content');
  await expect(content).toBeHidden();
  await overview.getByRole('button', { name: 'Expand Element', exact: true }).click();
  await expect(overview.getByRole('button', { name: /^Title/ })).toBeVisible();
  await expect(content).toBeVisible();
  await element.getByRole('button', { name: 'Collapse Element', exact: true }).click();
  await expect(overview.getByRole('button', { name: /^Title/ })).toBeHidden();
  await element.getByRole('button', { name: 'Expand Element', exact: true }).click();
  await expect(overview.getByRole('button', { name: /^Title/ })).toBeVisible();
  await overview.getByRole('button', { name: 'Collapse all elements', exact: true }).click();
  await expect(content).toBeHidden();
  await expect(overview.getByRole('button', { name: /^Title/ })).toBeHidden();
  await overview.getByRole('button', { name: 'Expand all elements', exact: true }).click();
  await expect(overview.getByRole('button', { name: /^Title/ })).toBeVisible();
  await expect(content).toBeVisible();
  expect(await currentTemplate(page)).toEqual(before);
});

test('Move up and Move down reorder a child by single clicks and do nothing at either end', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const designer = await openDesigner(page);
  const rows = designer.locator('app-container-outline').first().locator(':scope > ul > li');
  const names = () => rows.locator('.node-name').allTextContents();
  const cards = () =>
    designer
      .locator('app-field-card input[aria-label="Enter field name"]')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  const button = (name: string) => designer.getByRole('button', { name, exact: true });

  // Each row has both, named after its child, beside the handle and at least the minimum target size.
  for (const name of ['Title', 'Category', 'Publication Date']) {
    const row = rows.filter({ has: page.getByRole('button', { name: `Reorder ${name}`, exact: true }) });
    const boxes = await row
      .locator('.outline-move, .outline-drag-handle')
      .evaluateAll((controls) =>
        controls.map((control) => [control.getAttribute('aria-label'), control.getBoundingClientRect().toJSON()]),
      );
    expect(boxes.map(([label]) => label)).toEqual([`Move ${name} up`, `Move ${name} down`, `Reorder ${name}`]);
    for (const [, box] of boxes.slice(0, 2)) {
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
  }
  // At either end the button is marked disabled but stays focusable.
  await expect(button('Move Title up')).toHaveAttribute('aria-disabled', 'true');
  await button('Move Title up').focus();
  await expect(button('Move Title up')).toBeFocused();
  await expect(button('Move Publication Date down')).toHaveAttribute('aria-disabled', 'true');
  for (const name of ['Move Title down', 'Move Category up', 'Move Category down', 'Move Publication Date up'])
    await expect(button(name)).not.toHaveAttribute('aria-disabled');

  await button('Move Category up').click();
  await expect.poll(names).toEqual(['Category', 'Title', 'Publication Date']);
  await expect
    .poll(async () => fieldOrder(await currentTemplate(page)))
    .toEqual(['Category', 'Title', 'Publication Date']);
  await expect.poll(cards).toEqual(['Category', 'Title', 'Publication Date']);
  await expect(button('Move Category up')).toHaveAttribute('aria-disabled', 'true');
  await expect(button('Move Title up')).not.toHaveAttribute('aria-disabled');

  // A click at the end changes nothing. Playwright treats aria-disabled as disabled, so it is forced.
  const before = await currentTemplate(page);
  await button('Move Category up').click({ force: true });
  await button('Move Category down').click();
  await button('Move Category down').click();
  await expect.poll(names).toEqual(['Title', 'Publication Date', 'Category']);
  await button('Move Category down').click({ force: true });
  await page.waitForTimeout(200);
  expect(await names()).toEqual(['Title', 'Publication Date', 'Category']);
  expect(fieldOrder(await currentTemplate(page))).toEqual(['Title', 'Publication Date', 'Category']);
  expect(fieldOrder(before)).toEqual(['Category', 'Title', 'Publication Date']);
});

test('Move up and Move down move a child within its own element only', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await addElementFixture(page, designer);
  await nestFixtureFields(page, ['Element'], 2);
  const overview = designer.locator('.overview-panel');
  const nested = overview.locator('app-container-outline app-container-outline').first();
  await expect(nested.locator('.node-name')).toHaveText(['Title', 'Category']);
  // The nested list is a container of its own: its first child cannot move up into the template.
  await expect(nested.getByRole('button', { name: 'Move Title up', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await nested.getByRole('button', { name: 'Move Title down', exact: true }).click();
  await expect(nested.locator('.node-name')).toHaveText(['Category', 'Title']);
  await expect
    .poll(async () => fieldOrder(child(await currentTemplate(page), 'Element')))
    .toEqual(['Category', 'Title']);
});

test('Move up and Move down are disabled in a read-only designer, as the handle is', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.evaluate(() => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { readOnly: boolean }).readOnly = true;
  });
  const row = designer.locator('app-container-outline li').nth(1);
  await expect(row.getByRole('button', { name: 'Reorder Category', exact: true })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Move Category up', exact: true })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Move Category down', exact: true })).toBeDisabled();
});
