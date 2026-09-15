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

@Component({
  selector: 'app-property-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="property">
      <span class="iri" [class.placeholder]="!iri()">{{ iri() || 'Choose a property IRI' }}</span>
      @if (available && baseUrl()) {
        <button #trigger type="button" [disabled]="disabled()" (click)="open()" aria-label="Edit property IRI">
          Edit
        </button>
      }
    </div>
    @if (!available || !baseUrl()) {
      <p role="status" class="unavailable">
        Property selection needs the term picker and a configured terminologyBaseUrl.
      </p>
    }
    @if (opened()) {
      <div class="overlay">
        <div
          #dialog
          role="dialog"
          aria-modal="true"
          aria-label="Choose property IRI"
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
      font-size: 12px;
    }
    .unavailable {
      margin: 3px 0 0;
      font-size: 12px;
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
  readonly available = termPickerAvailable();
  readonly opened = signal(false);
  readonly error = signal<string | null>(null);
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  constructor() {
    effect(() => this.dialog()?.nativeElement.focus());
  }
  open(): void {
    if (this.disabled()) return;
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
    const selected = Array.isArray(constraints) && constraints.length === 1 ? constraints[0] : null;
    if (
      selected?.sourceType !== 'ontology-property' ||
      typeof selected.sourceId !== 'string' ||
      !/^[a-z][a-z0-9+.-]*:\S+$/i.test(selected.sourceId)
    ) {
      this.error.set('Select one property before choosing Done.');
      return;
    }
    this.propertySelected.emit(selected.sourceId);
    this.close();
  }
}
