import AxeBuilder from '@axe-core/playwright';
import type { Result } from 'axe-core';
import { Page, expect } from '@playwright/test';

/**
 * The accessibility gate every scan of the designer goes through.
 *
 * The tags are WCAG 2.0, 2.1 and 2.2 at levels A and AA, with Label in Name enabled beside them.
 * Undecided contrast and target-size results fail unless a measurement settles them, and a scan
 * waits for fades and smooth scrolls to finish, so a spec that scans one state judges it as the
 * accessibility suite judges every other.
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * WCAG 2.1's Label in Name, criterion 2.5.3: a control's accessible name contains the text it shows,
 * so that speech input reaches it by its visible label. axe-core's rule for it is experimental, and
 * a tag selection leaves experimental rules out, so the scan enables it by name beside the tags.
 */
const LABEL_IN_NAME = 'label-content-name-mismatch';

/**
 * axe-core's undecided results for contrast and target size, criteria 1.4.3 and 2.5.8, each
 * settled by measurement.
 *
 * axe leaves a result undecided when it cannot compute it, such as a contrast against a background
 * it cannot see past or the size of a box its content overflows. A result is settled only when its element matches an entry here, and
 * the entry's measurement is taken again on every scan, so a change to the colour, size or spacing
 * it rests on fails the gate instead of passing on an old reading. A result that matches no entry,
 * or whose measurement no longer passes, fails, unless an entry in `EXCEPTIONS` records it.
 */
interface Settled {
  rule: 'color-contrast' | 'target-size';
  /** A selector every element the entry settles matches. */
  target: string;
  /** A selector for what covers part of the element, when the entry settles content partly out of view. */
  coveredBy?: string;
  /** The value measured on 2026-10-20, or on the date the entry gives. */
  measured: string;
  /** Why the measured value passes. */
  passes: string;
  /**
   * The measurement each scan takes again. `contrast` is the least ratio of the text's colour to the fills
   * behind it. A target passes on `equivalent`, a control in the same card that does the same and
   * is at least 24 by 24, or on criterion 2.5.8's spacing exception: a 24px circle centred on it
   * meets no other target and no other undersized target's circle.
   */
  check: { contrast: number } | { equivalent?: { target: string; within: string } };
}

const SETTLED: Settled[] = [
  {
    rule: 'color-contrast',
    target: '#host-heading',
    measured: 'the fixture heading, #831843 on #fdf2f8, 8.84:1, on 2026-11-12',
    passes:
      'WebKit leaves the fixture heading undecided after the host scrolls. The visible text sits on ' +
      'the opaque pink host page, outside the designer; every scan measures that contrast again.',
    check: { contrast: 4.5 },
  },
  {
    rule: 'color-contrast',
    target: 'select',
    measured: 'text rgba(0, 0, 0, 0.87) on white, 16.1:1',
    passes:
      "The native dropdown's chevron is a background gradient, which axe-core cannot see past. The text " +
      "sits on the control's white fill.",
    check: { contrast: 4.5 },
  },
  {
    rule: 'color-contrast',
    target: '.library-toggle-icon',
    measured: 'rgb(85, 85, 85) on white, 7.5:1',
    passes:
      "The library sidebar's arrow is a symbol, which axe-core does not judge as text. It is drawn in the " +
      'muted text colour on the sidebar, and passes as text would.',
    check: { contrast: 4.5 },
  },
  {
    rule: 'color-contrast',
    target: '.dialog [role="alert"]',
    measured: 'rgb(180, 35, 24) on white, 6.6:1',
    passes:
      "At every point of a picker dialog's alert, the alert and then the dialog's opaque white surface are " +
      'on top. axe-core reports it partly obscured, which the stacking order does not bear out.',
    check: { contrast: 4.5 },
  },
  {
    rule: 'color-contrast',
    target: '*',
    coveredBy: '.app-header',
    measured: "the template settings' Footer label, rgb(85, 85, 85) on rgb(244, 246, 246), 6.9:1",
    passes:
      'A control scrolled beneath the sticky header is covered in part, so axe-core cannot tell what is ' +
      'behind it. The part still visible sits on its own fill.',
    check: { contrast: 4.5 },
  },
  {
    rule: 'color-contrast',
    target: '*',
    coveredBy: '.overview-panel--overlay',
    measured: "a field's type label beneath the open Overview, rgb(85, 85, 85) on white, 7.5:1, on 2026-11-11",
    passes:
      'On a narrow host the open Overview lies over the canvas, so axe-core cannot tell what is behind a ' +
      'control it covers in part. The part still visible sits on its own fill.',
    check: { contrast: 4.5 },
  },
  {
    rule: 'color-contrast',
    target: '.overview-panel--overlay *',
    measured: "the Overview's row names, rgba(0, 0, 0, 0.87) on white, 16.1:1, on 2026-11-11",
    passes:
      'On a narrow host the open Overview lies over the canvas, which axe-core cannot see past. Its text ' +
      'sits on its own opaque fill.',
    check: { contrast: 4.5 },
  },
  {
    rule: 'target-size',
    target: '.template-header-card .settings-toggle',
    measured: 'a template or element settings toggle of 36 by 14; the header beside it, 870 by 103 for a template',
    passes:
      'Under the 24px minimum, but the header beside each toggle opens the same settings, and criterion ' +
      '2.5.8 accepts an equivalent target that meets it.',
    check: { equivalent: { target: '[appheadertoggle]', within: '.template-header-card' } },
  },
  {
    rule: 'target-size',
    target: 'app-field-settings .settings-toggle',
    measured: "a field's settings toggle of 36 by 14; the field header above it, 838 by 24, on 2026-11-10",
    passes:
      "Under the 24px minimum, and a Constraints or Content panel's last control can end within 12px of " +
      'its centre. The field header opens the same settings and takes the minimum target size, so it is ' +
      'the equivalent target criterion 2.5.8 accepts.',
    check: { equivalent: { target: '[appheadertoggle]', within: 'app-field-card' } },
  },
];

/**
 * Undecided results that measure as failures, which only a visible change can fix. Each is kept
 * here, named and explained, so that the gate passes until that change is made, and each scan
 * checks that the element is still the size it was measured at.
 */
interface Exception {
  rule: Settled['rule'];
  target: string;
  /** The width and height measured on 2026-10-20. */
  size: [number, number];
  measured: string;
  /** The visible change that would fix it. */
  needs: string;
}

const EXCEPTIONS: Exception[] = [];

/** Each undecided contrast or target-size result that `SETTLED` does not settle, with what was measured. */
async function unsettled(page: Page, results: Result[]): Promise<string[]> {
  const nodes = results
    .filter((result) => result.id === 'color-contrast' || result.id === 'target-size')
    .flatMap((result) =>
      result.nodes.map((node) => ({
        rule: result.id,
        target: node.target,
        why: [...node.any, ...node.all, ...node.none][0]?.message ?? '',
      })),
    );
  return page.evaluate(
    ({ nodes, settled, exceptions }) => {
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
        for (let node: Element | null = element; node;) {
          const fill = parse(getComputedStyle(node).backgroundColor);
          if ((fill[3] ?? 1) > 0) fills.push(fill);
          if ((fill[3] ?? 1) === 1) break;
          node = node.parentElement ?? (node.getRootNode() as ShadowRoot).host ?? null;
        }
        return fills.reduceRight((base, fill) => over(fill, base), [255, 255, 255]);
      };
      const everything: Element[] = [];
      const collect = (root: Document | ShadowRoot) => {
        for (const element of root.querySelectorAll('*')) {
          everything.push(element);
          if (element.shadowRoot) collect(element.shadowRoot);
        }
      };
      collect(document);
      const TARGETS =
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), ' +
        'summary, [tabindex]:not([tabindex="-1"]), [appheadertoggle]';
      const resolve = (target: unknown[]): Element | null => {
        const path = (Array.isArray(target[0]) ? target[0] : target) as string[];
        let root: Document | ShadowRoot = document;
        let element: Element | null = null;
        for (const selector of path) {
          element = root.querySelector(selector);
          if (!element) return null;
          root = element.shadowRoot ?? root;
        }
        return element;
      };
      /** Whether something matching `selector` lies over part of `element`. */
      const covered = (element: Element, selector: string) => {
        const box = element.getBoundingClientRect();
        const root = element.getRootNode() as Document | ShadowRoot;
        return [0.1, 0.5, 0.9].some((fx) =>
          [0.1, 0.5, 0.9].some((fy) => {
            const top = root.elementFromPoint(box.x + box.width * fx, box.y + box.height * fy);
            return !!top && !element.contains(top) && !!top.closest(selector);
          }),
        );
      };
      /** Why `element` misses criterion 2.5.8's spacing exception, or null when it meets it. */
      const crowded = (element: Element): string | null => {
        const own = element.getBoundingClientRect();
        const x = own.x + own.width / 2;
        const y = own.y + own.height / 2;
        const near = everything.filter((other) => {
          if (!other.matches(TARGETS) || other.contains(element) || element.contains(other)) return false;
          if (getComputedStyle(other).pointerEvents === 'none') return false;
          if (!other.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
          const r = other.getBoundingClientRect();
          const gap = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
          const centres = Math.hypot(r.x + r.width / 2 - x, r.y + r.height / 2 - y);
          return gap < 12 || ((r.width < 24 || r.height < 24) && centres < 24);
        });
        return near.length
          ? `${own.width} by ${own.height}, its spacing circle meeting ` +
              near.map((other) => other.getAttribute('aria-label') ?? other.localName).join(', ')
          : null;
      };
      /** Why `element`, matching `entry`, fails the measurement it was settled on, or null when it passes. */
      const fails = (element: Element, entry: (typeof settled)[number]): string | null => {
        if ('contrast' in entry.check) {
          const fill = behind(element);
          const text = luminance(over(parse(getComputedStyle(element).color), fill));
          const ground = luminance(fill);
          const ratio = (Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05);
          return ratio >= entry.check.contrast ? null : `${ratio.toFixed(1)}:1, under ${entry.check.contrast}:1`;
        }
        const equivalent = entry.check.equivalent;
        const box =
          equivalent && element.closest(equivalent.within)?.querySelector(equivalent.target)?.getBoundingClientRect();
        return box && box.width >= 24 && box.height >= 24 ? null : crowded(element);
      };
      return nodes.flatMap(({ rule, target, why }) => {
        const element = resolve(target as unknown[]);
        const where = `${rule}: ${JSON.stringify(target)}`;
        if (!element) return [`${where} is undecided, and its element is gone`];
        const entry = settled.find(
          (entry) =>
            entry.rule === rule &&
            element.matches(entry.target) &&
            (!entry.coveredBy || covered(element, entry.coveredBy)),
        );
        const problem = entry ? fails(element, entry) : `undecided and not settled: ${why}`;
        if (problem === null) return [];
        // A failure an exception records passes while the element keeps the size it was measured at.
        const box = element.getBoundingClientRect();
        const excepted = exceptions.some(
          (exception) =>
            exception.rule === rule &&
            element.matches(exception.target) &&
            box.width === exception.size[0] &&
            box.height === exception.size[1],
        );
        return excepted ? [] : [`${where} ${problem}`];
      });
    },
    { nodes, settled: SETTLED, exceptions: EXCEPTIONS },
  );
}

/**
 * Criterion 2.5.3 for a text box whose placeholder is its only visible text, which is then its
 * visible label. axe-core's rule reads only names a control takes from its content, so it passes
 * such a box whatever its name says. A box with a label of its own shows its placeholder as a
 * hint. A header box's label sits beside it unassociated, because a click on that label toggles
 * the settings.
 */
async function placeholdersOutsideNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const failures: string[] = [];
    const visit = (root: Document | ShadowRoot) => {
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) visit(element.shadowRoot);
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) continue;
        const placeholder = element.placeholder.trim();
        if (!placeholder || element.value || !element.checkVisibility()) continue;
        if (element.labels?.length || element.hasAttribute('aria-labelledby')) continue;
        if (element.closest('.template-field-group')?.querySelector(':scope > label')) continue;
        const name = element.getAttribute('aria-label') || element.title || placeholder;
        if (!name.toLocaleLowerCase().includes(placeholder.toLocaleLowerCase()))
          failures.push(`placeholder-in-name: "${placeholder}" is named "${name}"`);
      }
    };
    visit(document);
    return failures;
  });
}

/**
 * Check the whole page once its animations finish, so contrast is read at full opacity.
 *
 * A click renders on the next coalesced pass, so the fade it starts does not exist until two
 * frames later. Chromium lists a shadow tree's animations on its root and not on the document.
 */
export async function expectAccessible(page: Page, state: string): Promise<void> {
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const roots: DocumentOrShadowRoot[] = [document];
    for (const element of document.querySelectorAll('*')) if (element.shadowRoot) roots.push(element.shadowRoot);
    // An earlier click leaves the pointer over the canvas. When the layout later moves an insertion
    // zone beneath it, WebKit starts the zone's fade only some frames afterwards, once every wait
    // here has passed, and the scan read a zone at 91% opacity as a contrast failure. The scan
    // judges the fade's two end states, so the zones reach them without it.
    for (const root of roots)
      for (const zone of (root as ParentNode).querySelectorAll<HTMLElement>('.insert-zone'))
        zone.style.transition = 'none';
    await Promise.all(
      roots
        .flatMap((root) => root.getAnimations())
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
    // A smooth scroll is no animation, and content passing under a sticky header leaves axe-core unable
    // to tell what is behind it. The scan waits until nothing has scrolled for two frames.
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
  // Scrolling beneath a stationary pointer can start an insertion-zone hover transition after
  // the first animation wait. Judge its final visible/hidden state, including WebKit frames in
  // which getAnimations() is empty while computed opacity is still between the endpoints.
  await page.waitForFunction(
    () => {
      const roots: DocumentOrShadowRoot[] = [document];
      for (const element of document.querySelectorAll('*')) if (element.shadowRoot) roots.push(element.shadowRoot);
      return roots.every(
        (root) =>
          root
            .getAnimations()
            .every(
              (animation) =>
                animation.effect?.getTiming().iterations === Infinity ||
                ['finished', 'idle'].includes(animation.playState),
            ) &&
          [...root.querySelectorAll('.insert-zone')].every((zone) => {
            const opacity = Number(getComputedStyle(zone).opacity);
            return opacity === 0 || opacity === 1;
          }),
      );
    },
    undefined,
    { timeout: 5_000 },
  );
  // axe-core lets a rule enabled by name override the tag selection, so one scan covers both. The
  // builder's `options` replaces every option set before it, so it comes ahead of `withTags`.
  const scan = await new AxeBuilder({ page })
    .options({ rules: { [LABEL_IN_NAME]: { enabled: true } } })
    .withTags(WCAG)
    .analyze();
  // A builder that dropped the rule option would stop checking Label in Name and fail nothing, so the
  // scan must report the rule.
  const evaluated = [scan.passes, scan.violations, scan.incomplete, scan.inapplicable].flat();
  expect(
    evaluated.some((result) => result.id === LABEL_IN_NAME),
    `${LABEL_IN_NAME} did not run`,
  ).toBe(true);
  const { violations, incomplete } = scan;
  // A label on an element whose role takes none is one axe cannot always decide, and a screen
  // reader ignores it either way, so the undecided case fails too.
  const ignoredLabels = incomplete.filter((result) => result.id === 'aria-prohibited-attr');
  const failures = [
    ...[...violations, ...ignoredLabels].flatMap((violation) =>
      violation.nodes.map((node) => `${violation.id}: ${JSON.stringify(node.target)} — ${node.failureSummary ?? ''}`),
    ),
    ...(await unsettled(page, incomplete)),
    ...(await placeholdersOutsideNames(page)),
  ];
  expect(failures, state).toEqual([]);
}
