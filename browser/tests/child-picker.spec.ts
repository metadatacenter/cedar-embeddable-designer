import { applyPreset } from './support';
import nestedTemplate from '../../src/app/core/model/fixtures/corpus/template-028.json' with { type: 'json' };
import { type Locator, type Page, expect, test } from '@playwright/test';
import {
  addElementFixture,
  currentTemplate,
  expectSharedFocusRing,
  fieldOrder,
  focusedControl,
  nestFixtureFields,
  openDesigner,
} from './support';
import type { CedarEmbeddableDesignerElement, CedJsonObject } from '../../src/app/ced-public-api';

for (const width of [1280, 375])
  test(`at ${width}: stages, removes and cancels selections, then inserts first-class fields through the host contract`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const designer = await openDesigner(page);
    await designer.getByRole('button', { name: /^Add field$/ }).click();
    await expect(designer.getByRole('heading', { name: 'Choose field' })).toBeVisible();
    await expect(designer.getByRole('button', { name: 'Import field' })).toHaveCount(0);
    await applyPreset(page, 'modular');
    await expect(designer.locator('app-insertion-actions').first().getByRole('button')).toHaveCount(3);
    const before = await currentTemplate(page);
    await page.evaluate((section) => {
      section['schema:name'] = 'Section';
      const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
      const field = (element.currentArtifact['properties'] as CedJsonObject)['Title'] as CedJsonObject;
      element.childSource = {
        async search(query) {
          return {
            results:
              query === 'missing'
                ? []
                : [
                    {
                      id: String(field['@id']),
                      name: 'Title',
                      type: 'field',
                      version: '0.0.1',
                      status: 'bibo:draft',
                      modifiedOn: '2026-09-29T12:00:00Z',
                    },
                    {
                      id: String(section['@id']),
                      name: 'Section',
                      type: 'element',
                      version: '0.0.1',
                      modifiedOn: '2026-09-28T12:00:00Z',
                      status: 'http://purl.org/ontology/bibo/status/published',
                    },
                  ],
          };
        },
        async load(row) {
          // The repository stores a field on its own, which states no requirement of itself.
          if (row.type === 'field')
            return {
              ...structuredClone(field),
              _valueConstraints: { ...(field['_valueConstraints'] as CedJsonObject), requiredValue: false },
            };
          return structuredClone(section);
        },
      };
    }, nestedTemplate.properties['Read & Understood Catalog'] as CedJsonObject);
    const open = async () => {
      await designer.getByRole('button', { name: 'Import fields and elements', exact: true }).click();
      await expect(designer.getByRole('dialog')).toBeVisible();
      await designer.getByRole('searchbox').fill('Title');
      await designer.getByRole('button', { name: 'Search', exact: true }).click();
      await designer.getByRole('row', { name: 'Select Title', exact: true }).click();
    };
    await open();
    expect(await currentTemplate(page)).toEqual(before);
    await designer.getByRole('button', { name: 'Remove Title' }).click();
    await expect(designer.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
    await designer.getByRole('row', { name: 'Select Title', exact: true }).click();
    await designer.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await currentTemplate(page)).toEqual(before);
    await open();

    const dialog = designer.getByRole('dialog', { name: 'Import Fields and Elements' });
    const searchbox = dialog.getByRole('searchbox', { name: 'Search fields and elements' });
    await expect(searchbox).toBeVisible();
    await expectSharedFocusRing(searchbox);
    // Cancel and Done close the dialog from its bottom right, as the designer's other dialogs do.
    await page.evaluate(() => document.fonts.ready);
    // A native dialog recentres as its content settles. Read every box in one layout
    // frame so movement between Playwright calls cannot look like misaligned buttons.
    const { frame, results, cancelBox, doneBox } = await dialog.evaluate((element) => {
      const tables = element.querySelectorAll('table');
      const buttons = element.querySelectorAll('.actions button');
      return {
        frame: element.getBoundingClientRect().toJSON(),
        results: tables[tables.length - 1].getBoundingClientRect().toJSON(),
        cancelBox: buttons[0].getBoundingClientRect().toJSON(),
        doneBox: buttons[1].getBoundingClientRect().toJSON(),
      };
    });
    expect(doneBox.y).toBeGreaterThan(results.y + results.height);
    expect(Math.abs(cancelBox.y - doneBox.y)).toBeLessThanOrEqual(1);
    expect(cancelBox.x + cancelBox.width).toBeLessThan(doneBox.x);
    expect(frame.x + frame.width - (doneBox.x + doneBox.width)).toBeLessThan(40);
    await dialog.screenshot({ path: test.info().outputPath('import-dialog.png') });
    // The search field clears with the registry's close glyph, drawn as a mask, rather than the
    // browser's own button. Chromium reports no computed style for that pseudo-element, so the
    // rule that draws it is read instead.
    const masked = await dialog.getByRole('searchbox').evaluate((input) => {
      const root = input.getRootNode() as Document | ShadowRoot;
      const pseudo = '::-webkit-search-cancel-button';
      return [...root.styleSheets, ...root.adoptedStyleSheets]
        .flatMap((sheet) => [...sheet.cssRules])
        .some(
          (rule) =>
            rule instanceof CSSStyleRule &&
            rule.selectorText.endsWith(pseudo) &&
            input.matches(rule.selectorText.slice(0, -pseudo.length)) &&
            rule.style.getPropertyValue('mask-image').startsWith('url("data:image/svg+xml'),
        );
    });
    expect(masked).toBe(true);
    await designer.getByRole('row', { name: 'Select Section', exact: true }).click();
    const selected = dialog.getByRole('table', { name: 'Selected items' });
    await expect(selected.locator('.version-cell')).toHaveText(['0.0.1 · draft', '0.0.1 · published']);
    await expect(dialog.getByRole('table', { name: 'Search results' }).locator('.version-cell')).toHaveText([
      '0.0.1 · draft',
      '0.0.1 · published',
    ]);
    await expect(selected.locator('.status').first()).toHaveCSS('display', 'inline');

    await selected.getByRole('button', { name: 'Reorder Section', exact: true }).press('ArrowUp');
    await expect(selected.locator('tbody .name-cell')).toHaveText(['Section', 'Title']);
    await expect(dialog.getByRole('table', { name: 'Search results' }).getByRole('columnheader')).toHaveText([
      'Type',
      'Name',
      'Last modified',
      'Version',
    ]);
    await expect(selected.locator('th').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    if (width === 1280) {
      const handle = selected.getByRole('button', { name: 'Reorder Title', exact: true });
      const from = (await handle.boundingBox())!;
      const target = (await selected.locator('tbody tr').first().boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2, from.y - 8, { steps: 4 });
      await page.mouse.move(from.x + from.width / 2, target.y + 4, { steps: 12 });
      await page.mouse.up();
      await expect(selected.locator('tbody .name-cell')).toHaveText(['Title', 'Section']);
      await handle.press('ArrowDown');
      await expect(selected.locator('tbody .name-cell')).toHaveText(['Section', 'Title']);
    }
    await page.screenshot({ path: `/tmp/ced-child-dialog-${width}.png` });
    await designer.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(designer.getByRole('dialog')).toHaveCount(0);
    // Each takes its name as its key. A Title is there already, so that key is reported at once and the
    // imported field waits under a usable one until the author chooses.
    expect(fieldOrder(await currentTemplate(page))).toEqual([
      'Title',
      'Category',
      'Publication Date',
      'Section',
      'Title_2',
    ]);
    await expect(designer.locator('.validation-summary')).toContainText('already uses that key');
  });

test('creates an editable element at the insertion position and adds a nested field', async ({ page }) => {
  const designer = await openDesigner(page);
  await expect(designer.getByRole('button', { name: 'Add element', exact: true })).toHaveCount(0);
  await applyPreset(page, 'modular');
  const insert = designer.getByRole('button', { name: 'Add element here', exact: true }).first();
  await insert.focus();
  await insert.click();
  const name = designer.getByRole('textbox', { name: 'Element display name', exact: true }).first();
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('');
  await name.fill('Element');
  expect(fieldOrder(await currentTemplate(page))[0]).toBe('Element');
  await page.mouse.move(0, 0);
  await expect
    .poll(() =>
      designer
        .locator('.insert-zone')
        .evaluateAll((zones) => zones.every((zone) => getComputedStyle(zone).opacity === '0')),
    )
    .toBe(true);
  await expect(designer.locator('app-container-editor app-container-editor input').first()).toBeFocused();
  const nested = designer.locator('app-container-editor app-container-editor').first();
  await expect(nested.locator('.element-toggle')).toHaveCount(0);
  await nested.getByRole('button', { name: 'Add field', exact: true }).click();
  await nested.getByRole('button', { name: 'Text', exact: true }).click();
  const document = await currentTemplate(page);
  expect(fieldOrder((document['properties'] as CedJsonObject)['Element'] as CedJsonObject)).toHaveLength(1);
  await nested.getByRole('button', { name: 'Delete field', exact: true }).click();
  await expect(nested.locator('.element-toggle')).toHaveCount(0);
  await nested.getByRole('button', { name: 'Add field', exact: true }).click();
  await nested.getByRole('button', { name: 'Text', exact: true }).click();
  await nested.getByRole('button', { name: 'Collapse Element', exact: true }).click();
  await nested.getByRole('button', { name: 'Delete element Element', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Delete element?' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  expect(fieldOrder(await currentTemplate(page))).toEqual(['Title', 'Category', 'Publication Date']);
  await expect(designer.getByRole('button', { name: /^Delete element/ })).toHaveCount(0);
});

test('bottom insertion actions reveal on hover and keyboard focus without shifting content', async ({ page }) => {
  const designer = await openDesigner(page);
  const zone = designer.locator('.bottom-insert-zone').first();
  const actions = zone.locator('app-insertion-actions');
  await page.mouse.move(0, 0);
  await expect(actions).toHaveCSS('opacity', '0');
  await zone.scrollIntoViewIfNeeded();
  const before = await zone.boundingBox();
  await zone.hover();
  await expect(actions).toHaveCSS('opacity', '1');
  expect(await zone.boundingBox()).toEqual(before);
  await page.mouse.move(0, 0);
  await expect(actions).toHaveCSS('opacity', '0');
  await actions.getByRole('button', { name: 'Add field', exact: true }).focus();
  await expect(actions).toHaveCSS('opacity', '1');
  await actions.getByRole('button', { name: 'Add field', exact: true }).press('Enter');
  await expect(designer.getByRole('heading', { name: 'Choose field' })).toBeVisible();
});

/**
 * The actions in the gap between two cards cover part of both cards, so WCAG 1.4.13 requires that
 * Escape can dismiss them without the pointer or focus moving. Hidden actions also stop taking the
 * pointer. That change is immediate while opacity fades, so the pointer-events value, not the
 * opacity, shows that a dismissal holds.
 */
test('Escape dismisses the actions between two cards until the pointer or focus leaves and returns', async ({
  page,
}) => {
  const designer = await openDesigner(page);
  // The gap between Title and Category.
  const zone = designer.locator('.insert-zone').nth(1);
  const actions = zone.locator('app-insertion-actions');
  const add = zone.getByRole('button', { name: 'Add field here', exact: true });
  await page.mouse.move(0, 0);
  await zone.scrollIntoViewIfNeeded();
  await expect(zone).toHaveCSS('opacity', '0');
  const gap = (await zone.boundingBox())!;
  // The gap's left end, clear of the centred actions.
  const intoGap = (offset = 0) => page.mouse.move(gap.x + 24 + offset, gap.y + gap.height / 2);

  // An ordinary hover shows the actions. Focus is on the host page, outside the designer.
  await page.evaluate(() => {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    (element as HTMLElement | null)?.blur();
  });
  expect(await focusedControl(page)).toBe('(page)');
  await intoGap();
  await expect(zone).toHaveCSS('opacity', '1');
  await expect(actions).toHaveCSS('pointer-events', 'auto');
  await page.keyboard.press('Escape');
  await expect(zone).toHaveCSS('opacity', '0');
  await intoGap(40);
  await expect(actions).toHaveCSS('pointer-events', 'none');
  await expect(zone).toHaveCSS('opacity', '0');
  // Leaving the gap and coming back shows them again.
  await page.mouse.move(0, 0);
  await intoGap();
  await expect(zone).toHaveCSS('opacity', '1');
  await expect(actions).toHaveCSS('pointer-events', 'auto');

  // Keyboard focus shows them too. Escape hides them and leaves focus where it was.
  await page.mouse.move(0, 0);
  await add.focus();
  await expect(zone).toHaveCSS('opacity', '1');
  await page.keyboard.press('Escape');
  await expect(zone).toHaveCSS('opacity', '0');
  await expect(add).toBeFocused();
  await expect(actions).toHaveCSS('pointer-events', 'none');
  // Focus moving away and back shows them again.
  await page.keyboard.press('Tab');
  await expect(designer.getByRole('group', { name: 'Category' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(add).toBeFocused();
  await expect(zone).toHaveCSS('opacity', '1');
});

test('an Escape the palette uses leaves the actions between two cards shown', async ({ page }) => {
  const designer = await openDesigner(page);
  const zone = designer.locator('.insert-zone').nth(1);
  const palette = designer.locator('app-field-type-picker');
  await zone.scrollIntoViewIfNeeded();
  const gap = (await zone.boundingBox())!;
  await page.mouse.move(gap.x + 24, gap.y + gap.height / 2);
  await zone.getByRole('button', { name: 'Add field here', exact: true }).click();
  await expect(palette).toBeVisible();
  // Once the pointer leaves, the actions show again because the button that opened the palette
  // keeps focus.
  await page.mouse.move(0, 0);
  await expect(zone).toHaveCSS('opacity', '1');
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  await expect(zone).toHaveCSS('opacity', '1');
  await page.keyboard.press('Escape');
  await expect(zone).toHaveCSS('opacity', '0');
});

test('focus moving to the next action between two cards shows the actions again', async ({ page }) => {
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await page.mouse.move(0, 0);
  const zone = designer.locator('.insert-zone').nth(1);
  await zone.getByRole('button', { name: 'Add field here', exact: true }).focus();
  await expect(zone).toHaveCSS('opacity', '1');
  await page.keyboard.press('Escape');
  await expect(zone).toHaveCSS('opacity', '0');
  await expect(zone.locator('app-insertion-actions')).toHaveCSS('pointer-events', 'none');
  // A control that takes focus has to be seen to have it, so each newly focused action shows them.
  await page.keyboard.press('Tab');
  await expect(zone.getByRole('button', { name: 'Add element here', exact: true })).toBeFocused();
  await expect(zone).toHaveCSS('opacity', '1');
});

/** Whether the designer's topmost element at a point of the viewport is part of the insertion actions. */
function actionsTakePointerAt(page: Page, x: number, y: number): Promise<boolean> {
  return page.evaluate(
    ([x, y]) =>
      !!document
        .querySelector('cedar-embeddable-designer')!
        .shadowRoot!.elementFromPoint(x, y)
        ?.closest('app-insertion-actions'),
    [x, y],
  );
}

/**
 * The actions in the gap between Title and Category, the card each half of them lies over, and points
 * on the actions over each card. The points are checked to lie on the cards, so that a later change
 * to the actions' size cannot leave the test measuring something else.
 */
async function actionsOverCards(page: Page) {
  const designer = page.locator('cedar-embeddable-designer');
  const zone = designer.locator('.insert-zone').nth(1);
  const add = zone.getByRole('button', { name: 'Add field here', exact: true });
  const cards = designer.locator('.field-drop-item > .field-drag-container');
  await page.mouse.move(0, 0);
  await zone.scrollIntoViewIfNeeded();
  const gap = (await zone.boundingBox())!;
  const action = (await add.boundingBox())!;
  const above = (await cards.nth(0).boundingBox())!;
  const below = (await cards.nth(1).boundingBox())!;
  const x = action.x + action.width / 2;
  const inGap = gap.y + gap.height / 2;
  const overAbove = (action.y + gap.y) / 2;
  const overBelow = (gap.y + gap.height + action.y + action.height) / 2;
  expect(overAbove).toBeGreaterThan(above.y);
  expect(overAbove).toBeLessThan(above.y + above.height);
  expect(overBelow).toBeGreaterThan(below.y);
  expect(overBelow).toBeLessThan(below.y + below.height);
  return {
    zone,
    add,
    actions: zone.locator('app-insertion-actions'),
    above: cards.nth(0),
    x,
    inGap,
    overAbove,
    overBelow,
  };
}

/**
 * WCAG 1.4.13 asks that the pointer can move onto content that hover shows without it disappearing.
 * The actions are taller than the gap that shows them, so moving onto them means moving over the
 * cards on either side.
 */
test('the actions between two cards stay shown while the pointer moves onto their parts over both cards', async ({
  page,
}) => {
  await openDesigner(page);
  const { zone, actions, above, x, inGap, overAbove, overBelow } = await actionsOverCards(page);
  await page.mouse.move(x, inGap);
  await expect(zone).toHaveCSS('opacity', '1');
  for (const y of [overAbove, overBelow, overAbove]) {
    await page.mouse.move(x, y, { steps: 4 });
    expect(await actionsTakePointerAt(page, x, y)).toBe(true);
    await expect(actions).toHaveCSS('pointer-events', 'auto');
    await expect(zone).toHaveCSS('opacity', '1');
  }
  // Escape over the card above uncovers it, and the pointer is then on the card.
  await page.keyboard.press('Escape');
  await expect(zone).toHaveCSS('opacity', '0');
  expect(await actionsTakePointerAt(page, x, overAbove)).toBe(false);
  const onCard = await above.evaluate(
    (card, [x, y]) => card.contains((card.getRootNode() as ShadowRoot).elementFromPoint(x, y)),
    [x, overAbove],
  );
  expect(onCard).toBe(true);
});

/**
 * Content that hover or focus shows must stay until the hover or focus ends or the author dismisses
 * it. The page clock is faked and run half a minute ahead, so any timer that would hide the actions
 * fires. A timer the test sets for twenty seconds shows that the clock really ran.
 */
test('the actions between two cards persist under hover and under focus, with no timer hiding them', async ({
  page,
}) => {
  await page.clock.install();
  await openDesigner(page);
  const { zone, add, actions, x, inGap } = await actionsOverCards(page);
  const runHalfAMinute = async () => {
    await page.evaluate(() => {
      const holder = window as unknown as { __late?: boolean };
      holder.__late = false;
      setTimeout(() => (holder.__late = true), 20_000);
    });
    await page.clock.runFor(30_000);
    expect(await page.evaluate(() => (window as unknown as { __late?: boolean }).__late)).toBe(true);
  };
  // CSS runs on its own clock, so the test also checks that no transition or animation is left to run.
  const runningAnimations = () =>
    zone.evaluate((zone) => zone.getAnimations({ subtree: true }).map((animation) => animation.id || 'unnamed'));

  await page.mouse.move(x, inGap);
  await expect(zone).toHaveCSS('opacity', '1');
  await runHalfAMinute();
  await expect(actions).toHaveCSS('pointer-events', 'auto');
  await expect(zone).toHaveCSS('opacity', '1');
  expect(await runningAnimations()).toEqual([]);

  await page.mouse.move(0, 0);
  await expect(zone).toHaveCSS('opacity', '0');
  await add.focus();
  await expect(zone).toHaveCSS('opacity', '1');
  await runHalfAMinute();
  await expect(add).toBeFocused();
  await expect(actions).toHaveCSS('pointer-events', 'auto');
  await expect(zone).toHaveCSS('opacity', '1');
  expect(await runningAnimations()).toEqual([]);
});

/**
 * Everything drawn at points across the bottom insertion actions other than the actions, their zone
 * and the boxes that contain the zone. An empty list means the actions cover no other content.
 */
function coveredByBottomActions(zone: Locator): Promise<string[]> {
  return zone.evaluate((zone) => {
    const root = zone.getRootNode() as ShadowRoot;
    const containers = new Set<Node>();
    for (let node: Node | null = zone; node; node = node instanceof ShadowRoot ? node.host : node.parentNode)
      containers.add(node);
    const covered = new Set<string>();
    for (const button of zone.querySelectorAll(':scope > app-insertion-actions button')) {
      const box = button.getBoundingClientRect();
      const points = [
        [box.left + 1, box.top + 1],
        [box.right - 1, box.top + 1],
        [box.left + 1, box.bottom - 1],
        [box.right - 1, box.bottom - 1],
        [(box.left + box.right) / 2, (box.top + box.bottom) / 2],
      ];
      for (const [x, y] of points)
        for (const element of root.elementsFromPoint(x, y))
          if (!zone.contains(element) && !containers.has(element))
            covered.add(`${element.localName}.${[...element.classList].join('.')}`);
    }
    return [...covered];
  });
}

/** Each bottom action's box, to show that revealing the actions draws them where they already were. */
function bottomActionBoxes(zone: Locator): Promise<DOMRect[]> {
  return zone.evaluate((zone) =>
    [...zone.querySelectorAll(':scope > app-insertion-actions button')].map((button) =>
      button.getBoundingClientRect().toJSON(),
    ),
  );
}

/**
 * The bottom insertion actions also appear on hover and focus, but they are drawn in space kept for
 * them, so they cover no other content and the dismissal clause of WCAG 1.4.13 does not apply.
 */
for (const preset of ['basic', 'modular'] as const)
  for (const width of [1280, 375])
    test(`in ${preset} at ${width}, the bottom insertion actions cover nothing when hover or focus shows them`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const designer = await openDesigner(page);
      if (preset !== 'basic') await applyPreset(page, preset);
      const zone = designer.locator('.bottom-insert-zone').first();
      const actions = zone.locator(':scope > app-insertion-actions');
      await page.mouse.move(0, 0);
      await zone.scrollIntoViewIfNeeded();
      await expect(actions).toHaveCSS('opacity', '0');
      const hidden = await bottomActionBoxes(zone);
      expect(hidden).toHaveLength(preset === 'basic' ? 1 : 3);

      await zone.hover();
      await expect(actions).toHaveCSS('opacity', '1');
      expect(await bottomActionBoxes(zone)).toEqual(hidden);
      expect(await coveredByBottomActions(zone)).toEqual([]);

      await page.mouse.move(0, 0);
      await actions.getByRole('button').first().focus();
      await expect(actions).toHaveCSS('opacity', '1');
      expect(await bottomActionBoxes(zone)).toEqual(hidden);
      expect(await coveredByBottomActions(zone)).toEqual([]);
    });

test("a nested element's bottom insertion actions cover nothing when hover shows them", async ({ page }) => {
  const designer = await openDesigner(page);
  await applyPreset(page, 'modular');
  await addElementFixture(page);
  await nestFixtureFields(page, ['Element']);
  const zone = designer.locator('app-container-editor app-container-editor .bottom-insert-zone').first();
  const actions = zone.locator(':scope > app-insertion-actions');
  await page.mouse.move(0, 0);
  await zone.scrollIntoViewIfNeeded();
  await expect(actions).toHaveCSS('opacity', '0');
  const hidden = await bottomActionBoxes(zone);
  await zone.hover();
  await expect(actions).toHaveCSS('opacity', '1');
  expect(await bottomActionBoxes(zone)).toEqual(hidden);
  expect(await coveredByBottomActions(zone)).toEqual([]);
});

for (const kind of ['template', 'element'] as const) {
  test(`empty ${kind}s keep insertion actions visible when new or loaded`, async ({ page }) => {
    const designer = await openDesigner(page);
    await page.mouse.move(0, 0);
    const start = () =>
      page.evaluate(
        (kind) =>
          (document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement).newArtifact(kind),
        kind,
      );
    await start();
    const zone = designer.locator('.bottom-insert-zone');
    const actions = zone.locator('app-insertion-actions');
    await expect(actions).toHaveCSS('opacity', '1');
    await designer
      .getByRole('textbox', { name: kind === 'template' ? 'Template name' : 'Element name', exact: true })
      .fill('Study');
    await expect(actions).toHaveCSS('opacity', '1');
    const before = await zone.boundingBox();
    await zone.hover();
    await page.mouse.move(0, 0);
    await expect(actions).toHaveCSS('opacity', '1');
    expect(await zone.boundingBox()).toEqual(before);
    await zone.hover();
    await expect(actions).toHaveCSS('opacity', '1');
    await page.mouse.move(0, 0);
    await actions.getByRole('button', { name: 'Add field', exact: true }).focus();
    await expect(actions).toHaveCSS('opacity', '1');
    // New and saved empty documents both keep their insertion actions visible.
    await start();
    await expect(actions).toHaveCSS('opacity', '1');
    await designer
      .getByRole('textbox', { name: kind === 'template' ? 'Template name' : 'Element name', exact: true })
      .fill('Another study');
    await page.evaluate(() => {
      const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
      element.loadArtifact(element.currentArtifact);
    });
    await expect(actions).toHaveCSS('opacity', '1');
  });
}

test('bottom insertion actions remain visible on touch devices', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 375, height: 800 },
  });
  try {
    const page = await context.newPage();
    const designer = await openDesigner(page);
    await expect(designer.locator('.bottom-insert-zone app-insertion-actions').first()).toHaveCSS('opacity', '1');
  } finally {
    await context.close();
  }
});
