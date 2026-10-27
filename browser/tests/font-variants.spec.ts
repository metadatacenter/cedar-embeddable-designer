import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openDesigner } from './support';

/**
 * The two bundles differ only by who registers CEDAR Roboto.
 *
 * The standalone bundle registers its embedded faces. The host-fonts bundle registers none, for a
 * page that registers them once for every component it loads. Each case counts the faces the
 * document ends up with: seven per weight, never two copies, and none when nobody registers them.
 */
const hostedBundle = readFileSync(
  new URL('../../dist-bundle/cedar-embeddable-designer.host-fonts.js', import.meta.url),
);
const hostFaces = [400, 500]
  .map((weight) =>
    readFileSync(
      new URL(
        `../../node_modules/@org.metadatacenter/cedar-design-tokens/scss/fonts/_roboto-${weight}.scss`,
        import.meta.url,
      ),
      'utf8',
    ),
  )
  .join('\n');

async function useHostedBundle(page: Page, withHostFaces: boolean) {
  await page.route('**/cedar-embeddable-designer.js', (route) =>
    route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: hostedBundle }),
  );
  if (withHostFaces) {
    await page.route('**/host.html*', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()).replace('</head>', `<style>${hostFaces}</style></head>`),
      });
    });
  }
}

async function robotoFaces(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return page.evaluate(() =>
    [...document.fonts]
      .filter((font) => font.family.replace(/['"]/g, '') === 'CEDAR Roboto')
      .map((font) => font.weight),
  );
}

for (const [variant, hosted, withHostFaces, perWeight] of [
  ['the standalone bundle registers its own faces', false, false, 7],
  ['the host-fonts bundle uses the faces the host registers, without a second copy', true, true, 7],
  ['the host-fonts bundle registers no faces of its own', true, false, 0],
] as const) {
  test(variant, async ({ page }) => {
    if (hosted) await useHostedBundle(page, withHostFaces);
    const designer = await openDesigner(page);
    const faces = await robotoFaces(page);
    expect(faces.filter((weight) => weight === '400')).toHaveLength(perWeight);
    expect(faces.filter((weight) => weight === '500')).toHaveLength(perWeight);
    expect(faces).toHaveLength(2 * perWeight);
    await expect(designer.locator('[id^=field-card-]').first()).toBeVisible();
  });
}
