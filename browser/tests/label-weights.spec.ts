import { test, expect, type Locator } from '@playwright/test';
import { FIELD_TYPES } from '../../src/app/core/models/types';
import type { CedarEmbeddableFieldDesignerElement } from '../../src/app/ced-public-api';
import { openDesigner, openSettings } from './support';

/** Labels are muted and medium; the values beside them, and a checkbox's option, are primary and regular. */
async function checkLabels(scope: Locator) {
  await expect
    .poll(() =>
      scope
        .locator('dt:visible')
        .evaluateAll((nodes) =>
          nodes.filter((node) => getComputedStyle(node).fontStyle !== 'normal').map((node) => node.textContent),
        ),
    )
    .toEqual([]);
  for (const [selector, weight, colour] of [
    [
      'label:not(.check):visible, legend:visible, caption:visible, .default-label:visible, th:visible, dt:visible',
      '500',
      '--cedar-text-muted',
    ],
    // A tab keeps a label's emphasis whether or not it is selected.
    ['[role=tab]:visible', '500', null],
    // A checkbox's label names an option, so it reads as a value does.
    ['label.check:visible', '400', '--cedar-text-primary'],
    [
      'input:not([type=checkbox]):not([type=radio]):visible, textarea:visible, select:visible',
      '400',
      '--cedar-text-primary',
    ],
  ] as const) {
    await expect
      .poll(() =>
        scope.locator(selector).evaluateAll(
          (nodes, { weight, colour }) => {
            // The token's value where the node sits, so a host override is honoured.
            const expected = (node: Element) => {
              const probe = document.createElement('span');
              probe.style.color = `var(${colour})`;
              node.parentElement!.append(probe);
              const value = getComputedStyle(probe).color;
              probe.remove();
              return value;
            };
            return nodes
              .filter(
                (node) =>
                  getComputedStyle(node).fontWeight !== weight ||
                  (colour !== null && getComputedStyle(node).color !== expected(node)),
              )
              .map((node) => node.textContent?.trim() || node.getAttribute('aria-label'));
          },
          { weight, colour },
        ),
      )
      .toEqual([]);
  }
}
for (const type of Object.keys(FIELD_TYPES)) {
  test(`${type} settings use muted medium labels and regular values in every tab`, async ({ page }) => {
    await page.goto('/field-host.html');
    await page.waitForFunction(
      () =>
        typeof (document.getElementById('field') as CedarEmbeddableFieldDesignerElement)?.newArtifact === 'function',
    );
    await page.evaluate(
      (type) => (document.getElementById('field') as CedarEmbeddableFieldDesignerElement).newArtifact(type as never),
      type,
    );
    const settings = page.locator('app-field-settings');
    await expect(settings.getByRole('tab').first()).toBeVisible();
    for (const tab of await settings.getByRole('tab').all()) {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await checkLabels(settings);
    }
  });
}
test('field card settings, with their display checkboxes, use muted medium labels in every tab', async ({ page }) => {
  const designer = await openDesigner(page);
  const card = designer.locator('app-field-card').first();
  await openSettings(card, 'Display');
  const settings = card.locator('app-field-settings');
  for (const tab of await settings.getByRole('tab').all()) {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await checkLabels(settings);
  }
  await expect(settings.locator('label.check')).not.toHaveCount(0);
});
for (const kind of ['template', 'element']) {
  test(`${kind} settings use muted medium labels in every tab`, async ({ page }) => {
    const designer = await openDesigner(page);
    await page.evaluate((kind) => (document.querySelector('cedar-embeddable-designer') as any).newArtifact(kind), kind);
    const settings = designer.locator('app-container-settings').first();
    await settings.getByRole('button', { name: /Expand .* settings/i }).click();
    // The tabs render after the panel opens; listing them sooner finds none and checks nothing.
    await expect(settings.getByRole('tab').first()).toBeVisible();
    for (const tab of await settings.getByRole('tab').all()) {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await checkLabels(settings);
    }
  });
}
