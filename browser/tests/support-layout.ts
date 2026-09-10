import { Page, expect } from '@playwright/test';

export const DESIGNER = 'cedar-embeddable-designer';

/**
 * The layout claims, read in one pass over one card.
 *
 * Shared by the layout suite and the attribute matrix, because a control is not
 * working if setting it pushes something out of the card. Every violation is returned
 * rather than thrown on, so one audit reports everything wrong at once.
 */
export interface LayoutReport {
  clipped: string[];
  escaped: string[];
  pageOverflow: number;
}

export async function auditLayout(page: Page, cardIndex = 0): Promise<LayoutReport> {
  return page.evaluate((index) => {
    const root = document.querySelector('cedar-embeddable-designer')!.shadowRoot!;
    const cards = [...root.querySelectorAll('[id^=field-card-]')];
    const card = cards[index];
    const clipped: string[] = [];
    const escaped: string[] = [];
    if (card) {
      const box = card.getBoundingClientRect();
      const scrolls = (el: Element) => {
        const s = getComputedStyle(el);
        return /auto|scroll/.test(s.overflowX) || /auto|scroll/.test(s.overflowY);
      };
      const own = ['input', 'textarea', 'select', 'svg', 'path', 'img', 'g', 'rect', 'circle'];
      for (const el of card.querySelectorAll('*')) {
        if (own.includes(el.tagName.toLowerCase()) || scrolls(el)) continue;
        const text = (el.textContent ?? '').trim();
        if (el.children.length === 0 && text && el.scrollWidth > el.clientWidth + 1) {
          clipped.push(`${el.tagName.toLowerCase()} "${text.slice(0, 24)}" ${el.scrollWidth}>${el.clientWidth}`);
        }
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1)) {
          escaped.push(
            `${el.tagName.toLowerCase()} ${Math.round(r.left)}..${Math.round(r.right)} vs card ${Math.round(box.left)}..${Math.round(box.right)}`,
          );
        }
      }
    }
    const doc = document.documentElement;
    return { clipped, escaped, pageOverflow: doc.scrollWidth - doc.clientWidth };
  }, cardIndex);
}

/** Assert a card holds its shape, naming what went wrong where. */
export async function expectLaidOut(page: Page, where: string, cardIndex = 0): Promise<void> {
  const report = await auditLayout(page, cardIndex);
  expect.soft(report.clipped, `${where}: text clipped inside the card`).toEqual([]);
  expect.soft(report.escaped, `${where}: content outside the card`).toEqual([]);
  expect.soft(report.pageOverflow, `${where}: the page scrolls sideways`).toBeLessThanOrEqual(0);
}
