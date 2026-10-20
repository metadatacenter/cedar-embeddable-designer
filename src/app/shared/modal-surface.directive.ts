import { Directive, ElementRef, afterNextRender, inject, output } from '@angular/core';
import { trapTab } from './focus-trap';

/**
 * A settings dialog drawn as an overlay rather than a native dialog element, made to behave as one.
 *
 * It takes focus when it opens, so a keyboard author starts inside it rather than on the page
 * behind. Tab stays inside it, and Escape asks its owner to close it, which returns focus to the
 * control that opened it. The template itself declares the element's role, modality and negative
 * tab index, beside the surface the UI inventory registers.
 */
@Directive({
  selector: '[appModalSurface]',
  host: { '(keydown)': 'keydown($event)' },
})
export class ModalSurfaceDirective {
  readonly dismissed = output<void>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => this.element.nativeElement.focus());
  }

  keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      this.dismissed.emit();
    } else trapTab(this.element.nativeElement, event);
  }
}
