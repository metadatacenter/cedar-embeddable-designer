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
 * Whether the designer's content survives a narrow host, zoom, an author's own text spacing and a
 * faint placeholder: WCAG 1.4.10 Reflow, 1.4.4 Resize Text, 1.4.12 Text Spacing and, for
 * placeholders, 1.4.3 Contrast (Minimum).
 *
 * The same four checks run over Workspace, the term picker, CEE and this designer, by one method:
 *
 * - Reflow. At 320 CSS px wide, neither the page nor any scroll container inside the designer
 *   scrolls sideways, and every control can be scrolled to and hit. A data table that needs both
 *   directions may scroll inside its own container, and each such container is named in
 *   `TABLE_SCROLLERS`.
 * - Resize. A 640 by 400 viewport is a 1280 by 800 window at 200% zoom. No text is clipped, no
 *   text overlaps other text, and every control can be scrolled to and hit.
 * - Text spacing. At 1280 px wide, with criterion 1.4.12's line, letter, word and paragraph
 *   spacing forced on the document and every shadow root, no text is clipped and none overlaps.
 * - Placeholders. Every placeholder's colour measures at least 4.5:1 against what it sits on.
 *
 * A finding the designer cannot fix without a visible change is recorded in `EXCEPTIONS`, with
 * the change it needs, so that the check passes and the finding stays in view. An exception
 * that no longer finds its finding fails, so the list cannot outlive the defect.
 */

type Condition = 'reflow' | 'resize' | 'spacing' | 'placeholder';

/** One kind of failure, as the audit names it. */
type Kind = 'page-scroll' | 'scroll' | 'unreachable' | 'clipped' | 'overlap' | 'placeholder';

const CONDITIONS: Record<Condition, { width: number; height: number; kinds: Kind[] }> = {
  reflow: { width: 320, height: 640, kinds: ['page-scroll', 'scroll', 'unreachable'] },
  resize: { width: 640, height: 400, kinds: ['clipped', 'overlap', 'unreachable'] },
  spacing: { width: 1280, height: 900, kinds: ['clipped', 'overlap'] },
  placeholder: { width: 1280, height: 900, kinds: ['placeholder'] },
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
 */
async function audit(
  page: Page,
  kinds: Kind[],
  state: string,
  condition: Condition,
  surface: string,
): Promise<Finding[]> {
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

      if (kinds.includes('placeholder')) {
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
        for (const element of elements) {
          if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) continue;
          if (!element.placeholder.trim() || element.disabled || !shown(element) || visuallyHidden(element)) continue;
          const placeholder = getComputedStyle(element, '::placeholder');
          const [r, g, b, a = 1] = parse(placeholder.color);
          const fill = behind(element);
          const text = luminance(over([r, g, b, a * Number(placeholder.opacity || 1)], fill));
          const ground = luminance(fill);
          const ratio = (Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05);
          if (ratio < 4.5)
            report(
              'placeholder',
              element,
              `placeholder "${element.placeholder}" is ${placeholder.color} on rgb(${fill.map(Math.round).join(', ')}), ${ratio.toFixed(2)}:1`,
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

      return findings.map(({ kind, message, element }) => ({
        kind: kind as never,
        message,
        excepted: exceptions.flatMap((exception, index) =>
          exception.applies && exception.kind === kind && element.matches(exception.target) ? [index] : [],
        ),
      }));
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
        const findings = await audit(page, kinds, state, condition, surface);
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
