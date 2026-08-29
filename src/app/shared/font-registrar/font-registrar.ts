import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Puts the designer's embedded fonts into the document's font set.
 *
 * Browsers do not register `@font-face` declared inside a shadow root, so the one
 * stylesheet that carries font faces cannot be encapsulated with the rest. This
 * is the only unencapsulated component here, and its stylesheet holds no
 * selectors — only the CEDAR-namespaced faces — so nothing of the host page can
 * be reached by it. CEE and `cedar-term-picker` arrived at the same arrangement
 * for the same reason.
 *
 * The faces are embedded rather than fetched. A host page is not obliged to load
 * anything for the designer, and a component that renders in a different typeface
 * depending on whether a font request succeeded is not one typeface.
 */
@Component({
  selector: 'ced-font-registrar',
  template: '',
  styleUrl: './font-registrar.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FontRegistrar {}
