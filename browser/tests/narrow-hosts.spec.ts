import { expect, test } from '@playwright/test';
import { clickCentred, currentTemplate, focusedControl, openDesigner } from './support';

/**
 * A narrow host keeps every control in reach and in view.
 *
 * Below 768px the Overview takes no column beside the canvas. Its toggle stays in the header and
 * opens it over the canvas, closed until asked for, so outline navigation, Expand all, Collapse all
 * and reordering by clicks or keys remain on a narrow host and at 200% zoom. At 768px and wider the
 * Overview is the column it always was. The Preferences field types, the Define Presets tables and
 * a Types row each change their layout only where their row would otherwise overflow.
 */

for (const width of [375, 767])
  test(`at ${width}px the toggle opens the Overview over the canvas, closed by default`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    const designer = await openDesigner(page);
    const before = await currentTemplate(page);
    const open = designer.getByRole('button', { name: 'Open Overview', exact: true });
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    await expect(designer.locator('.overview-panel')).toHaveCount(0);

    await open.click();
    const close = designer.getByRole('button', { name: 'Close Overview', exact: true });
    await expect(close).toHaveAttribute('aria-expanded', 'true');
    await expect(close).toBeFocused();
    const panel = designer.locator('.overview-panel');
    await expect(panel).toBeVisible();
    // It lies over the canvas, which keeps its full width beneath it.
    const [panelBox, canvasBox] = [
      (await panel.boundingBox())!,
      (await designer.locator('.designer-workspace').boundingBox())!,
    ];
    expect(panelBox.x).toBe(0);
    expect(canvasBox.x).toBe(0);
    expect(panelBox.width).toBeLessThan(canvasBox.width);
    const onTop = await panel.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const top = (element.getRootNode() as ShadowRoot).elementFromPoint(box.x + box.width / 2, box.y + 20);
      return !!top && element.contains(top);
    });
    expect(onTop).toBe(true);
    // A settings toggle on a card beneath it stays beneath it.
    const toggleUnder = await designer
      .locator('app-field-settings .settings-toggle')
      .first()
      .evaluate((toggle) => {
        const box = toggle.getBoundingClientRect();
        const top = (toggle.getRootNode() as ShadowRoot).elementFromPoint(box.x + 2, box.y + box.height / 2);
        return top?.closest('.overview-panel') ? 'panel' : top === toggle || toggle.contains(top) ? 'toggle' : 'other';
      });
    expect(toggleUnder).toBe(
      (await designer.locator('app-field-settings .settings-toggle').first().boundingBox())!.x < panelBox.width
        ? 'panel'
        : 'toggle',
    );
    // It stays where it is while the canvas scrolls beneath it.
    await designer.locator('.designer-scroll').evaluate((scroller) => scroller.scrollBy(0, 200));
    expect((await panel.boundingBox())!.y).toBe(panelBox.y);

    // Its own controls work as in the column.
    await designer.getByRole('button', { name: 'Move Category up', exact: true }).click();
    await expect(panel.locator('.node-name')).toHaveText(['Category', 'Title', 'Publication Date']);

    await close.click();
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toHaveCount(0);
    await designer.getByRole('button', { name: 'Open Overview', exact: true }).click();
    await designer.getByRole('button', { name: 'Move Category down', exact: true }).click();
    await expect(panel.locator('.node-name')).toHaveText(['Title', 'Category', 'Publication Date']);
    expect(await currentTemplate(page)).toEqual(before);
  });

test('Escape in the Overview over the canvas, or on its toggle, closes it and gives focus to the toggle', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const designer = await openDesigner(page);
  const panel = designer.locator('.overview-panel');
  await designer.getByRole('button', { name: 'Open Overview', exact: true }).click();
  await designer.getByRole('button', { name: 'Reorder Category', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(designer.getByRole('button', { name: 'Open Overview', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await expect(designer.getByRole('button', { name: 'Close Overview', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(designer.getByRole('button', { name: 'Open Overview', exact: true })).toBeFocused();
  // Closed, Escape on the toggle does nothing of its own.
  await page.keyboard.press('Escape');
  expect(await focusedControl(page)).toBe('button "Open Overview"');
});

test('at 768px the Overview is a column beside the canvas, open by default, which Escape leaves alone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 812 });
  const designer = await openDesigner(page);
  const close = designer.getByRole('button', { name: 'Close Overview', exact: true });
  await expect(close).toHaveAttribute('aria-expanded', 'true');
  const panel = designer.locator('.overview-panel');
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveClass(/overview-panel--overlay/);
  const [panelBox, canvasBox] = [
    (await panel.boundingBox())!,
    (await designer.locator('.designer-workspace').boundingBox())!,
  ];
  expect(canvasBox.x).toBeGreaterThanOrEqual(panelBox.x + panelBox.width);
  await designer.getByRole('button', { name: 'Reorder Title', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  await close.click();
  await expect(panel).toHaveCount(0);
  await expect(designer.getByRole('button', { name: 'Open Overview', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('a host that turns narrow closes the Overview over the canvas, and turning wide again shows the column', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 812 });
  const designer = await openDesigner(page);
  const panel = designer.locator('.overview-panel');
  await expect(panel).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(designer.getByRole('button', { name: 'Open Overview', exact: true })).toBeVisible();
  await expect(panel).toHaveCount(0);
  await designer.getByRole('button', { name: 'Open Overview', exact: true }).click();
  await expect(panel).toHaveClass(/overview-panel--overlay/);
  await page.setViewportSize({ width: 1280, height: 812 });
  await expect(panel).not.toHaveClass(/overview-panel--overlay/);
  await expect(designer.getByRole('button', { name: 'Close Overview', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(panel).toHaveCount(0);
});

test('the Preferences field types take one column only where two would overflow', async ({ page }) => {
  for (const [width, columns] of [
    [320, 1],
    [375, 2],
    [1280, 2],
  ] as const) {
    await page.setViewportSize({ width, height: 812 });
    const designer = await openDesigner(page);
    await designer.getByRole('button', { name: 'User Menu' }).click();
    await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
    const grid = designer.locator('.preferences-field-grid');
    await expect(grid).toBeVisible();
    const layout = await grid.evaluate((element) => ({
      columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
      sideways: element.scrollWidth > element.clientWidth,
    }));
    expect(layout, `${width}px`).toEqual({ columns, sideways: false });
  }
});

test('each Define Presets table scrolls sideways in a box of its own, only where it is too wide', async ({ page }) => {
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    const designer = await openDesigner(page);
    await designer.getByRole('button', { name: 'User Menu' }).click();
    await designer.getByRole('button', { name: 'Define Presets', exact: true }).click();
    const dialog = designer.getByRole('dialog', { name: 'Define Presets' });
    await expect(dialog).toBeVisible();
    const boxes = dialog.locator('.preset-table-scroll');
    await expect(boxes).toHaveCount(3);
    for (const box of await boxes.all()) await expect(box.locator(':scope > table')).toHaveCount(1);
    const body = dialog.locator('.settings-dialog-body').locator('..');
    expect(await body.evaluate((element) => element.scrollWidth > element.clientWidth), `${width}px`).toBe(false);
    const scrolling = await boxes.evaluateAll((elements) =>
      elements.map((element) => element.scrollWidth > element.clientWidth),
    );
    // At 320px the field type table at least is wider than the dialog; at 1280px none is.
    expect(scrolling.some(Boolean), `${width}px`).toBe(width === 320);
  }
});

test('a Types row puts its buttons beneath the list only where they would not fit beside it', async ({ page }) => {
  for (const [width, beneath] of [
    [320, true],
    [375, true],
    [1280, false],
  ] as const) {
    await page.setViewportSize({ width, height: 812 });
    const designer = await openDesigner(page, '?picker=stub');
    await designer.getByRole('button', { name: 'Expand template settings', exact: true }).click();
    const settings = designer.locator('app-container-settings').first();
    await clickCentred(settings.getByRole('tab', { name: 'Metadata', exact: true }));
    const row = settings.locator('app-types-picker .property');
    await expect(row.getByRole('button', { name: 'Enter IRI manually', exact: true })).toBeVisible();
    const layout = await row.evaluate((element) => {
      const list = element.querySelector('.type-list')!.getBoundingClientRect();
      const placeholder = element.querySelector('.placeholder')!;
      const range = document.createRange();
      range.selectNodeContents(placeholder);
      return {
        rowRight: element.getBoundingClientRect().right,
        list: list.toJSON(),
        lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
        buttons: [...element.querySelectorAll('button')].map((button) => button.getBoundingClientRect().toJSON()),
      };
    });
    for (const button of layout.buttons) {
      expect(button.right, `${width}px`).toBeLessThanOrEqual(layout.rowRight);
      expect(button.top >= layout.list.bottom, `${width}px`).toBe(beneath);
    }
    // No types selected. keeps its words whole.
    expect(layout.lines, `${width}px`).toBeLessThanOrEqual(3);
  }
});
