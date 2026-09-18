import { DesignerConfigService } from '../core/services/designer-config.service';
import {
  Component,
  DestroyRef,
  EnvironmentInjector,
  EventEmitter,
  Input,
  Output,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TemplateService } from '../core/services/template.service';
import { TerminologyService } from '../core/services/terminology.service';
import { PreferencesService } from '../core/services/preferences.service';
import { CedConfig, CedFieldType, CedValidationReport } from '../ced-public-api';
import { fieldToJson, readField } from '../core/model/cedar-template';
import { Field, PALETTE_FIELD_TYPES, FIELD_TYPES } from '../core/models/types';
import { FieldCardComponent } from '../features/field-card/field-card.component';
import { FontRegistrar } from '../shared/font-registrar/font-registrar';

/** The same field controls CED uses, with one field document and no repository policy. */
@Component({
  selector: 'app-cedar-embeddable-field-designer-element',
  imports: [FieldCardComponent, FontRegistrar],
  providers: [TemplateService, TerminologyService, PreferencesService, DesignerConfigService],
  encapsulation: ViewEncapsulation.ShadowDom,
  styleUrls: ['../../styles.css'],
  styles: [
    `
      :host {
        display: block;
        font-family: var(--font-sans);
        font-size: var(--text-base);
      }
      .field-editor {
        padding: var(--cedar-space-4);
      }
      .type-picker {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cedar-space-2);
      }
      fieldset {
        border: 0;
        padding: 0;
        margin: 0;
        min-width: 0;
      }
    `,
  ],
  template: `<ced-font-registrar />
    <section class="field-editor" aria-label="Field designer">
      @if (field(); as field) {
        @if (readOnly) {
          <p role="status">This field is read only.</p>
        }
        <fieldset [disabled]="readOnly" [attr.inert]="readOnly ? '' : null">
          <app-field-card [field]="field" [standalone]="true" />
        </fieldset>
      } @else {
        <h2>Choose a field type</h2>
        <div class="type-picker">
          @for (type of types; track type.key) {
            <button type="button" [disabled]="readOnly" (click)="newArtifact(type.key)">{{ type.label }}</button>
          }
        </div>
      }
    </section>`,
})
export class CedarEmbeddableFieldDesignerElementComponent {
  readonly service = inject(TemplateService);
  private readonly configuration = inject(DesignerConfigService);
  private readonly baseline = signal('');
  private readonly hostReadOnly = signal(false);
  readonly field = computed(() => this.service.fields()[0] as Field | undefined);
  readonly types = Object.entries(PALETTE_FIELD_TYPES).map(([key, value]) => ({
    key: key as CedFieldType,
    label: value.label,
  }));

  @Input() set config(value: CedConfig | null) {
    this.configuration.apply(value);
  }
  @Input() set readOnly(value: boolean) {
    this.hostReadOnly.set(value);
  }
  get readOnly(): boolean {
    return this.hostReadOnly() || !!this.field()?.publishedDefinition;
  }
  @Input() set artifact(source: object | string | null) {
    if (source !== null) this.loadArtifact(source);
  }
  @Input() readonly loadArtifact = (source: object | string): void => {
    // Parse before replacing anything: a failed load must preserve the author's work.
    const field = readField(typeof source === 'string' ? source : JSON.stringify(source));
    this.replace(field);
  };
  /** No argument opens the type chooser. A type starts a new, unnamed definition. */
  @Input() readonly newArtifact = (type?: CedFieldType): void => {
    if (type !== undefined && !Object.hasOwn(FIELD_TYPES, type)) throw new Error(`Unsupported field type: ${type}`);
    this.reset();
    if (type) {
      this.service.addField(type, 0);
      this.service.updateFieldName(this.service.fields()[0].id, '');
    }
    this.baseline.set(JSON.stringify(this.field() ?? null));
  };
  @Input() get currentArtifact(): object | null {
    const field = this.field();
    return field ? fieldToJson(field) : null;
  }
  @Input() get isDirty(): boolean {
    return (
      JSON.stringify(this.field() ?? null) !== this.baseline() ||
      this.validationReport.issues.some((issue) => issue.source === 'draft')
    );
  }
  @Input() get validationReport(): CedValidationReport {
    const report = structuredClone(this.service.validationReport());
    return { ...report, canSave: !!this.field() && !this.readOnly && report.canSave };
  }
  @Input() get canSave(): boolean {
    return this.validationReport.canSave;
  }
  @Input() readonly validate = (): CedValidationReport => this.validationReport;
  @Output() artifactChange = new EventEmitter<object>();
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() validationChange = new EventEmitter<CedValidationReport>();

  constructor() {
    this.service.fieldDocumentMode.set(true);
    this.service.preferences.update((p) => ({ ...p, showHelpText: true, showDefaultValue: true }));
    this.newArtifact();
    const injector = inject(EnvironmentInjector);
    const destroy = inject(DestroyRef);
    for (const callback of [
      () => this.dirtyChange.emit(this.isDirty),
      () => this.validationChange.emit(this.validationReport),
      () => {
        // Invalid drafts are reported through validation, never as a stale or fabricated artifact.
        if (this.field() && this.service.validationReport().canSave) {
          this.artifactChange.emit(this.currentArtifact!);
        }
      },
    ]) {
      const ref = effect(callback, { injector });
      destroy.onDestroy(() => ref.destroy());
    }
  }
  private reset(): void {
    this.service.resetTemplate('template', false);
    this.service.templateName.set('Field document');
  }
  private replace(field: Field): void {
    this.reset();
    this.service.fields.set([structuredClone(field)]);
    this.baseline.set(JSON.stringify(this.field()));
  }
}
