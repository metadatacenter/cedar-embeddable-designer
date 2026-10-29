import { Page, expect, test } from '@playwright/test';
import type { CedarEmbeddableDesignerElement } from '../../src/app/ced-public-api';
import {
  DESIGNER,
  addElementFixture,
  applyPreset,
  clickCentred,
  nestFixtureFields,
  openDesigner,
  openSettings,
} from './support';

/**
 * Whether the designer's content survives a narrow host, zoom, an author's own text spacing, a
 * faint placeholder and a faint field boundary: WCAG 1.4.10 Reflow, 1.4.4 Resize Text, 1.4.12 Text
 * Spacing, 1.4.3 Contrast (Minimum) for placeholders and 1.4.11 Non-text Contrast for boundaries.
 *
 * The same five checks run over Workspace, the term picker, CEE and this designer, by one method:
 *
 * - Reflow. At 320 CSS px wide, neither the page nor any scroll container inside the designer
 *   scrolls sideways, no text overlaps other text, and every control can be scrolled to and hit. A
 *   data table that needs both directions may scroll inside its own container, and each such
 *   container is named in `TABLE_SCROLLERS`.
 * - Resize. A 640 by 400 viewport is a 1280 by 800 window at 200% zoom. No text is clipped, no
 *   text overlaps other text, and every control can be scrolled to and hit.
 * - Text spacing. At 1280 px wide, with criterion 1.4.12's line, letter, word and paragraph
 *   spacing forced on the document and every shadow root, no text is clipped and none overlaps.
 * - Placeholders. Every placeholder's colour measures at least 4.5:1 against what it sits on.
 * - Boundaries. Every text-entry or selection control that draws a boundary draws it at least 3:1
 *   against what lies outside it. The token test measures the token's value; this measures what
 *   the browser draws, so a framework default or a local override that replaces the token fails.
 *
 * A finding the designer cannot fix without a visible change is recorded in `EXCEPTIONS`, with
 * the change it needs, so that the check passes and the finding stays in view. An exception
 * that no longer finds its finding fails, so the list cannot outlive the defect.
 */

type Condition = 'reflow' | 'resize' | 'spacing' | 'placeholder' | 'boundary';

/** One kind of failure, as the audit names it. */
type Kind = 'page-scroll' | 'scroll' | 'unreachable' | 'clipped' | 'overlap' | 'placeholder' | 'boundary';

const CONDITIONS: Record<Condition, { width: number; height: number; kinds: Kind[] }> = {
  reflow: { width: 320, height: 640, kinds: ['page-scroll', 'scroll', 'unreachable', 'overlap'] },
  resize: { width: 640, height: 400, kinds: ['clipped', 'overlap', 'unreachable'] },
  spacing: { width: 1280, height: 900, kinds: ['clipped', 'overlap'] },
  placeholder: { width: 1280, height: 900, kinds: ['placeholder'] },
  boundary: { width: 1280, height: 900, kinds: ['boundary'] },
};

/** Criterion 1.4.12's spacing, applied as an author's stylesheet would apply it. */
const TEXT_SPACING =
  '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } ' +
  'p { margin-bottom: 2em !important; }';

/** Containers that hold a data table and may scroll it both ways, which criterion 1.4.10 allows. */
const TABLE_SCROLLERS: { target: string; holds: string }[] = [
  {
    target: 'app-child-picker .table-scroll',
    holds: "The child picker's Selected items and Search results: each row's type, name, date, version and actions.",
  },
  {
    target: 'app-annotations-editor .table-scroll',
    holds: "A field's annotations: each row's name, value type, value and Remove button.",
  },
];

/** A finding that waits on a visible change. */
interface Exception {
  kind: Kind;
  /** The conditions and states it is found in. */
  conditions: Condition[];
  states: string[];
  /** A selector the element it names matches. */
  target: string;
  measured: string;
  /** The visible change that would fix it. */
  needs: string;
}

const EXCEPTIONS: Exception[] = [
  {
    kind: 'scroll',
    conditions: ['reflow'],
    states: ['Preferences'],
    target: 'app-preferences-modal .preferences-field-grid',
    measured:
      'The field type list sets two 109px columns at 320px. Checkboxes, Paragraph and Controlled Terms each ' +
      'need 114 to 125px for the checkbox, icon and longest word, so the list scrolls sideways by 8px.',
    needs: 'One column of field types on a narrow host, or field type names that may break within a word.',
  },
  {
    kind: 'scroll',
    conditions: ['reflow'],
    states: ['Define Presets'],
    target: 'app-preset-definitions-modal .overflow-y-auto',
    measured:
      'The Available field types table is 337px wide in the 318px dialog body at 320px, so the whole body ' +
      'scrolls sideways, its introduction and group titles with it, rather than the table alone.',
    needs: 'Each preset table in a container of its own that scrolls sideways, or tables narrow enough for 320px.',
  },
  {
    kind: 'unreachable',
    conditions: ['reflow'],
    states: ['template settings, Metadata tab'],
    target: 'app-types-picker .property > button',
    measured:
      'The Types row needs 198px in 129px at 320px. Its two buttons keep their full width, so Enter IRI ' +
      'manually ends at 356px, past the edge of the card, which hides it. The list beside them shrinks ' +
      'to nothing, and No types selected. stands one letter to a line, as it already does at 375px.',
    needs: 'The Types row puts its buttons beneath the list when they do not fit beside it.',
  },
];

/**
 * How to reach each state the checks run in, from a host already sized for the condition, and the
 * surface whose controls must be reachable there. An open dialog makes the page behind it inert,
 * and an open menu covers what it is drawn over until it closes, so only their own controls count.
 */
const STATES: Record<string, { surface?: string; reach: (page: Page) => Promise<void> }> = {
  'fresh template': {
    reach: async (page) => {
      await openDesigner(page);
    },
  },
  // A selected field, its settings open on each tab in turn.
  ...Object.fromEntries(
    ['Configuration', 'Presentation', 'Constraints', 'Annotations', 'Metadata'].map((tab) => [
      `field selected, ${tab} tab`,
      {
        reach: async (page: Page) => {
          const designer = await openDesigner(page);
          const card = designer.locator('[id^=field-card-]').first();
          await card.getByRole('textbox', { name: 'Enter field name' }).focus();
          await openSettings(card, tab);
        },
      },
    ]),
  ),
  'template settings, Metadata tab': {
    reach: async (page) => {
      const designer = await openDesigner(page, '?picker=stub');
      await designer.getByRole('button', { name: 'Expand template settings', exact: true }).click();
      const settings = designer.locator('app-container-settings').first();
      await clickCentred(settings.getByRole('tab', { name: 'Metadata', exact: true }));
      await expect(settings.getByRole('button', { name: 'Add types', exact: true })).toBeVisible();
    },
  },
  'nested element': {
    reach: async (page) => {
      const designer = await openDesigner(page);
      await applyPreset(page, 'modular');
      await addElementFixture(page);
      await nestFixtureFields(page, ['Element']);
      await expect(
        designer.locator('app-container-editor app-container-editor [id^=field-card-]').first(),
      ).toBeVisible();
    },
  },
  'user menu': {
    surface: '.user-menu-container',
    reach: async (page) => {
      const designer = await openDesigner(page);
      await designer.getByRole('button', { name: 'User Menu' }).click();
      await expect(designer.getByRole('button', { name: 'Preferences', exact: true })).toBeVisible();
    },
  },
  Preferences: {
    surface: '[role="dialog"]',
    reach: async (page) => {
      const designer = await openDesigner(page);
      await designer.getByRole('button', { name: 'User Menu' }).click();
      await designer.getByRole('button', { name: 'Preferences', exact: true }).click();
      await expect(designer.getByRole('dialog', { name: 'Preferences' })).toBeVisible();
    },
  },
  'Define Presets': {
    surface: '[role="dialog"]',
    reach: async (page) => {
      const designer = await openDesigner(page);
      await designer.getByRole('button', { name: 'User Menu' }).click();
      await designer.getByRole('button', { name: 'Define Presets', exact: true }).click();
      await expect(designer.getByRole('dialog', { name: 'Define Presets' })).toBeVisible();
    },
  },
  'child picker': {
    surface: 'dialog',
    reach: async (page) => {
      const designer = await openDesigner(page);
      await applyPreset(page, 'modular');
      await page.evaluate(() => {
        const element = document.querySelector('cedar-embeddable-designer') as CedarEmbeddableDesignerElement;
        const names = ['Title', 'Principal Investigator Contact Information and Institutional Affiliation', 'Section'];
        element.childSource = {
          async search() {
            return {
              results: names.map((name, index) => ({
                id: `https://repo.metadatacenter.org/template-fields/${index}`,
                name,
                type: index === 2 ? ('element' as const) : ('field' as const),
                version: '0.0.1',
                status: 'bibo:draft',
                modifiedOn: '2026-09-29T12:00:00Z',
              })),
            };
          },
          async load() {
            return {};
          },
        };
      });
      await designer.getByRole('button', { name: 'Import fields and elements', exact: true }).first().click();
      const dialog = designer.getByRole('dialog', { name: 'Import Fields and Elements' });
      await dialog.getByRole('button', { name: 'Search', exact: true }).click();
      await dialog.getByRole('row', { name: 'Select Title', exact: true }).click();
      await expect(dialog.getByRole('table', { name: 'Selected items' }).getByRole('row')).toHaveCount(2);
    },
  },
  'property dialog': {
    surface: '[role="dialog"]',
    reach: async (page) => {
      const designer = await openDesigner(page, '?picker=stub');
      const panel = await openSettings(designer.locator('[id^=field-card-]').first(), 'Configuration');
      await panel.getByRole('button', { name: 'Replace property IRI', exact: true }).click();
      await expect(designer.getByRole('dialog', { name: 'Choose property IRI', exact: true })).toBeVisible();
    },
  },
  'types dialog': {
    surface: '[role="dialog"]',
    reach: async (page) => {
      const designer = await openDesigner(page, '?picker=stub');
      await designer.getByRole('button', { name: 'Expand template settings', exact: true }).click();
      const settings = designer.locator('app-container-settings').first();
      await clickCentred(settings.getByRole('tab', { name: 'Metadata', exact: true }));
      await settings.getByRole('button', { name: 'Add types', exact: true }).click();
      await expect(designer.getByRole('dialog', { name: 'Add types', exact: true })).toBeVisible();
    },
  },
};

/** Wait until animations have finished and nothing has scrolled for two frames. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const roots: DocumentOrShadowRoot[] = [document];
    const collect = (root: Document | ShadowRoot) => {
      for (const element of root.querySelectorAll('*'))
        if (element.shadowRoot) {
          roots.push(element.shadowRoot);
          collect(element.shadowRoot);
        }
    };
    collect(document);
    await Promise.all(
      roots
        .flatMap((root) => root.getAnimations())
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
    const scrollers = roots.flatMap((root) => [...(root as ParentNode).querySelectorAll('*')]);
    const positions = () =>
      [window.scrollY, ...scrollers.map((element) => `${element.scrollTop},${element.scrollLeft}`)].join(';');
    for (let last = '', still = 0, frames = 0; still < 2 && frames < 120; frames++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = positions();
      still = now === last ? still + 1 : 0;
      last = now;
    }
  });
}

/** Add criterion 1.4.12's spacing to the document and to every shadow root in it. */
async function forceTextSpacing(page: Page): Promise<void> {
  await page.evaluate((css) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    const visit = (root: Document | ShadowRoot) => {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      for (const element of root.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot);
    };
    visit(document);
  }, TEXT_SPACING);
}

interface Finding {
  kind: Kind;
  message: string;
  /** The indices of the exceptions that cover it. */
  excepted: number[];
}

/**
 * Run the audit for `kinds` over the document and every shadow root, in one pass in the page.
 *
 * Text is a text node with something other than white space in it. An element is visually hidden
 * when it or an ancestor clips it to a box at most a pixel wide or tall, which is how the
 * `sr-only` pattern hides text, and hidden text is shown to nobody, so it is neither clipped nor
 * overlapping. Form controls hold and scroll their own values, so their content is not measured.
 *
 * - Clipped. An element whose overflow is hidden or clipped has content larger than its box, and
 *   part of its own text lies outside that box. An ellipsis passes when a `title` on the element
 *   or a near ancestor holds the full text.
 * - Overlapping. Two text boxes intersect by more than a pixel each way, and the one on top sits
 *   on no opaque surface that covers the other, as a menu or a dialog covers the page.
 * - Unreachable. A control on the state's surface cannot be brought into view without scrolling a
 *   box whose overflow is hidden, or something else is what a pointer hits at every point of it.
 * - Placeholders. A disabled box is exempt, as criterion 1.4.3 exempts inactive components.
 * - Boundaries. A control's boundary is drawn by the border of the control itself, of an ancestor
 *   at most three levels up whose box is at most 48px larger each way, or of an element in an
 *   absolutely positioned layer within such an ancestor, as an outlined field's outline is. The
 *   strongest side of any of them must measure 3:1 against the colour outside the box that holds
 *   it. A control that draws no boundary is not measured, because 1.4.11 asks for contrast in what
 *   identifies a control rather than for a boundary; a disabled control is exempt, as 1.4.11 exempts
 *   inactive components. `measured` counts the controls whose boundary was measured.
 */
async function audit(
  page: Page,
  kinds: Kind[],
  state: string,
  condition: Condition,
  surface: string,
): Promise<{ findings: Finding[]; measured: number }> {
  return page.evaluate(
    ({ kinds, surface, tableScrollers, exceptions }) => {
      const findings: { kind: string; message: string; element: Element }[] = [];
      const roots: (Document | ShadowRoot)[] = [];
      const elements: Element[] = [];
      const collect = (root: Document | ShadowRoot) => {
        roots.push(root);
        for (const element of root.querySelectorAll('*')) {
          elements.push(element);
          if (element.shadowRoot) collect(element.shadowRoot);
        }
      };
      collect(document);

      /** The element's parent in the flat tree, crossing out of a shadow root to its host. */
      const parent = (element: Element): Element | null =>
        element.assignedSlot ?? element.parentElement ?? ((element.getRootNode() as ShadowRoot).host || null);
      const ancestors = function* (element: Element): Generator<Element> {
        for (let node = parent(element); node; node = parent(node)) yield node;
      };
      const contains = (outer: Element, inner: Element) => {
        for (let node: Element | null = inner; node; node = parent(node)) if (node === outer) return true;
        return false;
      };
      const style = (element: Element) => getComputedStyle(element);
      const clips = (axis: string) => /hidden|clip/.test(axis);
      const scrolls = (axis: string) => /auto|scroll/.test(axis);
      const OWN_CONTENT = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'svg', 'STYLE', 'SCRIPT']);
      const shown = (element: Element) =>
        element.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
        element.getClientRects().length > 0;
      const visuallyHidden = (element: Element) =>
        [element, ...ancestors(element)].some((node) => {
          const box = node.getBoundingClientRect();
          return (
            (box.width <= 1 || box.height <= 1) && (clips(style(node).overflowX) || style(node).clipPath !== 'none')
          );
        });
      const describe = (element: Element) => {
        const id = element.id ? `#${element.id}` : '';
        const classes = [...element.classList]
          .filter((name) => !name.startsWith('ng-') && !name.startsWith('cdk-'))
          .slice(0, 2)
          .map((name) => `.${name}`)
          .join('');
        const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
        return `${element.localName}${id}${classes}${text ? ` "${text}"` : ''}`;
      };
      const report = (kind: string, element: Element, message: string) =>
        findings.push({ kind, message: `${kind}: ${describe(element)} ${message}`, element });

      /** The element painted on top at a point, descending into shadow roots. */
      const topAt = (x: number, y: number): Element | null => {
        let top = document.elementFromPoint(x, y);
        while (top?.shadowRoot) {
          const inner = top.shadowRoot.elementFromPoint(x, y);
          if (!inner || inner === top) break;
          top = inner;
        }
        return top;
      };

      /** Every shown text node outside the form controls, with the boxes its text occupies. */
      const texts = () => {
        const found: { node: Text; element: Element; rects: DOMRect[] }[] = [];
        for (const root of roots) {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
            const element = node.parentElement;
            if (!element || !node.data.trim() || OWN_CONTENT.has(element.tagName)) continue;
            if (element.closest('svg, style, script, template')) continue;
            if (!shown(element) || visuallyHidden(element)) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            const rects = [...range.getClientRects()].filter((rect) => rect.width > 1 && rect.height > 1);
            if (rects.length) found.push({ node, element, rects });
          }
        }
        return found;
      };

      if (kinds.includes('page-scroll')) {
        const page = document.documentElement;
        if (page.scrollWidth > page.clientWidth)
          report('page-scroll', page, `is ${page.scrollWidth}px wide in a ${page.clientWidth}px viewport`);
      }

      if (kinds.includes('scroll')) {
        for (const element of elements) {
          if (OWN_CONTENT.has(element.tagName) || !shown(element)) continue;
          if (!scrolls(style(element).overflowX) || element.scrollWidth <= element.clientWidth + 1) continue;
          if (tableScrollers.some((entry) => element.matches(entry.target) && element.querySelector('table'))) continue;
          report('scroll', element, `scrolls sideways: ${element.scrollWidth}px in ${element.clientWidth}px`);
        }
      }

      if (kinds.includes('clipped')) {
        const shownTexts = texts();
        for (const element of elements) {
          if (OWN_CONTENT.has(element.tagName) || !shown(element) || visuallyHidden(element)) continue;
          const own = style(element);
          const x = clips(own.overflowX);
          const y = clips(own.overflowY);
          if (!x && !y) continue;
          const wide = x && element.scrollWidth > element.clientWidth + 1;
          const tall = y && element.scrollHeight > element.clientHeight + 1;
          if (!wide && !tall) continue;
          const box = element.getBoundingClientRect();
          const left = box.left + element.clientLeft;
          const top = box.top + element.clientTop;
          const right = left + element.clientWidth;
          const bottom = top + element.clientHeight;
          // Text this element clips, rather than text a scroller or another clipping box inside it holds.
          const clipped = shownTexts.filter(({ element: holder, rects }) => {
            if (!contains(element, holder)) return false;
            for (const node of [holder, ...ancestors(holder)]) {
              if (node === element) break;
              const inner = style(node);
              if (scrolls(inner.overflowX) || scrolls(inner.overflowY) || inner.position === 'fixed') return false;
              if (clips(inner.overflowX) || clips(inner.overflowY)) return false;
            }
            return rects.some(
              (rect) =>
                (x && (rect.right > right + 1 || rect.left < left - 1)) ||
                (y && (rect.bottom > bottom + 1 || rect.top < top - 1)),
            );
          });
          if (!clipped.length) continue;
          // An ellipsis hides text, which passes only when the full text is available another way.
          const full = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
          const titled = [element, ...ancestors(element)]
            .slice(0, 4)
            .some((node) => (node.getAttribute('title') ?? '').replace(/\s+/g, ' ').trim().includes(full));
          if (own.textOverflow === 'ellipsis' && titled) continue;
          const sample = clipped
            .map(({ node }) => node.data.trim())
            .join(' ')
            .slice(0, 40);
          const sizes = `${element.scrollWidth}x${element.scrollHeight} in ${element.clientWidth}x${element.clientHeight}`;
          report('clipped', element, `clips "${sample}": content ${sizes}`);
        }
      }

      if (kinds.includes('overlap')) {
        const shownTexts = texts();
        const opaque = (node: Element) => {
          const fill = (style(node).backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
          return fill.length >= 3 && (fill[3] ?? 1) > 0.5;
        };
        const reported = new Set<string>();
        for (let i = 0; i < shownTexts.length; i++) {
          for (let j = i + 1; j < shownTexts.length; j++) {
            const a = shownTexts[i];
            const b = shownTexts[j];
            if (a.element === b.element || contains(a.element, b.element) || contains(b.element, a.element)) continue;
            for (const ra of a.rects) {
              for (const rb of b.rects) {
                const width = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
                const height = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
                if (width <= 1 || height <= 1) continue;
                const x = Math.max(ra.left, rb.left) + width / 2;
                const y = Math.max(ra.top, rb.top) + height / 2;
                const top = topAt(x, y);
                if (!top) continue;
                // Text on top of a surface that covers the other text is stacked, not overlapping.
                const upper = contains(a.element, top) || contains(top, a.element) ? a : b;
                const lower = upper === a ? b : a;
                if (!contains(upper.element, top) && !contains(top, upper.element)) continue;
                let covered = false;
                for (const node of [upper.element, ...ancestors(upper.element)]) {
                  if (contains(node, lower.element)) break;
                  if (opaque(node)) covered = true;
                }
                if (covered) continue;
                const key = `${describe(upper.element)}|${describe(lower.element)}`;
                if (reported.has(key)) continue;
                reported.add(key);
                report(
                  'overlap',
                  upper.element,
                  `overlaps ${describe(lower.element)} by ${Math.round(width)}x${Math.round(height)}px`,
                );
              }
            }
          }
        }
      }

      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const parse = (color: string) => (color.match(/[\d.]+/g) ?? []).map(Number);
      const over = ([r, g, b, a = 1]: number[], [br, bg, bb]: number[]) => [
        r * a + br * (1 - a),
        g * a + bg * (1 - a),
        b * a + bb * (1 - a),
      ];
      const luminance = ([r, g, b]: number[]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      const contrast = (a: number[], b: number[]) => {
        const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (high + 0.05) / (low + 0.05);
      };
      const rgb = (colour: number[]) => `rgb(${colour.map(Math.round).join(', ')})`;
      /** The colour behind `element`: its own and its ancestors' fills, laid over white. */
      const behind = (element: Element): number[] => {
        const fills: number[][] = [];
        for (const node of [element, ...ancestors(element)]) {
          const fill = parse(style(node).backgroundColor);
          if ((fill[3] ?? 1) > 0) fills.push(fill);
          if ((fill[3] ?? 1) === 1) break;
        }
        return fills.reduceRight((base, fill) => over(fill, base), [255, 255, 255]);
      };

      if (kinds.includes('placeholder')) {
        for (const element of elements) {
          if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) continue;
          if (!element.placeholder.trim() || element.disabled || !shown(element) || visuallyHidden(element)) continue;
          const placeholder = getComputedStyle(element, '::placeholder');
          const [r, g, b, a = 1] = parse(placeholder.color);
          const fill = behind(element);
          const ratio = contrast(over([r, g, b, a * Number(placeholder.opacity || 1)], fill), fill);
          if (ratio < 4.5)
            report(
              'placeholder',
              element,
              `placeholder "${element.placeholder}" is ${placeholder.color} on ${rgb(fill)}, ${ratio.toFixed(2)}:1`,
            );
        }
      }

      let measured = 0;
      if (kinds.includes('boundary')) {
        const FIELDS =
          'input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], ' +
          '[type="file"], [type="button"], [type="submit"], [type="reset"], [type="image"]), textarea, select, ' +
          '[role="textbox"], [role="combobox"], [role="searchbox"], [role="spinbutton"]';
        const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;
        /** The colours of the sides of `element` that draw a border. */
        const borders = (element: Element) => {
          const own = style(element);
          return SIDES.flatMap((side) => {
            const colour = parse(own[`border${side}Color`]);
            const drawn =
              parseFloat(own[`border${side}Width`]) >= 1 &&
              !['none', 'hidden'].includes(own[`border${side}Style`]) &&
              (colour[3] ?? 1) > 0;
            return drawn ? [colour] : [];
          });
        };
        for (const field of elements) {
          if (!field.matches(FIELDS) || !shown(field) || visuallyHidden(field)) continue;
          if ((field as HTMLInputElement).disabled || field.getAttribute('aria-disabled') === 'true') continue;
          const own = field.getBoundingClientRect();
          // Each element that may draw the boundary, with the box whose outside it is measured against.
          const drawers: { element: Element; holder: Element }[] = [];
          let box: Element | null = field;
          for (let level = 0; box && level <= 3; level++, box = parent(box)) {
            const rect = box.getBoundingClientRect();
            if (rect.width > own.width + 48 || rect.height > own.height + 48) break;
            drawers.push({ element: box, holder: box });
            if (box === field) continue;
            for (const layer of box.querySelectorAll('*')) {
              if (contains(field, layer) || contains(layer, field) || style(layer).position !== 'absolute') continue;
              for (const element of [layer, ...layer.querySelectorAll('*')])
                if (shown(element)) drawers.push({ element, holder: box });
            }
          }
          let strongest: { ratio: number; colour: number[]; outside: number[] } | undefined;
          for (const { element, holder } of drawers) {
            const container = parent(holder);
            const outside = container ? behind(container) : [255, 255, 255];
            for (const colour of borders(element)) {
              const drawn = over(colour, behind(element));
              const ratio = contrast(drawn, outside);
              if (!strongest || ratio > strongest.ratio) strongest = { ratio, colour: drawn, outside };
            }
          }
          if (!strongest) continue;
          measured++;
          if (strongest.ratio < 3)
            report(
              'boundary',
              field,
              `boundary is ${rgb(strongest.colour)} on ${rgb(strongest.outside)}, ${strongest.ratio.toFixed(2)}:1`,
            );
        }
      }

      // Last, because it scrolls. A script can scroll a box whose overflow is hidden and a pointer cannot,
      // so a control that only comes into view that way is out of reach.
      if (kinds.includes('unreachable')) {
        const CONTROLS =
          'a[href], button, input:not([type="hidden"]), select, textarea, summary, ' +
          '[tabindex]:not([tabindex="-1"]), [role="button"], [role="tab"], [role="checkbox"], [role="radio"]';
        const surfaces = elements.filter((element) => element.matches(surface));
        for (const element of elements) {
          if (!element.matches(CONTROLS) || !shown(element) || visuallyHidden(element)) continue;
          if (!surfaces.some((outer) => contains(outer, element))) continue;
          if (style(element).pointerEvents === 'none') continue;
          const hiding = [...ancestors(element)].filter(
            (node) => clips(style(node).overflowX) || clips(style(node).overflowY),
          );
          const offsets = hiding.map((node) => [node.scrollLeft, node.scrollTop]);
          const restore = () => hiding.forEach((node, index) => node.scrollTo(offsets[index][0], offsets[index][1]));
          element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
          const moved = hiding.find(
            (node, index) => node.scrollLeft !== offsets[index][0] || node.scrollTop !== offsets[index][1],
          );
          if (moved) {
            report('unreachable', element, `lies outside ${describe(moved)}, which hides its overflow`);
            restore();
            continue;
          }
          // Centred, as a person scrolls a control clear of a sticky header or footer before using it.
          element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
          restore();
          const box = element.getBoundingClientRect();
          const left = Math.max(box.left, 0);
          const right = Math.min(box.right, document.documentElement.clientWidth);
          const top = Math.max(box.top, 0);
          const bottom = Math.min(box.bottom, document.documentElement.clientHeight);
          const labels = (element as HTMLInputElement).labels ? [...(element as HTMLInputElement).labels!] : [];
          const hits = (hit: Element | null) =>
            !!hit && (contains(element, hit) || labels.some((label) => contains(label, hit)));
          const points =
            right - left < 1 || bottom - top < 1
              ? []
              : [0.5, 0.25, 0.75].flatMap((fx) =>
                  [0.5, 0.25, 0.75].map((fy) => [left + (right - left) * fx, top + (bottom - top) * fy]),
                );
          if (points.some(([x, y]) => hits(topAt(x, y)))) continue;
          const centre = points.length ? topAt(points[0][0], points[0][1]) : null;
          report(
            'unreachable',
            element,
            points.length
              ? `cannot be hit: ${centre ? describe(centre) : 'nothing'} lies over it`
              : `cannot be scrolled into view: ${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}x${Math.round(box.height)}`,
          );
        }
      }

      return {
        measured,
        findings: findings.map(({ kind, message, element }) => ({
          kind: kind as never,
          message,
          excepted: exceptions.flatMap((exception, index) =>
            exception.applies && exception.kind === kind && element.matches(exception.target) ? [index] : [],
          ),
        })),
      };
    },
    {
      kinds,
      surface,
      tableScrollers: TABLE_SCROLLERS,
      exceptions: EXCEPTIONS.map((exception) => ({
        ...exception,
        applies: exception.states.includes(state) && exception.conditions.includes(condition),
      })),
    },
  );
}

/**
 * Icons, focus indicators and selection marks below 3:1 against what they are drawn on, and how many
 * of each were measured. Runs in the page.
 *
 * - Icons. An SVG icon is measured when it is all that identifies the control holding it, because
 *   the control shows no text, or when it carries a name of its own. Its stroke, or its fill where
 *   it has no stroke, is laid over what lies behind it, with the opacity of every ancestor.
 * - Focus. Each enabled control in scope is focused as a keyboard would focus it, and read two
 *   frames later, once a framework has marked it focused. Whatever its focus changes in the
 *   outlines, borders and shadows of the control, of the six boxes around it and of their indicator
 *   layers is the indicator, since only the focus can have changed them. A small input inside a
 *   wider field, such as a time's hour, shows its focus on the field. An outline drawn outside a box
 *   is measured against what lies outside the box, and one drawn inside it, like an inset shadow,
 *   against the box's own fill. A control whose focus changes none of these fails, because a change
 *   of fill alone measures about 1.2:1.
 * - Selection. A selected, pressed or current item is compared with an unselected item of the same
 *   kind in the same group, such as another chip in its chip set. Whatever it draws that the other
 *   does not is its mark, measured the same way: a line, a changed fill against what surrounds the
 *   item, or an icon the other lacks, on the item or on the element around it that draws its state.
 *   A heavier or underlined text counts as a mark of text, which 1.4.3 already measures. An item
 *   whose only difference is a tint fails, because a tint measures about 1.2:1. The current item at
 *   the end of a trail, such as a breadcrumb's last folder, is identified by its position and is not
 *   measured.
 *
 * A disabled control is exempt, as 1.4.11 exempts inactive components.
 */
type Indicator = 'icon' | 'focus' | 'selection';
interface IndicatorFinding {
  kind: Indicator;
  message: string;
  /** The indices of the exceptions whose kind it has and whose selector its element matches. */
  excepted: number[];
}

async function findFaintIndicators({
  scope,
  exclude,
  selected,
  exceptions,
}: {
  /** A selector for the surface to measure within, or null for the whole page. */
  scope: string | null;
  /** Selectors for hosts whose content another suite measures, such as an embedded component. */
  exclude: string[];
  /** Selectors for selected items beyond the ARIA states, such as a component's own class. */
  selected: string[];
  exceptions: { kind: Indicator; target: string }[];
}): Promise<{ measured: Record<Indicator, number>; findings: IndicatorFinding[] }> {
  const elements: Element[] = [];
  const roots: (Document | ShadowRoot)[] = [];
  const collect = (root: Document | ShadowRoot): void => {
    roots.push(root);
    for (const element of root.querySelectorAll('*')) {
      elements.push(element);
      if (element.shadowRoot) collect(element.shadowRoot);
    }
  };
  collect(document);
  // A transition would leave a focused control's computed style at its resting value when it is read.
  const still = new CSSStyleSheet();
  still.replaceSync('*, *::before, *::after { transition: none !important; animation: none !important; }');
  for (const root of roots) root.adoptedStyleSheets = [...root.adoptedStyleSheets, still];
  const parent = (element: Element): Element | null =>
    element.assignedSlot ?? element.parentElement ?? ((element.getRootNode() as ShadowRoot).host || null);
  const contains = (outer: Element, inner: Element): boolean => {
    for (let node: Element | null = inner; node; node = parent(node)) if (node === outer) return true;
    return false;
  };
  const surfaces = scope ? elements.filter((element) => element.matches(scope)) : [];
  const excluded = elements.filter((element) => exclude.some((selector) => element.matches(selector)));
  const within = (element: Element): boolean =>
    (!scope || surfaces.some((outer) => contains(outer, element))) &&
    !excluded.some((outer) => outer !== element && contains(outer, element));
  const style = (element: Element, pseudo?: string): CSSStyleDeclaration => getComputedStyle(element, pseudo);
  const parse = (colour: string): number[] => (colour.match(/[\d.]+/g) ?? []).map(Number);
  const over = ([r, g, b, a = 1]: number[], [br, bg, bb]: number[]): number[] => [
    r * a + br * (1 - a),
    g * a + bg * (1 - a),
    b * a + bb * (1 - a),
  ];
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]: number[]): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const contrast = (a: number[], b: number[]): number => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };
  const rgb = (colour: number[]): string => `rgb(${colour.slice(0, 3).map(Math.round).join(', ')})`;
  /** The colour behind `element`: its own and its ancestors' fills, laid over white. */
  const behind = (element: Element): number[] => {
    const fills: number[][] = [];
    for (let node: Element | null = element; node; node = parent(node)) {
      const fill = parse(style(node).backgroundColor);
      if ((fill[3] ?? 1) > 0) fills.push(fill);
      if ((fill[3] ?? 1) === 1) break;
    }
    return fills.reduceRight((base, fill) => over(fill, base), [255, 255, 255]);
  };
  const outside = (element: Element): number[] => {
    const container = parent(element);
    return container ? behind(container) : [255, 255, 255];
  };
  const shown = (element: Element): boolean =>
    element.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && element.getClientRects().length > 0;
  const visuallyHidden = (element: Element): boolean => {
    for (let node: Element | null = element; node; node = parent(node)) {
      const box = node.getBoundingClientRect();
      if (
        (box.width <= 1 || box.height <= 1) &&
        (/hidden|clip/.test(style(node).overflowX) || style(node).clipPath !== 'none')
      )
        return true;
    }
    return false;
  };
  const disabled = (element: Element): boolean => {
    for (let node: Element | null = element; node; node = parent(node))
      if ((node as HTMLButtonElement).disabled || node.getAttribute('aria-disabled') === 'true') return true;
    return false;
  };
  const describe = (element: Element): string => {
    const id = element.id ? `#${element.id}` : '';
    const classes = [...element.classList]
      .filter((name) => !name.startsWith('ng-') && !name.startsWith('cdk-'))
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join('');
    const name = element.getAttribute('aria-label') ?? (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    return `${element.localName}${id}${classes}${name ? ` "${name.slice(0, 40)}"` : ''}`;
  };
  const findings: IndicatorFinding[] = [];
  const measured: Record<Indicator, number> = { icon: 0, focus: 0, selection: 0 };
  const report = (kind: Indicator, element: Element, message: string): void => {
    findings.push({
      kind,
      message: `${kind}: ${describe(element)} ${message}`,
      excepted: exceptions.flatMap((exception, index) =>
        exception.kind === kind && element.matches(exception.target) ? [index] : [],
      ),
    });
  };

  /** One line, border or fill something draws, with what it is seen against. */
  interface Drawing {
    what: string;
    raw: string;
    colour: number[];
    against: number[];
  }
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;
  /** What `element`, or one of its pseudo-elements, draws in outline, shadow and border. */
  const drawingsOf = (element: Element, pseudo?: string, label = ''): Drawing[] => {
    const own = style(element, pseudo);
    if (pseudo && (own.content === 'none' || own.content === 'normal')) return [];
    const fill = over(parse(own.backgroundColor), behind(element));
    const out = outside(element);
    const drawings: Drawing[] = [];
    const name = `${label}${pseudo ?? ''}`;
    if (own.outlineStyle !== 'none' && parseFloat(own.outlineWidth) >= 1) {
      const colour = parse(own.outlineColor);
      if ((colour[3] ?? 1) > 0) {
        const against = parseFloat(own.outlineOffset) + parseFloat(own.outlineWidth) <= 0 ? fill : out;
        const raw = `${own.outlineStyle} ${own.outlineWidth} ${own.outlineColor} ${own.outlineOffset}`;
        drawings.push({ what: `${name}outline`, raw, colour: over(colour, against), against });
      }
    }
    for (const [, colour, rest] of own.boxShadow.matchAll(/(rgba?\([^)]*\))([^,]*)/g)) {
      const parsed = parse(colour);
      if ((parsed[3] ?? 1) === 0) continue;
      const against = /inset/.test(rest) ? fill : out;
      drawings.push({ what: `${name}shadow`, raw: `${colour}${rest}`, colour: over(parsed, against), against });
    }
    for (const side of SIDES) {
      const colour = parse(own[`border${side}Color`]);
      if (parseFloat(own[`border${side}Width`]) < 1 || ['none', 'hidden'].includes(own[`border${side}Style`])) continue;
      if ((colour[3] ?? 1) === 0) continue;
      const raw = `${own[`border${side}Style`]} ${own[`border${side}Width`]} ${own[`border${side}Color`]}`;
      drawings.push({ what: `${name}border-${side.toLowerCase()}`, raw, colour: over(colour, fill), against: out });
    }
    if (pseudo) {
      const colour = parse(own.backgroundColor);
      if ((colour[3] ?? 1) > 0) {
        const against = behind(element);
        drawings.push({ what: `${name}fill`, raw: own.backgroundColor, colour: over(colour, against), against });
      }
    }
    return drawings;
  };
  /**
   * What a box draws, with the boxes around it up to `levels` above, and the absolutely positioned
   * layers inside each. A box more than 48px larger each way stops the climb unless `anySize`.
   */
  const drawingsAround = (element: Element, levels: number, anySize = false): Drawing[] => {
    const own = element.getBoundingClientRect();
    const drawings: Drawing[] = [];
    let box: Element | null = element;
    for (let level = 0; box && level <= levels; level++, box = parent(box)) {
      const rect = box.getBoundingClientRect();
      if (!anySize && (rect.width > own.width + 48 || rect.height > own.height + 48)) break;
      const label = level ? `ancestor ${level} ` : '';
      drawings.push(
        ...drawingsOf(box, undefined, label),
        ...drawingsOf(box, '::before', label),
        ...drawingsOf(box, '::after', label),
      );
      for (const layer of box.querySelectorAll('*')) {
        if (style(layer).position !== 'absolute' || !shown(layer)) continue;
        if (level && contains(layer, element)) continue;
        // A layer's pieces are drawn in flow inside it, as an outlined field's outline is.
        [layer, ...layer.querySelectorAll('*')].forEach((piece, index) =>
          drawings.push(
            ...drawingsOf(piece, undefined, `${label}layer ${index} `),
            ...drawingsOf(piece, '::before', `${label}layer ${index} `),
          ),
        );
      }
    }
    return drawings;
  };
  const strongest = (drawings: Drawing[]): (Drawing & { ratio: number }) | undefined =>
    drawings
      .map((drawing) => ({ ...drawing, ratio: contrast(drawing.colour, drawing.against) }))
      .sort((a, b) => b.ratio - a.ratio)[0];
  const signature = (drawing: Drawing): string => `${drawing.what}|${drawing.raw}`;

  // Icons.
  const CONTROLS =
    'button, a[href], summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"]';
  const shownText = (element: Element): boolean => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const holder = node.parentElement;
      if (!holder || !node.textContent?.trim() || holder.closest('svg')) continue;
      if (shown(holder) && !visuallyHidden(holder)) return true;
    }
    return false;
  };
  /** An icon's stroke, or its fill where it has no stroke, with the opacity of every ancestor. */
  const iconColour = (svg: Element): number[] | undefined => {
    let colour: number[] | undefined;
    for (const shape of svg.querySelectorAll('path, line, polyline, polygon, circle, rect, ellipse')) {
      const own = style(shape);
      if (own.stroke !== 'none' && parseFloat(own.strokeWidth) > 0) {
        colour = parse(own.stroke);
        colour[3] = (colour[3] ?? 1) * Number(own.strokeOpacity);
        break;
      }
      if (own.fill !== 'none') {
        colour = parse(own.fill);
        colour[3] = (colour[3] ?? 1) * Number(own.fillOpacity);
        break;
      }
    }
    if (!colour) return undefined;
    for (let node: Element | null = svg; node; node = parent(node))
      colour[3] = (colour[3] ?? 1) * Number(style(node).opacity);
    return colour;
  };
  for (const svg of elements) {
    if (svg.localName !== 'svg' || parent(svg)?.closest('svg') || !within(svg) || !shown(svg) || visuallyHidden(svg))
      continue;
    const box = svg.getBoundingClientRect();
    if (box.width < 8 || box.height < 8) continue;
    let control: Element | null = null;
    for (let node: Element | null = svg; node && !control; node = parent(node))
      if (node.matches(CONTROLS)) control = node;
    if (control && disabled(control)) continue;
    const host = parent(svg);
    const named =
      svg.getAttribute('role') === 'img' ||
      svg.hasAttribute('aria-label') ||
      !!svg.querySelector('title') ||
      (!!host && (host.getAttribute('role') === 'img' || host.hasAttribute('aria-label')) && host !== control);
    if (!named && !(control && !shownText(control))) continue;
    const colour = iconColour(svg);
    if (!colour) continue;
    const ground = behind(svg);
    const drawn = over(colour, ground);
    measured.icon++;
    const ratio = contrast(drawn, ground);
    if (ratio < 3) report('icon', control ?? svg, `is ${rgb(drawn)} on ${rgb(ground)}, ${ratio.toFixed(2)}:1`);
  }

  // Selection.
  const SELECTED = [
    '[aria-selected="true"]',
    '[aria-pressed="true"]',
    '[aria-current]:not([aria-current="false"])',
    ...selected,
  ].join(', ');
  const textMarks = (element: Element, sibling: Element | undefined): Drawing[] => {
    if (!sibling) return [];
    const mine = style(element);
    const theirs = style(sibling);
    const heavier = parseFloat(mine.fontWeight) > parseFloat(theirs.fontWeight);
    const underlined = /underline/.test(mine.textDecorationLine) && !/underline/.test(theirs.textDecorationLine);
    if (!heavier && !underlined) return [];
    // Text is held to 4.5:1 by 1.4.3, which axe measures, so a text mark is taken as passing here.
    return [{ what: heavier ? 'heavier text' : 'underline', raw: 'text', colour: [0, 0, 0], against: [255, 255, 255] }];
  };
  /** A changed fill, seen against what surrounds the item, and the icons the sibling lacks. */
  const fillAndIconMarks = (element: Element, sibling: Element | undefined): Drawing[] => {
    const marks: Drawing[] = [];
    const fill = parse(style(element).backgroundColor);
    // With nothing to compare, the item's own fill is its mark if it has one.
    if (sibling ? style(element).backgroundColor !== style(sibling).backgroundColor : (fill[3] ?? 1) > 0)
      marks.push({ what: 'fill', raw: 'fill', colour: behind(element), against: outside(element) });
    if (!sibling) return marks;
    const icons = (node: Element): Element[] => [...node.querySelectorAll('svg')].filter((svg) => shown(svg));
    if (icons(element).length > icons(sibling).length)
      for (const svg of icons(element)) {
        const colour = iconColour(svg);
        if (colour) marks.push({ what: 'icon', raw: 'icon', colour: over(colour, behind(svg)), against: behind(svg) });
      }
    return marks;
  };
  for (const item of elements) {
    if (!item.matches(SELECTED) || item.localName === 'input' || !within(item) || !shown(item) || visuallyHidden(item))
      continue;
    const trailEnd =
      item.hasAttribute('aria-current') &&
      ![...(item.parentElement?.children ?? [])]
        .slice([...(item.parentElement?.children ?? [])].indexOf(item) + 1)
        .some((other) => other.localName === item.localName && shown(other));
    if (trailEnd) continue;
    // The nearest unselected item of the same kind: a sibling, or failing that one in the same group.
    const kind = (other: Element): boolean =>
      other !== item &&
      other.localName === item.localName &&
      other.classList[0] === item.classList[0] &&
      !other.matches(SELECTED) &&
      shown(other);
    let sibling = [...(item.parentElement?.children ?? [])].find(kind);
    for (let group = parent(item), level = 0; !sibling && group && level < 3; group = parent(group), level++)
      sibling = [...group.querySelectorAll(item.localName)].find(kind);
    const theirs = new Set(sibling ? drawingsAround(sibling, 0).map(signature) : []);
    const marks = [
      ...drawingsAround(item, 0).filter((drawing) => !theirs.has(signature(drawing))),
      ...textMarks(item, sibling),
      ...fillAndIconMarks(item, sibling),
    ];
    // A state set on an inner control may be drawn by the element around it, as a chip's is.
    for (
      let mine = parent(item), other = sibling ? parent(sibling) : null, level = 0;
      mine && other && mine !== other && level < 2;
      mine = parent(mine), other = parent(other), level++
    ) {
      const others = new Set(drawingsAround(other, 0).map(signature));
      marks.push(
        ...drawingsAround(mine, 0).filter((drawing) => !others.has(signature(drawing))),
        ...textMarks(mine, other),
        ...fillAndIconMarks(mine, other),
      );
    }
    measured.selection++;
    const best = strongest(marks);
    if (!best) report('selection', item, sibling ? 'looks the same as an unselected sibling' : 'draws no mark');
    else if (best.ratio < 3)
      report(
        'selection',
        item,
        `${best.what} is ${rgb(best.colour)} on ${rgb(best.against)}, ${best.ratio.toFixed(2)}:1`,
      );
  }

  // Focus, last, because it moves focus. Each control is restored to unfocused afterwards.
  const FOCUSABLE =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
  const deepActive = (): Element | null => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
  };
  const before = deepActive() as HTMLElement | null;
  for (const control of elements) {
    if (
      !control.matches(FOCUSABLE) ||
      !within(control) ||
      !shown(control) ||
      visuallyHidden(control) ||
      disabled(control)
    )
      continue;
    (deepActive() as HTMLElement | null)?.blur();
    const resting = new Set(drawingsAround(control, 6, true).map(signature));
    (control as HTMLElement).focus({ preventScroll: true, focusVisible: true } as FocusOptions);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (deepActive() !== control || !control.matches(':focus-visible')) continue;
    const changed = drawingsAround(control, 6, true).filter((drawing) => !resting.has(signature(drawing)));
    measured.focus++;
    const best = strongest(changed);
    if (!best) report('focus', control, 'changes no outline, border or shadow when focused');
    else if (best.ratio < 3)
      report(
        'focus',
        control,
        `${best.what} is ${rgb(best.colour)} on ${rgb(best.against)}, ${best.ratio.toFixed(2)}:1`,
      );
    (control as HTMLElement).blur();
  }
  before?.focus({ preventScroll: true });
  for (const root of roots) root.adoptedStyleSheets = root.adoptedStyleSheets.filter((sheet) => sheet !== still);

  return { measured, findings };
}

/** An icon, focus indicator or selection mark that waits on a visible change. */
interface IndicatorException {
  kind: Indicator;
  states: string[];
  /** A selector the element it names matches. */
  target: string;
  measured: string;
  /** The visible change that would fix it. */
  needs: string;
}

const INDICATOR_EXCEPTIONS: IndicatorException[] = [];

for (const [condition, { width, height, kinds }] of Object.entries(CONDITIONS) as [
  Condition,
  (typeof CONDITIONS)[Condition],
][]) {
  test.describe(condition, () => {
    for (const [state, { surface = DESIGNER, reach }] of Object.entries(STATES)) {
      test(`${state} at ${width} by ${height}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await reach(page);
        await expect(page.locator(DESIGNER)).toBeVisible();
        if (condition === 'spacing') await forceTextSpacing(page);
        await settle(page);
        const { findings } = await audit(page, kinds, state, condition, surface);
        expect(
          findings.filter((finding) => !finding.excepted.length).map((finding) => finding.message),
          `${condition}, ${state}`,
        ).toEqual([]);
        // An exception that no longer finds its finding has outlived it.
        const stale = EXCEPTIONS.flatMap((exception, index) =>
          exception.states.includes(state) &&
          exception.conditions.includes(condition) &&
          !findings.some((finding) => finding.excepted.includes(index))
            ? [`${exception.kind}: ${exception.target} is no longer found`]
            : [],
        );
        expect(stale, `${condition}, ${state}`).toEqual([]);
      });
    }
  });
}

// A selector that stops matching would let the boundary check pass by measuring nothing.
test('the boundary check measures the fields of a fresh template', async ({ page }) => {
  await page.setViewportSize(CONDITIONS.boundary);
  await STATES['fresh template'].reach(page);
  await settle(page);
  const { measured } = await audit(page, ['boundary'], 'fresh template', 'boundary', DESIGNER);
  expect(measured).toBeGreaterThan(0);
});

test.describe('indicators', () => {
  for (const [state, { surface = DESIGNER, reach }] of Object.entries(STATES)) {
    test(`${state} at 1280 by 900`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await reach(page);
      await expect(page.locator(DESIGNER)).toBeVisible();
      await settle(page);
      const applies = INDICATOR_EXCEPTIONS.filter((exception) => exception.states.includes(state));
      const { findings } = await page.evaluate(findFaintIndicators, {
        scope: surface,
        exclude: [],
        selected: [],
        exceptions: applies.map(({ kind, target }) => ({ kind, target })),
      });
      expect(
        findings.filter((finding) => !finding.excepted.length).map((finding) => finding.message),
        `indicators, ${state}`,
      ).toEqual([]);
      const stale = applies.flatMap((exception, index) =>
        findings.some((finding) => finding.excepted.includes(index))
          ? []
          : [`${exception.kind}: ${exception.target} is no longer found`],
      );
      expect(stale, `indicators, ${state}`).toEqual([]);
    });
  }
});

// A selector that stops matching would let the indicator check pass by measuring nothing.
test('the indicator check measures icons, focus and selection', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await STATES['field selected, Configuration tab'].reach(page);
  await settle(page);
  const { measured } = await page.evaluate(findFaintIndicators, {
    scope: DESIGNER,
    exclude: [],
    selected: [],
    exceptions: [],
  });
  expect(measured.icon, 'icons').toBeGreaterThan(0);
  expect(measured.focus, 'focus indicators').toBeGreaterThan(0);
  expect(measured.selection, 'selection marks').toBeGreaterThan(0);
});
