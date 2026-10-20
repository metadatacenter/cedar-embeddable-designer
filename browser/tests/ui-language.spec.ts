import { Page, expect, test } from '@playwright/test';
import { DESIGNER, openDesigner } from './support';

/**
 * The host's choice of language, through the built element.
 *
 * The unit suite sets the component's input directly. This drives what a host page
 * has, which is an attribute and a property on a custom element, and reads what an
 * author sees through the shadow root.
 */
test('switches between English and Hungarian through the attribute and the property', async ({ page }) => {
  const designer = await openDesigner(page);
  const overview = designer.locator('.overview-panel__title');
  await expect(overview).toHaveText('Overview (3)');

  await page.evaluate((tag) => document.querySelector(tag)!.setAttribute('language', 'hu'), DESIGNER);
  await expect(overview).toHaveText('Áttekintés (3)');
  await expect(designer.locator('.field-type-label').first()).toHaveText('Szöveg');
  expect(
    await page.evaluate((tag) => (document.querySelector(tag) as unknown as { language: string }).language, DESIGNER),
  ).toBe('hu');

  await page.evaluate((tag) => {
    (document.querySelector(tag) as unknown as { language: string }).language = 'en';
  }, DESIGNER);
  await expect(overview).toHaveText('Overview (3)');
  await expect(designer.locator('.field-type-label').first()).toHaveText('Text');
});

test('falls back to English for a language it does not have', async ({ page }) => {
  const designer = await openDesigner(page);
  await page.evaluate((tag) => document.querySelector(tag)!.setAttribute('language', 'hu'), DESIGNER);
  await expect(designer.locator('.overview-panel__title')).toHaveText('Áttekintés (3)');
  await page.evaluate((tag) => document.querySelector(tag)!.setAttribute('language', 'fr'), DESIGNER);
  await expect(designer.locator('.overview-panel__title')).toHaveText('Overview (3)');
});

/**
 * The `lang` of the root inside an element's shadow tree and of the host element, and whether
 * the browser takes `selector`'s text inside that tree to be in `language`.
 */
const marked = (page: Page, host: string, selector: string, language: string) =>
  page.evaluate(
    ({ host, selector, language }) => {
      const element = document.querySelector(host)!;
      const root = [...element.shadowRoot!.children].find(
        (child) => !['style', 'link', 'ced-font-registrar'].includes(child.localName),
      )!;
      return {
        root: root.getAttribute('lang'),
        host: element.getAttribute('lang'),
        inherited: element.shadowRoot!.querySelector(selector)!.matches(`:lang(${language})`),
      };
    },
    { host, selector, language },
  );

/**
 * WCAG 3.1.2: the designer's text is marked with the language it is shown in, so that a screen
 * reader reads Hungarian as Hungarian inside an English page. The mark sits inside the shadow
 * tree, and the host element stays the page's. No text box is spellchecked, so the mark switches
 * no dictionary.
 */
test('marks the root of each element with the language its text is shown in', async ({ page }) => {
  const designer = await openDesigner(page);
  const title = '.overview-panel__title';
  expect(await marked(page, DESIGNER, title, 'en')).toEqual({ root: 'en', host: null, inherited: true });
  await page.evaluate((tag) => document.querySelector(tag)!.setAttribute('language', 'hu'), DESIGNER);
  await expect(designer.locator(title)).toHaveText('Áttekintés (3)');
  expect(await marked(page, DESIGNER, title, 'hu')).toEqual({ root: 'hu', host: null, inherited: true });
  for (const box of await designer.locator('input, textarea').all())
    await expect(box).toHaveJSProperty('spellcheck', false);
  await page.evaluate((tag) => {
    (document.querySelector(tag) as unknown as { language: string }).language = 'en';
  }, DESIGNER);
  await expect(designer.locator(title)).toHaveText('Overview (3)');
  expect(await marked(page, DESIGNER, title, 'en')).toEqual({ root: 'en', host: null, inherited: true });

  // The field designer's type chooser is a modal dialog in the top layer, and still inherits the mark.
  await page.goto('/field-host.html');
  const chooser = page.locator('#field').getByRole('dialog');
  await expect(chooser).toBeVisible();
  expect(await marked(page, '#field', 'dialog', 'en')).toEqual({ root: 'en', host: null, inherited: true });
  await page.evaluate(() => {
    (document.getElementById('field') as unknown as { language: string }).language = 'hu';
  });
  await expect.poll(() => marked(page, '#field', 'dialog', 'hu')).toEqual({ root: 'hu', host: null, inherited: true });
  await page.evaluate(() => document.getElementById('field')!.setAttribute('language', 'en'));
  await expect.poll(() => marked(page, '#field', 'dialog', 'en')).toEqual({ root: 'en', host: null, inherited: true });
});
