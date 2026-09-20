import { ManualIriComponent } from '../manual-iri/manual-iri.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  effect,
  inject,
  input,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import { ContainerDraft } from '../../core/model/container-draft';
import { containerArtifactMetadata } from '../../core/model/cedar-template';
import { ControlledTermSet } from '../../core/models/types';
import { TemplateService } from '../../core/services/template.service';
import { TerminologyService } from '../../core/services/terminology.service';
import { termPickerAvailable } from '../../core/model/term-picker';
import { trapTab } from '../../shared/focus-trap';

@Component({
  selector: 'app-types-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [IconComponent, ManualIriComponent],
  template: `
    <div class="property">
      <div class="type-list">
        @for (iri of types(); track iri) {
          <div class="type-row">
            <span class="iri">{{ iri }}</span>
            <button
              type="button"
              class="remove"
              [disabled]="disabled()"
              [attr.aria-label]="'Remove type ' + iri"
              (click)="remove(iri)"
            >
              <app-icon key="trash" className="w-4 h-4" />
            </button>
          </div>
        } @empty {
          <span class="placeholder">No types selected.</span>
        }
      </div>
      @if (available && baseUrl()) {
        <button #trigger type="button" [disabled]="disabled()" (click)="open()" aria-label="Add types">
          Add types
        </button>
      }
      <button #manualTrigger type="button" [disabled]="disabled()" (click)="manualOpened.set(!manualOpened())">
        Enter IRI manually
      </button>
    </div>
    @if (manualOpened()) {
      <app-manual-iri
        [disabled]="disabled()"
        [existing]="types()"
        action="Add type"
        (accepted)="acceptManual($event)"
        (cancelled)="closeManual()"
      />
    }
    @if (!available || !baseUrl()) {
      <p role="status" class="unavailable">Vocabulary search is unavailable. You can enter an IRI manually.</p>
    }
    @if (opened()) {
      <div class="overlay">
        <div
          #dialog
          role="dialog"
          aria-modal="true"
          aria-label="Add types"
          tabindex="-1"
          (keydown)="keydown($event)"
          class="dialog"
        >
          @if (error()) {
            <p role="alert">{{ error() }}</p>
          }
          <cedar-embeddable-term-picker
            [termTypes]="['class']"
            [constraintSet]="emptySelection"
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
    .type-list {
      flex: 1;
      min-width: 0;
    }
    .type-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .type-row + .type-row {
      margin-top: 4px;
    }
    .remove {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      color: black;
      text-decoration: none;
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
export class TypesPickerComponent {
  readonly container = input.required<ContainerDraft>();
  readonly service = inject(TemplateService);
  readonly types = computed(() => [
    ...new Set(
      this.container().metadata?.instanceTypes ??
        (this.container().metadata?.instanceType ? [this.container().metadata!.instanceType!] : []),
    ),
  ]);
  readonly emptySelection: ControlledTermSet = { constraints: [], actions: [] };
  readonly disabled = input(false);
  readonly baseUrl = inject(TerminologyService).baseUrl;
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
    this.saveTypes([...new Set([...this.types(), iri])]);
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
  remove(iri: string): void {
    if (this.disabled()) return;
    this.saveTypes(this.types().filter((type) => type !== iri));
  }
  select(event: Event): void {
    if (this.disabled() || !this.opened()) return;
    const set = (event as CustomEvent<ControlledTermSet>).detail;
    if (
      !Array.isArray(set?.constraints) ||
      set.constraints.some(
        (c) =>
          c.sourceType !== 'ontology-term' ||
          (c.termType && c.termType !== 'OntologyClass') ||
          typeof c.sourceId !== 'string' ||
          !/^[a-z][a-z0-9+.-]*:\S+$/i.test(c.sourceId),
      )
    ) {
      this.error.set('Choose classes only.');
      return;
    }
    if (set.constraints.length) {
      this.saveTypes([...new Set([...this.types(), ...set.constraints.map((c) => c.sourceId!)])]);
    }
    this.close();
  }
  private saveTypes(types: string[]): void {
    const container = this.container();
    const metadata = container.metadata ?? {
      artifact: containerArtifactMetadata(container),
      language: null,
      annotations: undefined,
      instanceType: null,
      header: null,
      footer: null,
    };
    this.service.updateContainerDefinition(container.id, {
      metadata: {
        ...metadata,
        instanceType: types[0] ?? null,
        instanceTypes: types,
      },
    });
  }
}
