/**
 * Keeping the keyboard inside a modal, across shadow boundaries.
 *
 * The usual focus trap collects `querySelectorAll` of a focusable selector and wraps
 * at the ends. That finds nothing useful here: the designer opens the term picker in
 * an overlay, and everything an author would tab to is inside
 * `<cedar-term-picker>`'s own shadow root, where a light-DOM query cannot reach.
 * `document.activeElement` has the matching problem — it reports the custom element,
 * not the control inside it.
 *
 * Measured before this existed, by opening the picker and pressing Tab: focus was
 * never moved into the panel at all, and the first seven stops were controls on the
 * card the overlay was covering — a button, a text box, a select — with the eighth the
 * first to land inside the picker. A keyboard author tabbed blind through a card they
 * could not see before reaching what they had opened, and nothing held them there.
 *
 * `inert` on everything else would be the shorter answer, and it is not available:
 * the overlay is rendered inside the card it belongs to rather than at the top of the
 * document, so there is no set of siblings to mark. Moving it to a portal is the
 * change that would allow that, and it is a larger one than this.
 */

/**
 * What the platform considers focusable, minus the things that only look it.
 *
 * `[tabindex="-1"]` is deliberately excluded: it means focusable by script and not by
 * Tab, which is exactly what the dialog container itself uses.
 */
const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'details > summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Whether the element can actually be reached, as against merely matching. */
function reachable(element: HTMLElement): boolean {
  if (element.hasAttribute('inert') || element.closest('[inert]')) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;
  // A box with no geometry is not on the page, whether it is `display: none`, inside a
  // closed `details`, or clipped to nothing.
  return element.getClientRects().length > 0;
}

/**
 * Everything focusable inside `root`, in the order Tab visits it.
 *
 * A shadow host's own content is tabbed where the host sits, so the walk descends into
 * a shadow root at the point it meets the host. That is an approximation of the real
 * order — it ignores `delegatesFocus` and slot reassignment, neither of which the
 * picker uses — and it is exact for the tree it is asked about.
 */
export function focusablesWithin(root: Element): HTMLElement[] {
  const found: HTMLElement[] = [];

  const walk = (node: Element): void => {
    for (const child of Array.from(node.children)) {
      if (child instanceof HTMLElement && child.matches(FOCUSABLE) && reachable(child)) {
        found.push(child);
      }
      const shadow = (child as HTMLElement).shadowRoot;
      if (shadow) walk(shadow as unknown as Element);
      walk(child);
    }
  };

  walk(root);
  return found;
}

/**
 * The element that really has focus, rather than the host that contains it.
 *
 * `document.activeElement` stops at a shadow host, so each root has to be asked in
 * turn until one has no further answer.
 */
export function deepestActiveElement(): Element | null {
  let element: Element | null = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}

/**
 * Handle a Tab so that it cannot leave `root`.
 *
 * Three cases, and the third is the one that was actually broken. Tab from the last
 * control wraps to the first, Shift+Tab from the first wraps to the last, and a Tab
 * pressed while focus is somewhere else entirely brings it in — which is what a
 * keyboard author meets on the first press after the overlay opens, if anything has
 * gone wrong with moving focus in.
 *
 * Returns whether it acted, so a caller can leave every other key alone.
 */
export function trapTab(root: Element, event: KeyboardEvent): boolean {
  if (event.key !== 'Tab') return false;

  const stops = focusablesWithin(root);
  if (stops.length === 0) return false;

  const first = stops[0];
  const last = stops[stops.length - 1];
  const active = deepestActiveElement();
  const index = active instanceof HTMLElement ? stops.indexOf(active) : -1;

  if (index === -1) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return true;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  return false;
}
