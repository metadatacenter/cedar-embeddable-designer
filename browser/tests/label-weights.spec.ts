import { test, expect, type Locator } from '@playwright/test';
import { FIELD_TYPES } from '../../src/app/core/models/types';
import type { CedarEmbeddableFieldDesignerElement } from '../../src/app/ced-public-api';
import { openDesigner } from './support';

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
  for (const [selector, weight] of [
    ['label:visible, legend:visible, .default-label:visible, th:visible, dt:visible', '500'],
    ['input:not([type=checkbox]):not([type=radio]):visible, textarea:visible, select:visible', '400'],
  ]) {
    await expect
      .poll(() =>
        scope
          .locator(selector)
          .evaluateAll(
            (nodes, weight) =>
              nodes
                .filter((node) => getComputedStyle(node).fontWeight !== weight)
                .map((node) => node.textContent?.trim() || node.getAttribute('aria-label')),
            weight,
          ),
      )
      .toEqual([]);
  }
}
for (const type of Object.keys(FIELD_TYPES)) {
  test(`${type} settings use medium labels and regular values in every tab`, async ({ page }) => {
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
    for (const tab of await settings.getByRole('tab').all()) {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await checkLabels(settings);
    }
  });
}
for (const kind of ['template', 'element']) {
  test(`${kind} settings use medium labels in every tab`, async ({ page }) => {
    const designer = await openDesigner(page);
    await page.evaluate((kind) => (document.querySelector('cedar-embeddable-designer') as any).newArtifact(kind), kind);
    const settings = designer.locator('app-container-settings').first();
    await settings.getByRole('button', { name: /Expand .* settings/i }).click();
    for (const tab of await settings.getByRole('tab').all()) {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await checkLabels(settings);
    }
  });
}
