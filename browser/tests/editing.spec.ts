import { expect, test } from '@playwright/test';
import {
  DESIGNER,
  child,
  clickCentred,
  currentTemplate,
  fieldName,
  fieldOrder,
  openDesigner,
  templateName,
  waitForPublished,
} from './support';

/**
 * Editing, and the things that stop working silently.
 *
 * Under OnPush a view that is never marked dirty simply stops updating, and no
 * unit test sees it — the state is correct and the screen is not. The same is
 * true of an event the host stops receiving, a menu that will not close, and a
 * scroll that finds nothing because it searched the wrong tree.
 */

test('an edit reaches the published template', async ({ page }) => {
  const designer = await openDesigner(page);

  await templateName(page).fill('A renamed study');
  await waitForPublished(page, (template) => template['schema:name'] === 'A renamed study');
});

test('an edit reaches the overview sidebar', async ({ page }) => {
  const designer = await openDesigner(page);

  await fieldName(page, 0).fill('Study title');

  // The sidebar is a sibling view of the same signal. Under OnPush it is the
  // first thing to stop updating when a component is not marked dirty.
  await expect(designer.getByText('Study title', { exact: true }).first()).toBeVisible();
});

test('adding an option redraws the field and republishes', async ({ page }) => {
  const designer = await openDesigner(page);

  await clickCentred(designer.getByRole('button', { name: /Add option/ }).first());

  await expect(designer.getByPlaceholder('Option 3')).toBeVisible();
  await waitForPublished(page, (template) => {
    const properties = template['properties'] as Record<string, Record<string, unknown>>;
    const category = (properties['Category']['items'] as Record<string, unknown>) ?? properties['Category'];
    const constraints = category['_valueConstraints'] as { literals: unknown[] };
    return constraints.literals.length === 3;
  });
});

test('deleting a field removes its card and its child', async ({ page }) => {
  const designer = await openDesigner(page);
  const before = fieldOrder(await currentTemplate(page));

  await clickCentred(designer.locator('[id^=field-card-]').last().getByRole('button').last());

  await expect(designer.locator('[id^=field-card-]')).toHaveCount(before.length - 1);
  await waitForPublished(page, (template) => (template['_ui'] as { order: string[] }).order.length === 2);
});

test('the required checkbox reaches the template', async ({ page }) => {
  const designer = await openDesigner(page);
  const requiredOf = (template: Record<string, unknown>) =>
    (child(template, 'Title')['_valueConstraints'] as { requiredValue: boolean }).requiredValue;

  expect(requiredOf(await currentTemplate(page))).toBe(true);
  await clickCentred(designer.locator('input[type=checkbox]').first());

  /*
   * `_valueConstraints.requiredValue`, not the template's top-level `required`.
   * That array is JSON Schema's, and it names every property an instance must
   * carry — the four provenance keys, `@context`, `@id` and every field — so it
   * lists a field whether or not its author marked it required. The author's flag
   * is the one below, and reading the other is a mistake worth a test of its own.
   */
  await waitForPublished(page, (template) => {
    const properties = template['properties'] as Record<string, Record<string, unknown>>;
    const title = (properties['Title']['items'] as Record<string, unknown>) ?? properties['Title'];
    return (title['_valueConstraints'] as { requiredValue: boolean }).requiredValue === false;
  });
  expect(requiredOf(await currentTemplate(page))).toBe(false);
});

test.describe('identity', () => {
  test('the template keeps its identifier across edits', async ({ page }) => {
    const designer = await openDesigner(page);
    const before = (await currentTemplate(page))['@id'];

    await templateName(page).fill('Renamed');
    await waitForPublished(page, (template) => template['schema:name'] === 'Renamed');

    // The serializer this replaced minted a fresh identifier on every call, so a
    // host listening for changes was told the whole artifact was new on every
    // keystroke.
    expect((await currentTemplate(page))['@id']).toBe(before);
  });

  test('a field keeps its identifier across edits', async ({ page }) => {
    const designer = await openDesigner(page);
    const before = child(await currentTemplate(page), 'Title')['@id'];

    await templateName(page).fill('Renamed again');
    await waitForPublished(page, (template) => template['schema:name'] === 'Renamed again');

    expect(child(await currentTemplate(page), 'Title')['@id']).toBe(before);
  });

  test('reading the template twice gives the same bytes', async ({ page }) => {
    await openDesigner(page);

    const once = JSON.stringify(await currentTemplate(page));
    const twice = JSON.stringify(await currentTemplate(page));

    expect(twice).toBe(once);
  });
});

test.describe('menus', () => {
  test('the file menu opens and closes on a click outside it', async ({ page }) => {
    const designer = await openDesigner(page);

    await designer.getByRole('button', { name: 'File' }).click();
    await expect(designer.getByRole('button', { name: 'Download as JSON' })).toBeVisible();

    await designer.locator('.app-header__brand').click();

    // A mousedown inside the shadow root is retargeted at the host by the time it
    // reaches the document, so reading `event.target` closed every menu on its
    // own opening click. The handler reads the composed path instead.
    await expect(designer.getByRole('button', { name: 'Download as JSON' })).toBeHidden();
  });

  test('the file menu stays open while the pointer is inside it', async ({ page }) => {
    const designer = await openDesigner(page);

    await designer.getByRole('button', { name: 'File' }).click();
    await designer.getByRole('button', { name: 'New Template' }).hover();

    await expect(designer.getByRole('button', { name: 'Download as JSON' })).toBeVisible();
  });
});

test('adding a field scrolls to it without reaching for the document', async ({ page }) => {
  const designer = await openDesigner(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await designer.getByRole('button', { name: /Add Field/ }).click();
  await designer.getByRole('button', { name: 'Text', exact: true }).first().click();

  await expect(designer.locator('[id^=field-card-]')).toHaveCount(4);
  // The scroll used to be `document.getElementById`, which finds nothing in a
  // shadow tree; the component resolves the card from its own root now.
  expect(errors).toEqual([]);
});

test('dragging a field leaves nothing behind in the host document', async ({ page }) => {
  const designer = await openDesigner(page);
  const cards = designer.locator('[id^=field-card-]');
  const source = cards.nth(1);
  const target = cards.nth(0);

  await source.hover();
  await page.mouse.down();
  await target.hover();
  await page.mouse.up();

  // The CDK appends a drag preview to the body by default, where the designer's
  // styles cannot reach it.
  expect(await page.evaluate(() => document.body.querySelectorAll('.cdk-drag-preview').length)).toBe(0);
});

test.describe('unsaved changes', () => {
  test('a new template is not guarded when nothing has changed', async ({ page }) => {
    const designer = await openDesigner(page);
    let asked = false;
    page.on('dialog', (dialog) => {
      asked = true;
      void dialog.dismiss();
    });

    await designer.getByRole('button', { name: 'File' }).click();
    await designer.getByRole('button', { name: 'New Template' }).click();

    expect(asked).toBe(false);
  });

  test('a new template is guarded once a field has been edited', async ({ page }) => {
    const designer = await openDesigner(page);
    let message = '';
    page.on('dialog', (dialog) => {
      message = dialog.message();
      void dialog.dismiss();
    });

    await fieldName(page, 0).fill('Edited');
    await designer.getByRole('button', { name: 'File' }).click();
    await designer.getByRole('button', { name: 'New Template' }).click();

    // The flag this replaced was raised by field reordering and nothing else, so
    // every other edit was discarded without a word.
    expect(message).toContain('unsaved changes');
  });
});

test('the element publishes each edit once', async ({ page }) => {
  const designer = await openDesigner(page);

  await templateName(page).fill('Counted');
  await waitForPublished(page, (template) => template['schema:name'] === 'Counted');

  const names = await page.evaluate(
    () =>
      (window as unknown as { __events: Array<Record<string, unknown>> }).__events.map(
        (template) => template['schema:name'] as string,
      ),
    DESIGNER,
  );
  // One event per distinct state, not one per character: `fill` sets the value in
  // a single input event.
  expect(names.filter((name) => name === 'Counted')).toHaveLength(1);
});
