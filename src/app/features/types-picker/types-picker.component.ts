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
import { containerArtifactMetadata, fieldToJson } from '../../core/model/cedar-template';
import { ControlledTermSet } from '../../core/models/types';
import { TemplateService } from '../../core/services/template.service';
import { TerminologyService } from '../../core/services/terminology.service';
import { termPickerAvailable } from '../../core/model/term-picker';
import { trapTab } from '../../shared/focus-trap';

@Component({
  selector: 'app-types-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="property">
      @if (selections().constraints.length && summaryAvailable) {
        <cedar-embeddable-field [config]="config" [fieldObject]="summary()" [value]="value" />
      } @else {
        <span class="iri">{{ selections().constraints.length ? labels() : 'Click on Edit to choose types' }}</span>
      }
      @if (available && baseUrl()) {
        <button #trigger type="button" [disabled]="disabled()" (click)="open()" aria-label="Edit types">Edit</button>
      }
    </div>
    @if (!available || !baseUrl()) {
      <p role="status" class="unavailable">Type selection needs the term picker and a configured terminologyBaseUrl.</p>
    }
    @if (opened()) {
      <div class="overlay">
        <div
          #dialog
          role="dialog"
          aria-modal="true"
          aria-label="Choose types"
          tabindex="-1"
          (keydown)="keydown($event)"
          class="dialog"
        >
          @if (error()) {
            <p role="alert">{{ error() }}</p>
          }
          <cedar-embeddable-term-picker
            [termTypes]="['class']"
            [constraintSet]="selections()"
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
    cedar-embeddable-field {
      display: block;
      flex: 1;
      min-width: 0;
      --cedar-control-font-size: 12px;
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
  readonly selections = computed<ControlledTermSet>(
    () =>
      this.container().metadata?.typeSelections ?? {
        constraints: (
          this.container().metadata?.instanceTypes ??
          (this.container().metadata?.instanceType ? [this.container().metadata!.instanceType!] : [])
        ).map((iri) => ({
          sourceType: 'ontology-term',
          termType: 'OntologyClass',
          sourceId: iri,
          sourceName: iri,
          ontologyId: 'Types',
        })),
        actions: [],
      },
  );
  readonly summary = computed(() =>
    fieldToJson({
      id: 0,
      name: 'Types',
      type: 'controlledTerms',
      options: [],
      status: 'optional',
      allowMultiple: true,
      defaultValue: { kind: 'none' },
      controlledTermConstraints: this.selections(),
    }),
  );
  readonly summaryAvailable = customElements.get('cedar-embeddable-field') !== undefined;
  readonly config = { ...this.service.fieldEditorConfig(), readOnlyMode: true };
  readonly value = { kind: 'none' };
  readonly disabled = input(false);
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
  labels(): string {
    return this.selections()
      .constraints.map((c) => ('sourceName' in c ? c.sourceName : '') || c.sourceId)
      .join(', ');
  }
  select(event: Event): void {
    if (!this.opened()) return;
    const set = (event as CustomEvent<ControlledTermSet>).detail;
    if (
      !Array.isArray(set?.constraints) ||
      set.constraints.some((c) => c.sourceType !== 'ontology-term' || !c.sourceId)
    ) {
      this.error.set('Choose classes only.');
      return;
    }
    const container = this.container();
    const metadata = container.metadata ?? {
      artifact: containerArtifactMetadata(container),
      language: null,
      annotations: undefined,
      instanceType: null,
      header: null,
      footer: null,
    };
    const types = [
      ...new Set(set.constraints.map((c) => c.sourceId).filter((iri): iri is string => typeof iri === 'string')),
    ];
    this.service.updateContainerDefinition(container.id, {
      metadata: {
        ...metadata,
        instanceType: types[0] ?? null,
        instanceTypes: types,
        typeSelections: structuredClone(set),
      },
    });
    this.close();
  }
}
