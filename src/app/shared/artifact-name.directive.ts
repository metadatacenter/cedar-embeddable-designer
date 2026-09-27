import { DestroyRef, Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { TemplateService } from '../core/services/template.service';

/** Validation-summary navigation targets the name in the header, outside settings. */
@Directive({ selector: 'input[appArtifactName]', host: { '(focus)': 'onFocus()', '(blur)': 'onBlur($event)' } })
export class ArtifactNameDirective {
  readonly appArtifactName = input.required<number>();
  private readonly service = inject(TemplateService);
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private cancelPendingTouch?: () => void;
  private stopTrackingPointer?: () => void;
  private pointerPressed = false;
  onFocus(): void {
    this.stopTrackingPointer?.();
    const document = this.element.nativeElement.ownerDocument;
    const press = () => (this.pointerPressed = true);
    const release = () => (this.pointerPressed = false);
    document.addEventListener('pointerdown', press, true);
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    this.stopTrackingPointer = () => {
      document.removeEventListener('pointerdown', press, true);
      document.removeEventListener('pointerup', release, true);
      document.removeEventListener('pointercancel', release, true);
      this.pointerPressed = false;
    };
  }
  onBlur(event: FocusEvent): void {
    this.cancelPendingTouch?.();
    // Non-focusable header space has no relatedTarget in WebKit. Track the
    // press while the name is focused so that click receives the same protection.
    const pointerPressed = this.pointerPressed;
    this.stopTrackingPointer?.();
    const id = this.appArtifactName();
    const touch = () => this.service.touchName(id);
    if (!pointerPressed && (!(event.relatedTarget instanceof Element) || !event.relatedTarget.matches(':active'))) {
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
    inject(DestroyRef).onDestroy(() => {
      this.cancelPendingTouch?.();
      this.stopTrackingPointer?.();
    });
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
