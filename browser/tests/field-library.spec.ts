import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  openSettings,
  openDesigner,
  currentTemplate,
  child,
  applyPreset,
  fieldOrder,
  focusedControl,
  tabSequence,
} from './support';

test('Field Designer is absent in every authoring profile', async ({ page }) => {
  const designer = await openDesigner(page);
  for (const preset of ['basic', 'modular', 'semantic'] as const) {
    await applyPreset(page, preset);
    await expect(designer.getByRole('button', { name: 'Field Designer', exact: true })).toHaveCount(0);
  }
});

test('published first-class fields show lifecycle information while their definition stays read-only', async ({
  page,
}) => {
  const designer = await openDesigner(page);
  const source = await currentTemplate(page);
  const field = child(source, 'Title');
  field['pav:version'] = '1.2.0';
  field['bibo:status'] = 'bibo:published';
  await designer.evaluate((node, template) => {
    (node as unknown as { template: unknown }).template = template;
  }, source);
  await expect(designer.getByLabel('Field version and publication status')).toHaveCount(0);
  // The header edits the name the template shows the field by, which is the template's to change.
  await expect(designer.getByPlaceholder('Enter field name').first()).toBeEnabled();
  const display = await openSettings(designer.locator('app-field-card').first(), 'Presentation');
  await expect(display.getByLabel('Field name', { exact: true })).toBeDisabled();
  // The version and publication status are on the Version tab.
  const version = await openSettings(designer.locator('app-field-card').first(), 'Version');
  await expect(version).toContainText('1.2.0');
  await expect(version).toContainText('Published');
});

test('dragging the divider below the sidebar field list resizes the list within 10% and 75% of the sidebar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).click();
  await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
  await designer.getByRole('radio', { name: /Library Sidebar/ }).check();
  await designer.getByRole('button', { name: 'Done', exact: true }).click();
  const list = designer.locator('.sidebar-section').first();
  const divider = designer.locator('.resizable-divider');
  await expect(divider).toBeVisible();
  // The share of the sidebar's height the list is given. The panel below takes the rest.
  const share = () => list.evaluate((section) => parseFloat(section.style.height));
  const drag = async (toY: number) => {
    const handle = (await divider.boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, toY, { steps: 5 });
    await page.mouse.up();
  };

  // The divider follows the pointer, and the list grows by as much.
  const before = (await list.boundingBox())!;
  const handle = (await divider.boundingBox())!;
  const pointer = handle.y + handle.height / 2 + 150;
  await drag(pointer);
  const after = (await divider.boundingBox())!;
  expect(pointer).toBeGreaterThanOrEqual(after.y - 1);
  expect(pointer).toBeLessThanOrEqual(after.y + after.height + 1);
  expect((await list.boundingBox())!.height - before.height).toBeCloseTo(150, -1);

  // The list keeps its bounds however far the divider is dragged.
  await drag(899);
  expect(await share()).toBe(75);
  await drag(0);
  expect(await share()).toBe(10);
});

test('the divider below the sidebar field list resizes the list from the keyboard within the same bounds', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).click();
  await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
  await designer.getByRole('radio', { name: /Library Sidebar/ }).check();
  await designer.getByRole('button', { name: 'Done', exact: true }).click();
  const before = await currentTemplate(page);
  const list = designer.locator('.sidebar-section').first();
  const divider = designer.getByRole('separator', { name: 'Resize field list' });
  const share = () => list.evaluate((section) => parseFloat(section.style.height));
  await expect(divider).toHaveAttribute('aria-orientation', 'horizontal');
  await expect(divider).toHaveAttribute('aria-valuenow', '33');
  await expect(divider).toHaveAttribute('aria-valuetext', '33 percent of the sidebar');

  // The arrow keys move the divider by 5 points, 10 with Shift, and the list follows it.
  await divider.press('ArrowDown');
  await expect(divider).toHaveAttribute('aria-valuenow', '38');
  expect(await share()).toBe(38);
  await divider.press('Shift+ArrowUp');
  await expect(divider).toHaveAttribute('aria-valuenow', '28');

  // Home and End set the limits a drag keeps, and the arrow keys cannot pass them.
  await divider.press('End');
  await divider.press('ArrowDown');
  await expect(divider).toHaveAttribute('aria-valuenow', '75');
  expect(await share()).toBe(75);
  await divider.press('Home');
  await divider.press('ArrowUp');
  await expect(divider).toHaveAttribute('aria-valuenow', '10');
  expect(await share()).toBe(10);
  expect(await currentTemplate(page)).toEqual(before);
});

test('a click on the divider below the sidebar field list steps it through 10%, the default and 75%', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).click();
  await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
  await designer.getByRole('radio', { name: /Library Sidebar/ }).check();
  await designer.getByRole('button', { name: 'Done', exact: true }).click();
  const before = await currentTemplate(page);
  const list = designer.locator('.sidebar-section').first();
  const divider = designer.getByRole('separator', { name: 'Resize field list' });
  const share = () => list.evaluate((section) => parseFloat(section.style.height));
  await expect(divider).toHaveAttribute('aria-valuenow', '33');
  // From the default to the largest share, then wrapping to the smallest and back to the default.
  for (const [now, exact] of [
    ['75', 75],
    ['10', 10],
    ['33', 33.33],
    ['75', 75],
  ] as const) {
    await divider.click();
    await expect(divider).toHaveAttribute('aria-valuenow', now);
    expect(await share()).toBe(exact);
  }
  // From a share the keys left between two presets, a click steps to the larger one.
  await divider.press('Home');
  await divider.press('ArrowDown');
  await expect(divider).toHaveAttribute('aria-valuenow', '15');
  await divider.click();
  await expect(divider).toHaveAttribute('aria-valuenow', '33');
  // A drag is no click: it leaves the divider where the pointer put it.
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 120, { steps: 6 });
  await page.mouse.up();
  const dragged = Number(await divider.getAttribute('aria-valuenow'));
  expect(dragged).toBeGreaterThan(40);
  expect(dragged).toBeLessThan(75);
  expect(await currentTemplate(page)).toEqual(before);
});

/** The designer with the library sidebar chosen in Preferences, in place of the inline palette. */
async function openWithSidebar(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: 1440, height: 900 });
  const designer = await openDesigner(page);
  await designer.getByRole('button', { name: 'User Menu' }).click();
  await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
  await designer.getByRole('radio', { name: /Library Sidebar/ }).check();
  await designer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(designer.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
  return designer;
}

test("the sidebar's field list is a listbox and one Tab stop, which the arrow keys, Home and End move within", async ({
  page,
}) => {
  const designer = await openWithSidebar(page);
  const before = await currentTemplate(page);
  const list = designer.getByRole('listbox', { name: 'Fields (3)', exact: true });
  const options = list.getByRole('option');
  await expect(options).toHaveText(['Title', 'Category', 'Publication Date']);
  for (const option of await options.all()) await expect(option).toHaveAttribute('aria-selected', 'false');

  // Tab reaches the list once, at its first entry while no field is selected.
  await designer.getByRole('button', { name: 'Collapse sidebar' }).focus();
  expect(await tabSequence(page, 1)).toEqual(['option "Title"']);
  // The focused entry shows the shared focus ring, drawn inside the entry so the list cannot clip it.
  const ring = await options.first().evaluate((entry) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--cedar-control-focus, var(--cedar-color-primary))';
    entry.after(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    const style = getComputedStyle(entry);
    return {
      visible: entry.matches(':focus-visible'),
      style: style.outlineStyle,
      color: style.outlineColor === expected,
      width: style.outlineWidth,
      offset: style.outlineOffset,
    };
  });
  expect(ring).toEqual({ visible: true, style: 'solid', color: true, width: '2px', offset: '-2px' });

  // The arrow keys move focus and stop at the ends. Nothing is selected, and the document is untouched.
  for (const [key, stop] of [
    ['ArrowDown', 'Category'],
    ['ArrowDown', 'Publication Date'],
    ['ArrowDown', 'Publication Date'],
    ['Home', 'Title'],
    ['ArrowUp', 'Title'],
    ['End', 'Publication Date'],
    ['ArrowUp', 'Category'],
  ]) {
    await page.keyboard.press(key);
    expect(await focusedControl(page), key).toBe(`option "${stop}"`);
  }
  for (const option of await options.all()) await expect(option).toHaveAttribute('aria-selected', 'false');
  expect(await currentTemplate(page)).toEqual(before);

  // Tab leaves the list from wherever the arrow keys went, and Shift+Tab re-enters it at one stop:
  // the first entry again, while no field is selected.
  expect(await tabSequence(page, 1)).toEqual(['separator "Resize field list"']);
  await expect(options.first()).toHaveAttribute('tabindex', '0');
  expect(await tabSequence(page, 2, 'Shift+Tab')).toEqual(['option "Title"', 'button "Collapse sidebar"']);
});

test("the sidebar's list marks the selected field's entry and gives it the Tab stop", async ({ page }) => {
  const designer = await openWithSidebar(page);
  const options = designer.getByRole('listbox', { name: 'Fields (3)', exact: true }).getByRole('option');
  // A click on an entry selects its field, as before, and the entry says so.
  await options.nth(1).click();
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'false');
  await expect(designer.locator('.field-drag-container.selected')).toHaveAccessibleName('Category');
  // The list is then entered at the selected field's entry.
  await designer.getByRole('button', { name: 'Collapse sidebar' }).focus();
  expect(await tabSequence(page, 1)).toEqual(['option "Category"']);
});

test('dragging a sidebar entry by its handle still reorders the fields', async ({ page }) => {
  const designer = await openWithSidebar(page);
  const entries = designer.locator('.draggable-field-item');
  await expect(entries).toHaveText(['Title', 'Category', 'Publication Date']);
  const from = (await entries.first().locator('.draggable-handle').boundingBox())!;
  const to = (await entries.last().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, { steps: 3 });
  await page.mouse.move(from.x + from.width / 2, to.y + to.height - 2, { steps: 12 });
  await expect(page.locator('.cdk-drag-preview')).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(async () => fieldOrder(await currentTemplate(page)))
    .toEqual(['Category', 'Publication Date', 'Title']);
  await expect(entries).toHaveText(['Category', 'Publication Date', 'Title']);
});

/**
 * Each section's box, the sidebar's and the content area's, and whether a pointer at the middle of the
 * insertion actions' first button, and of the libraries' last button once their list is scrolled to its
 * end, reaches that button.
 */
async function sidebarLayout(page: Page) {
  const designer = page.locator('cedar-embeddable-designer');
  await designer
    .locator('app-field-library-sidebar .sidebar-section--rest .sidebar-scrollable')
    .evaluate((list) => (list.scrollTop = list.scrollHeight));
  return designer.locator('app-field-library-sidebar .sidebar-container').evaluate((sidebar) => {
    const box = (element: Element) => element.getBoundingClientRect();
    const reached = (button: Element) => {
      const { x, y, width, height } = box(button);
      return button.contains((button.getRootNode() as ShadowRoot).elementFromPoint(x + width / 2, y + height / 2));
    };
    const sections = sidebar.querySelectorAll('.sidebar-section');
    const main = sidebar.closest('.main-content')!;
    return {
      sidebar: box(sidebar).toJSON(),
      main: box(main).toJSON(),
      mainScrolled: main.scrollTop,
      fieldList: box(sections[0]).toJSON(),
      libraries: box(sections[1]).toJSON(),
      insertionReached: reached(sidebar.querySelector('app-insertion-actions button')!),
      lastReached: reached([...sections[1].querySelectorAll('.btn-add-item')].at(-1)!),
    };
  });
}

test('at the default share the libraries end at the sidebar edge, however many fields the list holds', async ({
  page,
}) => {
  const designer = await openWithSidebar(page);
  for (const count of [3, 18]) {
    if (count === 18)
      for (let added = 0; added < 15; added++)
        await designer.locator('app-field-library-sidebar .btn-add-item').first().click();
    await expect(designer.getByRole('listbox').getByRole('option')).toHaveCount(count);
    const layout = await sidebarLayout(page);
    // Nothing overruns the content area, so nothing scrolls it out of place.
    expect(layout.mainScrolled, `${count} fields`).toBe(0);
    expect(layout.sidebar.top, `${count} fields`).toBe(layout.main.top);
    expect(layout.sidebar.bottom, `${count} fields`).toBe(layout.main.bottom);
    // The field list keeps its share of the sidebar, and the libraries take the rest.
    expect(layout.fieldList.height, `${count} fields`).toBeCloseTo((layout.sidebar.height * 33.33) / 100, 0);
    expect(Math.abs(layout.libraries.bottom - layout.sidebar.bottom), `${count} fields`).toBeLessThanOrEqual(1);
    // A pointer reaches both the insertion actions above and the libraries' last button. Under load
    // the designer can still be settling when the layout is first read, so ask until it has.
    await expect
      .poll(
        async () => {
          const settled = await sidebarLayout(page);
          return [settled.insertionReached, settled.lastReached];
        },
        { message: `${count} fields` },
      )
      .toEqual([true, true]);
  }
});
