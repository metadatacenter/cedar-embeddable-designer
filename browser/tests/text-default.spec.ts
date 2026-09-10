import { expect, test, Page } from '@playwright/test';
import { openSettings, applyPreset, child, currentTemplate, openDesigner, publishedTemplates } from './support';

// By default the contract is hermetic. CEF_BUNDLE exercises the same tests against
// a real, built CEE sibling bundle, including both nested shadow roots.
async function withFieldElement(page: Page): Promise<void> {
  if (!process.env.CEF_BUNDLE) {
    await page.addInitScript(() => {
      class FieldElement extends HTMLElement {
        private box = document.createElement('input');
        private held: { kind: 'none' } | { kind: 'literal'; value: string } = { kind: 'none' };
        config: unknown;
        constructor() {
          super();
          this.attachShadow({ mode: 'open' }).append(this.box);
          this.box.addEventListener('input', () => {
            this.held = this.box.value ? { kind: 'literal', value: this.box.value } : { kind: 'none' };
            this.dispatchEvent(
              new CustomEvent('valueChange', {
                bubbles: true,
                composed: true,
                detail: { value: this.held, valid: true },
              }),
            );
          });
        }
        set fieldObject(field: Record<string, unknown>) {
          if (field['@type'] !== 'https://schema.metadatacenter.org/core/TemplateField') {
            throw new Error('Expected a field artifact');
          }
          // A field assignment rebuilds the live control in CEF. Detect accidental
          // assignments during typing by dropping the marker used below.
          this.box.removeAttribute('data-kept');
          this.box.value = '';
          this.held = { kind: 'none' };
        }
        set value(value: { kind: 'none' } | { kind: 'literal'; value: string }) {
          this.held = value;
          this.box.value = value.kind === 'literal' ? value.value : '';
        }
        get currentValue() {
          return this.held;
        }
      }
      customElements.define('cedar-embeddable-field', FieldElement);
    });
  }
  await openDesigner(page);
  await applyPreset(page, 'semantic');
  await openSettings(page.locator('app-field-card').first());
  if (process.env.CEF_BUNDLE) {
    await page.addScriptTag({ path: process.env.CEF_BUNDLE });
    await page.waitForFunction(() => !!customElements.get('cedar-embeddable-field'));
  }
}

function defaultOf(template: Record<string, unknown>): unknown {
  return (child(template, 'Title')['_valueConstraints'] as Record<string, unknown>)['defaultValue'];
}

test('a text default is edited through CEF, published, and cleared without rebuilding while typing', async ({
  page,
}) => {
  await withFieldElement(page);
  const input = page
    .locator('.field-drop-item')
    .first()
    .locator('app-field-default-value cedar-embeddable-field input');
  await expect(input).toBeVisible();
  await input.evaluate((node) => node.setAttribute('data-kept', 'yes'));
  await input.pressSequentially('Untitled study', { delay: 25 });
  await expect.poll(async () => defaultOf(await currentTemplate(page))).toBe('Untitled study');
  await expect.poll(async () => defaultOf((await publishedTemplates(page)).at(-1)!)).toBe('Untitled study');
  await expect(input).toHaveAttribute('data-kept', 'yes');
  await expect(input).toBeFocused();
  await input.fill('');
  await expect.poll(async () => defaultOf(await currentTemplate(page))).toBeUndefined();
});

test('opening a saved template supplies its text default to CEF', async ({ page }) => {
  await withFieldElement(page);
  const template = await currentTemplate(page);
  (child(template, 'Title')['_valueConstraints'] as Record<string, unknown>)['defaultValue'] = 'Saved title';
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = template;
  }, template);
  await openSettings(page.locator('app-field-card').first());
  const input = page
    .locator('.field-drop-item')
    .first()
    .locator('app-field-default-value cedar-embeddable-field input');
  await expect(input).toHaveValue('Saved title');
  await expect.poll(async () => defaultOf(await currentTemplate(page))).toBe('Saved title');
});

test('a missing CEF leaves saved defaults intact and offers no substitute input', async ({ page }) => {
  const designer = await openDesigner(page);
  const template = await currentTemplate(page);
  (child(template, 'Title')['_valueConstraints'] as Record<string, unknown>)['defaultValue'] = 'Saved title';
  await page.evaluate((template) => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = template;
  }, template);
  await applyPreset(page, 'semantic');
  await openSettings(page.locator('app-field-card').first());
  const control = designer.locator('.field-drop-item').first().locator('app-field-default-value');
  await expect(control.getByRole('status')).toHaveText('Default value editor is unavailable.');
  await expect(control.locator('input')).toHaveCount(0);
  expect(defaultOf(await currentTemplate(page))).toBe('Saved title');
});
