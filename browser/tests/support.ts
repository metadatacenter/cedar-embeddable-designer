import { Locator, Page, expect } from '@playwright/test';

/**
 * Reaching into the designer, and waiting for it honestly.
 *
 * Every helper here works through the shadow root, because that is where the
 * designer lives once it is embedded — a test that could find its controls in the
 * light DOM would be testing something the encapsulation is supposed to prevent.
 *
 * Playwright pierces open shadow roots for CSS selectors, so the locators below
 * read as if the boundary were not there. Where a test needs the boundary itself
 * — what leaked, what did not — it asks the page directly.
 */

export const DESIGNER = 'cedar-embeddable-designer';

/** Load a host page and wait until the element has registered and been configured. */
export async function openDesigner(page: Page, query = ''): Promise<Locator> {
  await page.goto(`/host.html${query}`);
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  const designer = page.locator(DESIGNER);
  // The first field card is the earliest sign the editor inside has rendered.
  await expect(designer.locator('[id^=field-card-]').first()).toBeVisible();
  return designer;
}

/** The CEDAR template the element currently holds, read as a host would read it. */
export async function currentTemplate(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    (tag) => (document.querySelector(tag) as unknown as { currentTemplate: Record<string, unknown> }).currentTemplate,
    DESIGNER,
  );
}

/** Every `templateChange` the host has been sent, in order. */
export async function publishedTemplates(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => (window as unknown as { __events: Array<Record<string, unknown>> }).__events);
}

/** The keys of the template's children, in the order the template declares them. */
export function fieldOrder(template: Record<string, unknown>): string[] {
  return (template['_ui'] as { order: string[] }).order;
}

/** One child of the template, unwrapping the array a multi-valued field is written as. */
export function child(template: Record<string, unknown>, key: string): Record<string, unknown> {
  const properties = template['properties'] as Record<string, Record<string, unknown>>;
  const property = properties[key];
  return (property['items'] as Record<string, unknown>) ?? property;
}

/**
 * Wait until the host has been sent a template that satisfies `predicate`.
 *
 * `templateChange` is published from a root effect, so it lands a tick after the
 * edit rather than within the click. Waiting on the event the host actually
 * receives is what makes these tests about the contract rather than about timing.
 */
export async function waitForPublished(
  page: Page,
  predicate: (template: Record<string, unknown>) => boolean,
): Promise<void> {
  await page.waitForFunction(
    (source) => {
      const test = new Function(`return (${source})`)() as (t: Record<string, unknown>) => boolean;
      const events = (window as unknown as { __events: Array<Record<string, unknown>> }).__events;
      return events.some(test);
    },
    predicate.toString(),
  );
}

/** The template's name box, which Angular fills as a property rather than an attribute. */
export function templateName(page: Page): Locator {
  return page.locator(DESIGNER).getByPlaceholder('Template name');
}

/** A field's name box, by position. */
export function fieldName(page: Page, index = 0): Locator {
  return page.locator(DESIGNER).getByPlaceholder('Enter field name').nth(index);
}

/** Open the preview panel, which renders the template with CEE. */
export async function openPreview(page: Page): Promise<Locator> {
  const designer = page.locator(DESIGNER);
  await designer.getByRole('button', { name: /Preview/ }).first().click();
  return designer.locator('app-cee-preview');
}

/**
 * Click a control the designer's own sticky header or an adjacent card overlaps.
 *
 * Adding a field scrolls its card into view with `behavior: 'smooth'`, and
 * Playwright re-scrolls before every click attempt, so the two disagree about
 * where the control is until the animation ends — the actionability check reports
 * the header or a neighbouring card as the topmost element and retries until the
 * test times out. A person scrolls once and clicks.
 *
 * `dispatchEvent` rather than a synthesised mouse press, because what is under
 * test here is what the handler does, not whether the page's own scrolling
 * behaviour and the runner's agree. Where a test is about hit-testing — the
 * click-outside handlers — it uses a real click on something that is plainly
 * visible.
 */
export async function clickCentred(target: Locator): Promise<void> {
  await target.waitFor({ state: 'visible' });
  await target.dispatchEvent('click');
}

/** Open the user menu and apply a preset, which is how field types are made visible. */
export async function applyPreset(page: Page, preset: 'basic' | 'semantic' | 'modular'): Promise<void> {
  const designer = page.locator(DESIGNER);
  await designer.locator('.user-menu-container button').first().click();
  await designer.getByRole('button', { name: 'Preferences' }).click();
  await designer.getByRole('button', { name: preset, exact: true }).click();
  await designer.getByRole('button', { name: 'Done' }).click();
}
