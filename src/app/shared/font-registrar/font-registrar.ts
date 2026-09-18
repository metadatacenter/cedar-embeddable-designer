import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Puts the designer's embedded fonts into the document's font set.
 *
 * Browsers do not register `@font-face` declared inside a shadow root, so the one
 * stylesheet that carries font faces cannot be encapsulated with the rest. This
 * is the only unencapsulated component here, and its stylesheet holds no
 * selectors — only the CEDAR-namespaced faces — so nothing of the host page can
 * be reached by it. CEE and `cedar-embeddable-term-picker` arrived at the same arrangement
 * for the same reason.
 *
 * The faces are embedded rather than fetched. A host page is not obliged to load
 * anything for the designer, and a component that renders in a different typeface
 * depending on whether a font request succeeded is not one typeface.
 *
 * That makes this the largest stylesheet in the build by a wide margin: three embedded
 * Roboto weights from the design tokens' `fonts/` partials, about 184 kB compiled, and no
 * selectors at all. `angular.json`'s `anyComponentStyle` error is set for exactly that and
 * carries no warning band, because the size is a property of the decision above rather
 * than something a change here would drift into. Dropping a weight or fetching the faces
 * is what would move it; the term picker carries the same threshold for the same
 * stylesheet. Total shipped bytes stay gated by `scripts/check-bundle-size.mjs`.
 */
@Component({
  selector: 'ced-font-registrar',
  template: '',
  styleUrl: './font-registrar.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FontRegistrar {}
