import { Directive, output } from '@angular/core';

/** Pointer shortcut for the adjacent, keyboard-accessible settings toggle. */
@Directive({
  selector: '[appHeaderToggle]',
  host: {
    '(click)': 'click($event)',
    '(pointerdown)': 'start($event)',
    '(pointermove)': 'move($event)',
    '(pointercancel)': 'cancel()',
  },
})
export class HeaderToggleDirective {
  readonly headerToggle = output<void>();
  private origin: { x: number; y: number } | null = null;
  private moved = false;
  private startedOnControl = false;

  start(event: PointerEvent): void {
    this.origin = { x: event.clientX, y: event.clientY };
    this.moved = false;
    this.startedOnControl = this.isControlEvent(event);
  }
  move(event: PointerEvent): void {
    if (this.origin && Math.hypot(event.clientX - this.origin.x, event.clientY - this.origin.y) > 5) {
      this.moved = true;
    }
  }
  cancel(): void {
    this.moved = true;
  }
  click(event: MouseEvent): void {
    // A release just outside an input is retargeted to its parent by the browser.
    // It still belongs to the input, not to the header's toggle shortcut.
    if (event.defaultPrevented || this.moved || this.startedOnControl || event.button !== 0) return;
    if (!this.isControlEvent(event)) this.headerToggle.emit();
  }
  private isControlEvent(event: Event): boolean {
    for (const node of event.composedPath()) {
      if (node === event.currentTarget) break;
      if (node instanceof HTMLLabelElement && node.control) return true;
      if (
        node instanceof Element &&
        node.matches(
          'input, textarea, select, button, a, [contenteditable], [role="button"], [role="checkbox"], [role="combobox"], [tabindex], .cdk-drag-handle',
        )
      )
        return true;
    }
    return false;
  }
}
