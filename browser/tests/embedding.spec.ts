import { expect, test } from '@playwright/test';
import { DESIGNER, currentTemplate, openDesigner, openPreview, publishedTemplates } from './support';

/**
 * Being embeddable, which is a claim about a host page rather than about the
 * designer's own screens.
 *
 * Each of these is a defect that shipped. The element was registered from the
 * `.then` of `bootstrapApplication`, so a page without `<app-root>` failed the
 * bootstrap and the element was never defined at all — the demo page could not
 * have worked. Styles were global, so the designer's Tailwind reached the host
 * and the host's reached back. The header requested `cedar-logo.png` from the
 * embedder's server, which the package does not carry.
 */

test('registers itself on a page that bootstraps nothing', async ({ page }) => {
  await openDesigner(page);

  // Asked of the document rather than through a locator: Playwright pierces open
  // shadow roots, and the editor's own `app-root` is inside this element's.
  expect(await page.evaluate(() => document.querySelectorAll('app-root').length)).toBe(0);
  expect(await page.evaluate((tag) => customElements.get(tag) !== undefined, DESIGNER)).toBe(true);
});

test('renders in a shadow root', async ({ page }) => {
  await openDesigner(page);

  expect(await page.evaluate((tag) => document.querySelector(tag)!.shadowRoot !== null, DESIGNER)).toBe(true);
});

test('asks the host server for nothing but its own script', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(new URL(request.url()).pathname));

  await openDesigner(page);

  // `cedar-logo.png` was one of these until the mark was inlined: the package
  // ships one script and no asset directory, so a relative image is a 404 and a
  // broken header on every host page.
  expect(requested.filter((path) => !path.endsWith('.html') && !path.includes('cedar-embeddable-designer.js'))).toEqual(
    [],
  );
});

test.describe('style encapsulation', () => {
  test('the host page cannot reach in', async ({ page }) => {
    const designer = await openDesigner(page);

    const button = designer.locator('button').first();
    // The host sets 29px pink buttons on everything. Inside the shadow root the
    // designer's own styles apply and the host's do not.
    await expect(button).not.toHaveCSS('font-size', '29px');
    await expect(button).not.toHaveCSS('background-color', 'rgb(219, 39, 119)');
  });

  test('the designer cannot reach out', async ({ page }) => {
    await openDesigner(page);

    const leaked = await page.evaluate(() =>
      [...document.head.querySelectorAll('style')].some(
        (style) => style.textContent!.includes('.flex{') || style.textContent!.includes('-webkit-text-size-adjust'),
      ),
    );
    // Tailwind's utilities and its preflight reset stay inside the shadow root.
    // Global styles would restyle the host page's own elements.
    expect(leaked).toBe(false);
  });

  test('the host keeps its own appearance', async ({ page }) => {
    await openDesigner(page);

    await expect(page.locator('#host-heading')).toHaveCSS('font-family', /Georgia/);
  });
});

/**
 * The element keeps to the box its host gave it.
 *
 * `host.html` pins it at 92vh. Its shell used to be `min-h-screen` with no
 * maximum, so it grew to whatever it held and the embedding page grew with it —
 * eleven thousand pixels on a forty-field template — and neither column could
 * scroll within it however much their own rules said so.
 */
test('keeps to the height its host gave it', async ({ page }) => {
  await openDesigner(page);
  await openPreview(page);

  const box = await page.evaluate((tag) => {
    const element = document.querySelector(tag) as HTMLElement;
    const shell = element.shadowRoot?.querySelector('.app-shell') as HTMLElement;
    return {
      element: element.getBoundingClientRect().height,
      shell: shell.getBoundingClientRect().height,
      allowed: window.innerHeight * 0.92,
    };
  }, DESIGNER);

  expect(box.element).toBeLessThanOrEqual(box.allowed + 1);
  // And the shell fills it rather than falling short, which is the other way the
  // chain from `:host` down to the columns can break.
  expect(box.shell).toBeCloseTo(box.element, 0);
});

test.describe('the host contract', () => {
  test('publishes the template as CEDAR JSON-LD', async ({ page }) => {
    await openDesigner(page);

    const [first] = await publishedTemplates(page);
    expect(first['@type']).toBe('https://schema.metadatacenter.org/core/Template');
    expect(first['schema:schemaVersion']).toBe('1.6.0');
    expect(Object.keys(first['@context'] as object)).toContain('pav');
  });

  test('offers the same template as a property', async ({ page }) => {
    await openDesigner(page);

    const [published] = await publishedTemplates(page);
    expect(await currentTemplate(page)).toEqual(published);
  });

  test('accepts a template a host assigns', async ({ page }) => {
    await openDesigner(page);
    const template = await currentTemplate(page);
    template['schema:name'] = 'Assigned by the host';

    await page.evaluate(
      ([tag, value]) => {
        (document.querySelector(tag as string) as unknown as { template: unknown }).template = value;
      },
      [DESIGNER, template] as const,
    );

    await expect(page.locator(DESIGNER).getByPlaceholder('Template name')).toHaveValue('Assigned by the host');
  });

  test('reports a template it cannot read instead of throwing at the host', async ({ page }) => {
    await openDesigner(page);
    const errors: string[] = [];
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

    const threw = await page.evaluate((tag) => {
      try {
        (document.querySelector(tag) as unknown as { template: unknown }).template = 'not a template';
        return false;
      } catch {
        return true;
      }
    }, DESIGNER);

    // Assigning a property is the host's own code; an exception there would read
    // as a fault in the host rather than as something the designer said.
    expect(threw).toBe(false);
    await expect.poll(() => errors.join(' ')).toContain('could not read the template');
  });
});
