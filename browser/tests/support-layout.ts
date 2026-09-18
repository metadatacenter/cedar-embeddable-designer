import { Page, expect } from '@playwright/test';

export const DESIGNER = 'cedar-embeddable-designer';

/**
 * The geometric claims, measured in one pass.
 *
 * One implementation, used by the layout suite and by the attribute matrix, because
 * the rules below have subtleties that would drift apart in two copies — and one of
 * them cost a false failure already.
 */
export interface LayoutReport {
  /** Leaf text a card gives too little room to show. */
  clipped: string[];
  /** Anything reaching outside the card that holds it. */
  escaped: string[];
  /** Per card, for the column and budget claims. */
  geometry: { id: string; label: string; width: number; height: number }[];
  /** How far the document scrolls sideways, which should be nowhere. */
  pageOverflow: number;
}

/**
 * Audit every card, or one of them.
 *
 * Three kinds of element are skipped, and each exclusion is a rule rather than a
 * convenience. A control holds and scrolls its own value, so its content is not the
 * layout's business. An element that scrolls on purpose is not an element that clips by
 * accident. And a box one pixel tall or wide is showing text to nobody: that is how
 * `sr-only` works, and treating its deliberate clipping as a defect reported the
 * annotations table's own screen-reader heading as broken.
 */
export async function auditLayout(page: Page, cardIndex?: number): Promise<LayoutReport> {
  return page.evaluate((index) => {
    const root = document.querySelector('cedar-embeddable-designer')!.shadowRoot!;
    const all = [...root.querySelectorAll('[id^=field-card-]')];
    const cards = index === undefined ? all : all.slice(index, index + 1);

    const scrolls = (element: Element): boolean => {
      const style = getComputedStyle(element);
      return /auto|scroll/.test(style.overflowX) || /auto|scroll/.test(style.overflowY);
    };
    const OWN_SCROLL = ['input', 'textarea', 'select', 'svg', 'path', 'img', 'g', 'rect', 'circle'];

    const clipped: string[] = [];
    const escaped: string[] = [];
    const geometry: { id: string; label: string; width: number; height: number }[] = [];

    for (const card of cards) {
      const box = card.getBoundingClientRect();
      const label = (card.querySelector('input') as HTMLInputElement | null)?.value || card.id;
      geometry.push({ id: card.id, label, width: Math.round(box.width), height: Math.round(box.height) });

      /*
       * Two kinds of element are not laid out inside the card, and measuring them
       * against it reports the thing that is working as a defect.
       *
       * A scroller's content is the scroller's business: extending past the visible box
       * is what scrolling is for, so the content is skipped and the scroller itself is
       * measured against the card. Without this the annotations table reported fifteen
       * escapes for the one thing that had just been fixed.
       *
       * A `position: fixed` subtree is placed against the viewport and not against any
       * container, so a card holding a modal — the term picker opens one — appeared to
       * be leaking a full-width overlay. Whether that overlay fits is a question about
       * the viewport, which `pageOverflow` already asks.
       */
      const detached = (element: Element): boolean => {
        for (let node: Element | null = element; node && node !== card; node = node.parentElement) {
          if (getComputedStyle(node).position === 'fixed') return true;
          if (node !== element && scrolls(node)) return true;
        }
        return false;
      };

      for (const element of card.querySelectorAll('*')) {
        if (OWN_SCROLL.includes(element.tagName.toLowerCase()) || scrolls(element)) continue;
        // Deliberately invisible: showing nothing to anyone, so nothing to clip.
        if (element.clientWidth <= 1 || element.clientHeight <= 1) continue;
        if (detached(element)) continue;

        const text = (element.textContent ?? '').trim();
        if (element.children.length === 0 && text && element.scrollWidth > element.clientWidth + 1) {
          clipped.push(`${label}: "${text.slice(0, 30)}" needs ${element.scrollWidth}px in ${element.clientWidth}px`);
        }

        const inner = element.getBoundingClientRect();
        if (inner.width > 0 && (inner.right > box.right + 1 || inner.left < box.left - 1)) {
          escaped.push(
            `${label}: ${element.tagName.toLowerCase()} spans ${Math.round(inner.left)}..${Math.round(inner.right)} outside ${Math.round(box.left)}..${Math.round(box.right)}`,
          );
        }
      }
    }

    const doc = document.documentElement;
    return { clipped, escaped, geometry, pageOverflow: doc.scrollWidth - doc.clientWidth };
  }, cardIndex);
}

/** Assert a card holds its shape, naming what went wrong and where. */
export async function expectLaidOut(page: Page, where: string, cardIndex = 0): Promise<void> {
  const report = await auditLayout(page, cardIndex);
  expect.soft(report.clipped, `${where}: text clipped inside the card`).toEqual([]);
  expect.soft(report.escaped, `${where}: content outside the card`).toEqual([]);
  expect.soft(report.pageOverflow, `${where}: the page scrolls sideways`).toBeLessThanOrEqual(0);
}
