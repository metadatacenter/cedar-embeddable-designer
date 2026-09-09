import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  Input,
  inject,
  signal,
  ChangeDetectionStrategy,
  OnChanges,
} from '@angular/core';
import { TemplateService } from '../../core/services/template.service';
import { Field, ControlledTermSet } from '../../core/models/types';
import { TerminologyService } from '../../core/services/terminology.service';
import { termPickerAvailable } from '../../core/model/term-picker';
import { fieldToJson } from '../../core/model/cedar-template';

@Component({
  selector: 'app-controlled-term-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './controlled-term-config.component.html',
  styleUrl: './controlled-term-config.component.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ControlledTermConfigComponent implements OnChanges {
  readonly service = inject(TemplateService);
  private readonly terminology = inject(TerminologyService);
  readonly terminologyBaseUrl = this.terminology.baseUrl;
  readonly pickerAvailable = termPickerAvailable();
  readonly pickerOpen = signal(false);
  readonly checking = signal(false);
  readonly error = signal<string | null>(null);
  readonly invalidDefault = signal(false);
  private pending: { field: Field; set: ControlledTermSet } | null = null;
  @Input() field!: Field;
  readonly empty: ControlledTermSet = { constraints: [], actions: [] };

  readonly summaryAvailable = customElements.get('cedar-embeddable-field') !== undefined;
  readonly summaryConfig = { ...this.service.fieldEditorConfig(), readOnlyMode: true };
  readonly summaryValue = { kind: 'none' };
  summaryArtifact: ReturnType<typeof fieldToJson> | null = null;

  ngOnChanges(): void {
    this.summaryArtifact = fieldToJson({ ...this.field, defaultValue: { kind: 'none' } });
  }

  openPicker(): void {
    this.error.set(null);
    this.invalidDefault.set(false);
    this.pending = null;
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.draftChanged();
    this.pickerOpen.set(false);
  }

  draftChanged(): void {
    this.pending = null;
    this.checking.set(false);
    this.invalidDefault.set(false);
    this.error.set(null);
  }

  async applyPicked(event: Event): Promise<void> {
    if (this.checking()) return;
    const set = structuredClone((event as CustomEvent<ControlledTermSet>).detail);
    const field = this.field;
    this.error.set(null);
    this.invalidDefault.set(false);
    const attempt = { field, set };
    this.pending = attempt;
    this.checking.set(true);
    try {
      const artifact = fieldToJson({ ...field, controlledTermConstraints: set, defaultValue: { kind: 'none' } });
      if (
        field.defaultValue.kind === 'iri' &&
        JSON.stringify(set) !== JSON.stringify(field.controlledTermConstraints)
      ) {
        const allowed =
          set.constraints.length > 0 &&
          (await this.terminology.allowsDefault(
            artifact,
            field.defaultValue.iri,
            field.defaultValue.label ?? field.defaultValue.iri,
          ));
        if (this.pending !== attempt || this.field !== field) return;
        if (!allowed) {
          this.invalidDefault.set(true);
          this.error.set(
            'The existing default is not permitted by these constraints. Clear it and apply, or revise the constraints.',
          );
          return;
        }
      }
      if (this.pending !== attempt || this.field !== field) return;
      this.service.updateControlledTermConstraints(field.id, set);
      this.closePicker();
    } catch (error) {
      if (this.pending !== attempt || this.field !== field) return;
      this.error.set(error instanceof Error ? error.message : 'Could not apply constraints.');
    } finally {
      if (this.pending === attempt) this.checking.set(false);
    }
  }

  clearDefaultAndApply(): void {
    if (!this.invalidDefault() || !this.pending || this.field !== this.pending.field) return;
    this.service.updateDefaultValue(this.field.id, { kind: 'none' });
    this.service.updateControlledTermConstraints(this.field.id, this.pending.set);
    this.closePicker();
  }
}
