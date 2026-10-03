import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CedLanguageService } from '../../i18n/ced-language.service';

@Component({
  selector: 'app-manual-iri',
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="entry" (keydown.escape)="cancelled.emit(); $event.stopPropagation()">
      <label
        >{{ 'manualIri.label' | translate }}
        <input
          spellcheck="false"
          #control
          type="text"
          [disabled]="disabled()"
          [ngModel]="value()"
          (ngModelChange)="value.set($event); error.set(null)"
          [attr.aria-invalid]="!!message()"
          [attr.aria-describedby]="message() ? 'manual-iri-error' : null"
          (keydown.enter)="submit(); $event.preventDefault()"
          [placeholder]="example()"
        />
      </label>
      <button type="button" [disabled]="disabled() || !!problem()" (click)="submit()">
        {{ action() | translate }}
      </button>
      <button type="button" (click)="cancelled.emit()">{{ 'common.cancel' | translate }}</button>
    </div>
    @if (message(); as message) {
      <p id="manual-iri-error" role="alert">{{ message }}</p>
    }
  `,
  styles: `
    @use '@org.metadatacenter/cedar-design-tokens/authoring';
    @use '@org.metadatacenter/cedar-design-tokens/patterns';
    :host {
      display: block;
      margin-top: var(--cedar-space-2);
      font-size: var(--cedar-font-size);
    }
    .entry {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: var(--cedar-space-2);
    }
    label {
      display: flex;
      flex-direction: column;
      gap: var(--cedar-space-1);
      flex: 1 1 240px;
      min-width: 0;
      @include authoring.label-text;
    }
    input {
      @include authoring.compact-control;
      width: 100%;
      color: var(--cedar-text-primary);
      font-weight: var(--cedar-font-weight-regular);
    }
    button {
      @include authoring.compact-control;
      cursor: pointer;
      color: var(--cedar-color-primary);
    }
    button:disabled {
      opacity: var(--cedar-control-disabled-opacity);
      cursor: default;
    }
    // The shared field-error role, with the host's override of its colour as the designer's other
    // errors take it.
    p {
      @include patterns.field-error;
      color: var(--cedar-control-error, var(--cedar-status-error-text));
    }
  `,
})
export class ManualIriComponent {
  /** The translation key of the submit button's label. */
  readonly action = input('manualIri.addType');
  private readonly i18n = inject(CedLanguageService);
  readonly existing = input<readonly string[]>([]);
  readonly disabled = input(false);
  readonly accepted = output<string>();
  readonly cancelled = output<void>();
  /** An IRI of the kind being entered, shown as the placeholder and in the message for a malformed one. */
  readonly example = input('https://example.org/vocab/term');
  readonly value = signal('');
  /** Set by a submit with nothing entered; cleared by the next edit. */
  readonly error = signal<string | null>(null);
  /** What is wrong with the text entered so far, checked as it is typed. Nothing entered is not yet a problem. */
  readonly problem = computed(() => this.check(this.value().trim()));
  readonly message = computed(() => this.problem() ?? this.error());
  private readonly control = viewChild<ElementRef<HTMLInputElement>>('control');
  constructor() {
    effect(() => this.control()?.nativeElement.focus());
  }
  submit(): void {
    if (this.disabled() || this.problem()) return;
    const iri = this.value().trim();
    if (!iri) {
      this.error.set(this.i18n.t('manualIri.required'));
      return;
    }
    this.accepted.emit(iri);
  }
  private check(iri: string): string | null {
    if (!iri) return null;
    if (!/^[a-z][a-z0-9+.-]*:[^\s<>"{}|\\^`]+$/i.test(iri) || /%(?![0-9a-f]{2})/i.test(iri))
      return this.i18n.t('manualIri.invalid', { example: this.example() });
    if (this.existing().includes(iri)) return this.i18n.t('manualIri.duplicate');
    return null;
  }
}
