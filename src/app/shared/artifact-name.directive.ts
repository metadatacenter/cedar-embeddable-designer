import { DestroyRef, Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { TemplateService } from '../core/services/template.service';

/** Validation-summary navigation targets the name in the header, outside settings. */
@Directive({ selector: 'input[appArtifactName]', host: { '(blur)': 'onBlur($event)' } })
export class ArtifactNameDirective {
  readonly appArtifactName = input.required<number>();
  private readonly service = inject(TemplateService);
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private cancelPendingTouch?: () => void;
  onBlur(event: FocusEvent): void {
    this.cancelPendingTouch?.();
    const id = this.appArtifactName();
    const touch = () => this.service.touchName(id);
    if (!(event.relatedTarget instanceof Element) || !event.relatedTarget.matches(':active')) {
      touch();
      return;
    }
    // Pointer focus moves on press, before the click. Rendering an error now can
    // move the pressed control out from under the pointer and lose its click.
    // Keyboard/programmatic blur still validates immediately.
    const document = this.element.nativeElement.ownerDocument;
    const removeListeners = () => {
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
      document.removeEventListener('click', finish, true);
    };
    const finish = () => {
      removeListeners();
      const timer = setTimeout(() => {
        this.cancelPendingTouch = undefined;
        touch();
      });
      this.cancelPendingTouch = () => clearTimeout(timer);
    };
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', finish, true);
    // Touch can focus the control after pointerup, before its synthesized click.
    document.addEventListener('click', finish, true);
    this.cancelPendingTouch = removeListeners;
  }
  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancelPendingTouch?.());
    let focused: unknown;
    afterRenderEffect(() => {
      if (this.service.nameFocusRequest() === this.appArtifactName()) {
        this.element.nativeElement.focus({ preventScroll: true });
        this.service.nameFocusRequest.set(null);
      }
      const issue = this.service.validationTarget();
      if (issue && issue !== focused && issue.setting === 'name' && issue.nodeId === this.appArtifactName()) {
        focused = issue;
        this.element.nativeElement.focus({ preventScroll: true });
      }
    });
  }
}
