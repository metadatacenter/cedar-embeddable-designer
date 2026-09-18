import { expect, test } from '@playwright/test';
import { openDesigner } from './support';

test('two designer elements own independent documents', async ({ page }) => {
  await openDesigner(page);
  const names = await page.evaluate(async () => {
    const first = document.querySelector('cedar-embeddable-designer')! as HTMLElement & {
      currentTemplate: Record<string, unknown>;
      template: object;
    };
    const second = document.createElement('cedar-embeddable-designer') as typeof first;
    document.body.append(second);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const source = structuredClone(first.currentTemplate);
    first.template = { ...source, 'schema:name': 'First document' };
    second.template = { ...source, 'schema:name': 'Second document' };
    await new Promise((resolve) => setTimeout(resolve, 100));
    return [first.currentTemplate['schema:name'], second.currentTemplate['schema:name']];
  });
  expect(names).toEqual(['First document', 'Second document']);
});
