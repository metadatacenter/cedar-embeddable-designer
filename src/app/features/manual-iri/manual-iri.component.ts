import { Component, ElementRef, effect, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-manual-iri',
  imports: [FormsModule],
  template: `
    <div class="entry" (keydown.escape)="cancelled.emit(); $event.stopPropagation()">
      <label
        >IRI
        <input
          spellcheck="false"
          #control
          type="text"
          [disabled]="disabled()"
          [ngModel]="value()"
          (ngModelChange)="value.set($event); error.set(null)"
          [attr.aria-invalid]="!!error()"
          (keydown.enter)="submit(); $event.preventDefault()"
          placeholder="https://example.org/vocab/term"
        />
      </label>
      <button type="button" [disabled]="disabled()" (click)="submit()">{{ action() }}</button>
      <button type="button" (click)="cancelled.emit()">Cancel</button>
    </div>
    @if (error(); as message) {
      <p role="alert">{{ message }}</p>
    }
  `,
  styles: `
    @use '../../shared/control-style';
    :host {
      display: block;
      margin-top: 8px;
      font-size: var(--cedar-font-size-small);
    }
    .entry {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 8px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1 1 240px;
      min-width: 0;
    }
    input {
      @include control-style.compact-control;
      width: 100%;
    }
    button {
      @include control-style.compact-control;
      cursor: pointer;
      color: var(--cedar-color-primary, #117b89);
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    p {
      margin: 4px 0 0;
      color: #b42318;
    }
  `,
})
export class ManualIriComponent {
  readonly action = input('Add type');
  readonly existing = input<readonly string[]>([]);
  readonly disabled = input(false);
  readonly accepted = output<string>();
  readonly cancelled = output<void>();
  readonly value = signal('');
  readonly error = signal<string | null>(null);
  private readonly control = viewChild<ElementRef<HTMLInputElement>>('control');
  constructor() {
    effect(() => this.control()?.nativeElement.focus());
  }
  submit(): void {
    if (this.disabled()) return;
    const iri = this.value().trim();
    if (!iri) {
      this.error.set('An IRI is required.');
      return;
    }
    if (!/^[a-z][a-z0-9+.-]*:[^\s<>"{}|\\^`]+$/i.test(iri) || /%(?![0-9a-f]{2})/i.test(iri)) {
      this.error.set('Please enter a valid IRI.');
      return;
    }
    if (this.existing().includes(iri)) {
      this.error.set('This type has already been added.');
      return;
    }
    this.accepted.emit(iri);
  }
}
