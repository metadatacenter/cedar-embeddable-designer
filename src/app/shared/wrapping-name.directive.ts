import { afterEveryRender, DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/** Show the complete name without changing its single-line value or Enter behavior. */
@Directive({ selector: 'textarea[appWrappingName]', host: { 'aria-multiline': 'false' } })
export class WrappingNameDirective {
  constructor() {
    const element = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;
    let previous = '';
    const resize = () => {
      const width = element.getBoundingClientRect().width;
      if (!width) return;
      const key = `${width}:${element.value}`;
      if (key === previous) return;
      previous = key;
      // Native content sizing handles this where supported. Older engines use the
      // textarea's row count; typography, padding and borders stay in token CSS.
      if (CSS.supports('field-sizing', 'content')) return;
      element.rows = 1;
      const style = getComputedStyle(element);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const line = parseFloat(style.lineHeight);
      if (line > 0) element.rows = Math.max(1, Math.ceil((element.scrollHeight - padding) / line));
    };
    const input = () => {
      // Input elements discard line breaks, including those pasted into a name.
      const start = element.selectionStart;
      const before = element.value.slice(0, start).replace(/[\r\n]/g, '');
      const value = element.value.replace(/[\r\n]/g, '');
      if (value !== element.value) {
        element.value = value;
        element.setSelectionRange(before.length, before.length);
      }
      resize();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.isComposing) event.preventDefault();
    };
    // Capture runs before Angular's value accessor reads the edited value.
    element.addEventListener('input', input, true);
    element.addEventListener('keydown', keydown);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    observer?.observe(element);
    afterEveryRender(resize);
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      element.removeEventListener('input', input, true);
      element.removeEventListener('keydown', keydown);
    });
  }
}
