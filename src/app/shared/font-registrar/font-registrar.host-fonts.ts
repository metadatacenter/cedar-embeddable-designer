import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * The font registrar of the host-fonts bundle, which registers no faces.
 *
 * The `host-fonts` build configuration replaces `font-registrar.ts` with this file. A host that
 * registers CEDAR Roboto 400 and 500 for its whole document, as the design tokens' `fonts.css`
 * does, loads that bundle and pays for the faces once, however many components share its page.
 * Without the host's faces the designer's text falls back to the rest of the shared font stack.
 */
@Component({
  selector: 'ced-font-registrar',
  template: '',
  styleUrl: './font-registrar.host-fonts.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FontRegistrar {}
