/**
 * The embedded CEE control, inside the designer and outside it.
 *
 * "Looks like CEE" is the vaguest thing anyone asks of the designer, and for most of
 * the interface it has to stay vague: CED's own chrome has no CEE counterpart to be
 * compared with. For one part of it the question is exact. Every default-capable
 * field authors its default through `<cedar-embeddable-field>`, CEE's own element,
 * registered by CEE's own script — so the control in the card is not a copy of CEE's,
 * it is CEE's. What can go wrong is not a visual drift but a leak: CED restyling the
 * component it embeds.
 *
 * That leak is easy to cause and hard to see. Shadow DOM stops CED's rules from
 * reaching into CEF, but it stops nothing that inherits. `font-size`, `font-weight`,
 * `line-height`, `letter-spacing`, `color` and `text-align` all cross a shadow
 * boundary, so a card that sets any of them on a container silently resizes the
 * control inside it. CED's own inputs sit at 12px and weight 600 while CEF's sit at
 * 14px and weight 400, which is exactly the gap an inherited rule would close.
 *
 * So the reference is the same element, given the same configuration, mounted in the
 * bare page beside the designer. Nothing is hardcoded: no expected font, no expected
 * size. Whatever CEF does on its own is the standard, and the claim is that being
 * inside a field card does not change it. When CEE restyles its control the test
 * follows along, which is the point — the assertion is about CED, not about CEE.
 *
 * Width is the one measurement excluded, and deliberately: the card is narrower than
 * the page and constraining a control's width is what a layout is for.
 *
 * CI builds the pinned sibling and supplies `CEF_BUNDLE`. Local runs can opt in
 * with the same variable; `playwright.config.ts` skips this file without it.
 */
import { expect, test, type Page } from '@playwright/test';
import { buildTemplate, fieldToJson, templateToJson } from '../../src/app/core/model/cedar-template';
import { defaultToCef } from '../../src/app/core/model/field-default';
import { Field } from '../../src/app/core/models/types';
import { openSettings, applyPreset, openDesigner } from './support';

/**
 * Properties that cross a shadow boundary by inheritance, plus the box metrics a
 * leaked rule would move. These are the ones a card can change without meaning to.
 */
const INHERITED = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'color',
  'textAlign',
  'textTransform',
] as const;

const BOX = ['height', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'borderRadius'] as const;

/** Default-capable types whose CEF control is a text-like input, so there is something to measure. */
const TYPES = ['email', 'phone', 'link'] as const;

function fieldOf(type: string): Field {
  return {
    id: 1,
    type,
    name: 'Value',
    status: 'optional',
    allowMultiple: false,
    options: [],
    defaultValue: { kind: 'none' },
  } as Field;
}

/** The designer showing one field's Default Value control, with CEE's script on the page. */
async function designerWithCef(page: Page, type: string): Promise<void> {
  await openDesigner(page);
  await page.addScriptTag({ path: process.env.CEF_BUNDLE! });
  await page.waitForFunction(() => !!customElements.get('cedar-embeddable-field'));

  const template = templateToJson(
    buildTemplate({
      name: 'Parity',
      description: '',
      identifier: 'urn:template:parity',
      version: '0.0.1',
      fields: [fieldOf(type)],
    }),
  );
  await page.evaluate((value) => {
    (document.querySelector('cedar-embeddable-designer') as unknown as { template: unknown }).template = value;
  }, template);
  // Semantic is the preset that shows Default Value, which is what mounts CEF.
  await applyPreset(page, 'semantic');
  await openSettings(page.locator('app-field-card').first());
  await page.locator('app-field-default-value').first().waitFor({ state: 'visible' });
}

/**
 * Both controls' computed style, the card's and the bare reference's.
 *
 * The reference is configured the way the card configures its own — the same
 * `fieldObject` from `fieldToJson`, the same value from `defaultToCef` — so a
 * difference in the measurements cannot be a difference in what the two were asked
 * to render.
 */
async function bothControls(page: Page, type: string) {
  const artifact = fieldToJson({ ...fieldOf(type), defaultValue: { kind: 'none' }, importedChoiceDefault: undefined });
  const value = defaultToCef(fieldOf(type));

  return page.evaluate(
    async ({ artifact, value, inherited, box }) => {
      const root = document.querySelector('cedar-embeddable-designer')!.shadowRoot!;
      const inCard = root.querySelector('cedar-embeddable-field') as HTMLElement | null;
      if (!inCard) return { error: 'the card mounted no cedar-embeddable-field' };

      const reference = document.createElement('cedar-embeddable-field') as HTMLElement & {
        fieldObject: unknown;
        config: unknown;
        value: unknown;
      };
      // Off to one side and out of the flow, so it cannot disturb what is being measured.
      reference.style.cssText = 'position:absolute;left:0;top:2000px;width:530px';
      document.body.appendChild(reference);
      reference.setAttribute('density', 'compact');
      reference.config = { readOnlyMode: false };
      reference.fieldObject = artifact;
      reference.value = value;

      const settle = async () => {
        for (let attempt = 0; attempt < 40; attempt++) {
          if (reference.shadowRoot?.querySelector('input, textarea')) return;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      };
      await settle();

      const describe = (host: HTMLElement) => {
        const element = host.shadowRoot?.querySelector('input, textarea') ?? host.querySelector('input, textarea');
        if (!element) return null;
        const computed = getComputedStyle(element) as unknown as Record<string, string>;
        const style: Record<string, string> = {};
        for (const property of [...inherited, ...box]) style[property] = computed[property];
        return { tag: element.tagName.toLowerCase(), style };
      };

      return { card: describe(inCard), reference: describe(reference) };
    },
    { artifact: artifact as unknown, value: value as unknown, inherited: INHERITED, box: BOX },
  );
}

test.describe('a default control inside a field card', () => {
  for (const type of TYPES) {
    test(`renders a ${type} field exactly as CEF does on its own`, async ({ page }) => {
      await designerWithCef(page, type);
      const measured = await bothControls(page, type);

      expect(measured.error, 'the designer did not mount CEE’s field element').toBeUndefined();
      expect(measured.card, 'no control found inside the card').not.toBeNull();
      expect(measured.reference, 'the bare reference rendered no control').not.toBeNull();
      // The same kind of control, before comparing how it is painted.
      expect(measured.card!.tag).toBe(measured.reference!.tag);
      expect(measured.card!.style).toEqual(measured.reference!.style);
    });
  }
});
