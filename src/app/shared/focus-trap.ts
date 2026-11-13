/**
 * Keeping the keyboard inside a modal, across shadow boundaries.
 *
 * The usual focus trap collects `querySelectorAll` of a focusable selector and wraps
 * at the ends. That finds nothing useful here: the designer opens the term picker in
 * an overlay, and everything an author would tab to is inside
 * `<cedar-embeddable-term-picker>`'s own shadow root, where a light-DOM query cannot reach.
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
  if (element.matches(':disabled')) return false;
  if (element.hasAttribute('tabindex') && element.tabIndex < 0) return false;
  if (getComputedStyle(element).visibility !== 'visible') return false;
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
      // Prune before crossing a shadow boundary: closest() inside it cannot see an inert host.
      if (child.hasAttribute('inert') || child.getAttribute('aria-hidden') === 'true') continue;
      if (child instanceof HTMLElement && child.matches(FOCUSABLE) && reachable(child)) {
        found.push(child);
      }
      const shadow = (child as HTMLElement).shadowRoot;
      if (shadow) walk(shadow as unknown as Element);
      walk(child);
    }
  };

  walk(root);
  // A native radio group contributes one Tab stop. Arrow keys still choose within the group.
  const radios = found.filter(
    (element): element is HTMLInputElement =>
      element instanceof HTMLInputElement && element.type === 'radio' && !!element.name,
  );
  return found.filter((element) => {
    if (!radios.includes(element as HTMLInputElement)) return true;
    const radio = element as HTMLInputElement;
    const group = radios.filter(
      (other) => other.name === radio.name && other.form === radio.form && other.getRootNode() === radio.getRootNode(),
    );
    return radio === (group.find((other) => other.checked) ?? group[0]);
  });
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

/** Whether a focused scroll container contains a control across nested shadow roots. */
function containsAcrossRoots(root: Element, element: Element): boolean {
  let node: Node | null = element;
  while (node && node !== root) node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null);
  return node === root;
}

/**
 * Move Tab explicitly, including through nested shadow roots. Wrapping only at the first and last
 * buttons lets Safari's default Tab setting skip those buttons and escape onto the covered page.
 * An inner widget that has already handled the key keeps its own navigation.
 */
export function trapTab(root: Element, event: KeyboardEvent): boolean {
  if (event.key !== 'Tab' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.isComposing)
    return false;

  const stops = focusablesWithin(root);
  event.preventDefault();
  if (stops.length === 0) {
    // An empty/loading modal still keeps focus until Escape closes it.
    if (root instanceof HTMLElement) root.focus();
    return true;
  }

  const active = deepestActiveElement();
  const index = active instanceof HTMLElement ? stops.indexOf(active) : -1;
  let next: number;
  if (index >= 0) next = index + (event.shiftKey ? -1 : 1);
  else {
    // Firefox can focus a scroll container without tabindex. Continue into its controls, or
    // back to the control before them, instead of restarting at the top of the modal.
    const child = active && active !== root ? stops.findIndex((stop) => containsAcrossRoots(active, stop)) : -1;
    next = child >= 0 ? child - Number(event.shiftKey) : event.shiftKey ? stops.length - 1 : 0;
  }
  stops[(next + stops.length) % stops.length].focus();
  return true;
}
