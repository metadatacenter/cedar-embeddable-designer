import { DestroyRef, Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { TemplateService } from '../core/services/template.service';

/** Validation-summary targets share focus handling; only name controls own deferred name validation. */
@Directive({
  selector: 'input[appArtifactName], textarea[appArtifactName]',
  host: { '(focus)': 'onFocus()', '(blur)': 'onBlur($event)' },
})
export class ArtifactNameDirective {
  readonly appArtifactName = input.required<number>();
  readonly artifactSetting = input('name');
  private readonly service = inject(TemplateService);
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private cancelPendingTouch?: () => void;
  private stopTrackingPointer?: () => void;
  private pointerPressed = false;
  onFocus(): void {
    if (this.artifactSetting() !== 'name') return;
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
  onBlur(event: Event): void {
    if (this.artifactSetting() !== 'name') return;
    this.cancelPendingTouch?.();
    // Non-focusable header space has no relatedTarget in WebKit. Track the
    // press while the name is focused so that click receives the same protection.
    const pointerPressed = this.pointerPressed;
    this.stopTrackingPointer?.();
    const id = this.appArtifactName();
    const touch = () => this.service.touchName(id);
    const relatedTarget = event instanceof FocusEvent ? event.relatedTarget : null;
    if (!pointerPressed && (!(relatedTarget instanceof Element) || !relatedTarget.matches(':active'))) {
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
      if (this.artifactSetting() === 'name' && this.service.nameFocusRequest() === this.appArtifactName()) {
        this.element.nativeElement.focus({ preventScroll: true });
        this.service.nameFocusRequest.set(null);
      }
      const issue = this.service.validationTarget();
      if (
        issue &&
        issue !== focused &&
        issue.setting === this.artifactSetting() &&
        issue.nodeId === this.appArtifactName()
      ) {
        focused = issue;
        if (this.service.access.readOnly()) {
          const card = this.element.nativeElement.closest<HTMLElement>('app-field-card, .template-header-card');
          card?.setAttribute('tabindex', '-1');
          card?.focus();
        } else {
          this.element.nativeElement.focus({ preventScroll: true });
        }
      }
    });
  }
}
