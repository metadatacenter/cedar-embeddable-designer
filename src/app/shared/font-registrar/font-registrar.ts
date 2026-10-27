import { ChangeDetectionStrategy, Component, CSP_NONCE, DOCUMENT, inject } from '@angular/core';
import { registerFontFaces } from '@org.metadatacenter/cedar-design-tokens/font-faces';

/**
 * Puts the designer's embedded fonts into the document's font set.
 *
 * Browsers do not register `@font-face` declared inside a shadow root, so the faces go into the
 * document's head, once for every CEDAR component on the page: CEE and
 * `cedar-embeddable-term-picker` register the same set the same way. Declared as the styles of an
 * unencapsulated component, as they were, Angular also copied them into every shadow root, where
 * nothing reads them.
 *
 * The faces are embedded rather than fetched. A host page is not obliged to load anything for the
 * designer, and a component that renders in a different typeface depending on whether a font
 * request succeeded is not one typeface. The shipped raw and gzip budgets gate the embedded bytes.
 */
@Component({
  selector: 'ced-font-registrar',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FontRegistrar {
  constructor() {
    registerFontFaces(inject(DOCUMENT), inject(CSP_NONCE, { optional: true }));
  }
}
