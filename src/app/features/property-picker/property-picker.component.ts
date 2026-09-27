import { ManualIriComponent } from '../manual-iri/manual-iri.component';
import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TerminologyService } from '../../core/services/terminology.service';
import { termPickerAvailable } from '../../core/model/term-picker';
import { trapTab } from '../../shared/focus-trap';
import { TranslatePipe } from '@ngx-translate/core';
import { CedLanguageService } from '../../i18n/ced-language.service';

@Component({
  selector: 'app-property-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ManualIriComponent, TranslatePipe],
  template: `
    <div class="property">
      <span class="iri" [class.placeholder]="!iri()">{{ iri() || ('propertyPicker.placeholder' | translate) }}</span>
      @if (available && baseUrl()) {
        <button
          #trigger
          type="button"
          [disabled]="disabled()"
          (click)="open()"
          [attr.aria-label]="(iri() ? 'propertyPicker.replaceLabel' : 'propertyPicker.chooseLabel') | translate"
        >
          {{ (iri() ? 'propertyPicker.replace' : 'propertyPicker.choose') | translate }}
        </button>
      }
      <button #manualTrigger type="button" [disabled]="disabled()" (click)="manualOpened.set(!manualOpened())">
        {{ 'manualIri.open' | translate }}
      </button>
    </div>
    @if (manualOpened()) {
      <app-manual-iri
        [disabled]="disabled()"
        action="manualIri.addProperty"
        (accepted)="acceptManual($event)"
        (cancelled)="closeManual()"
      />
    }
    @if (!available || !baseUrl()) {
      <p role="status" class="unavailable">{{ 'manualIri.searchUnavailable' | translate }}</p>
    }
    @if (opened()) {
      <div class="overlay">
        <div
          #dialog
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="'propertyPicker.chooseLabel' | translate"
          tabindex="-1"
          (keydown)="keydown($event)"
          class="dialog"
        >
          @if (error()) {
            <p role="alert">{{ error() }}</p>
          }
          <cedar-embeddable-term-picker
            [termTypes]="['property']"
            [maximumTerms]="1"
            [selectionMode]="'constraints'"
            [terminologyBaseUrl]="baseUrl()"
            [language]="language()"
            (constraintsSelected)="select($event)"
            (cancelled)="close()"
          ></cedar-embeddable-term-picker>
        </div>
      </div>
    }
  `,
  styles: `
    .property {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: var(--cedar-font-size);
    }
    .unavailable {
      margin: 3px 0 0;
      font-size: var(--cedar-font-size);
      overflow-wrap: anywhere;
    }
    .iri {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
      padding: 3px 6px;
      border: 1px solid #ccc;
      border-radius: 2px;
      color: #4b5563;
    }
    button {
      flex: 0 0 auto;
      padding: 0;
      border: 0;
      background: none;
      color: #317c85;
      font: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
    }
    .placeholder {
      color: #777;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 50;
      background: #0006;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .dialog {
      background: white;
      border-radius: 0.5rem;
      width: 100%;
      max-width: 64rem;
      max-height: 90vh;
      overflow: auto;
    }
    [role='alert'] {
      padding: 0.75rem;
      color: #991b1b;
    }
  `,
})
export class PropertyPickerComponent {
  readonly iri = input<string>();
  readonly disabled = input(false);
  readonly propertySelected = output<string>();
  readonly baseUrl = inject(TerminologyService).baseUrl;
  private readonly i18n = inject(CedLanguageService);
  /** The designer's language, which the term picker renders in. */
  readonly language = this.i18n.language;
  readonly available = termPickerAvailable();
  readonly opened = signal(false);
  readonly manualOpened = signal(false);
  private readonly manualTrigger = viewChild<ElementRef<HTMLButtonElement>>('manualTrigger');
  closeManual(): void {
    this.manualOpened.set(false);
    this.manualTrigger()?.nativeElement.focus();
  }
  acceptManual(iri: string): void {
    if (this.disabled()) return;
    this.propertySelected.emit(iri);
    this.closeManual();
  }
  readonly error = signal<string | null>(null);
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  constructor() {
    effect(() => this.dialog()?.nativeElement.focus());
  }
  open(): void {
    if (this.disabled()) return;
    this.manualOpened.set(false);
    this.error.set(null);
    this.opened.set(true);
  }
  close(): void {
    this.opened.set(false);
    this.trigger()?.nativeElement.focus();
  }
  keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (this.dialog()) trapTab(this.dialog()!.nativeElement, event);
  }
  select(event: Event): void {
    if (this.disabled() || !this.opened()) return;
    const constraints = (event as CustomEvent).detail?.constraints;
    if (Array.isArray(constraints) && constraints.length === 0) {
      this.close();
      return;
    }
    const selected = Array.isArray(constraints) && constraints.length === 1 ? constraints[0] : null;
    if (
      selected?.sourceType !== 'ontology-property' ||
      typeof selected.sourceId !== 'string' ||
      !/^[a-z][a-z0-9+.-]*:\S+$/i.test(selected.sourceId)
    ) {
      this.error.set(this.i18n.t('propertyPicker.selectOne'));
      return;
    }
    this.propertySelected.emit(selected.sourceId);
    this.close();
  }
}
