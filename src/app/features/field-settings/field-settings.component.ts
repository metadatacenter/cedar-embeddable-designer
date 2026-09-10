import { ChangeDetectionStrategy, Component, Input, OnChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Field } from '../../core/models/types';
import {
  accepts,
  descriptorOf,
  FieldParameter,
  fieldArtifactMetadata,
  NUMERIC_TYPES,
  temporalGranularities,
} from '../../core/model/cedar-template';
import { TemplateService } from '../../core/services/template.service';

@Component({
  selector: 'app-field-settings',
  imports: [FormsModule],
  templateUrl: './field-settings.component.html',
  styleUrl: './field-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldSettingsComponent implements OnChanges {
  @Input({ required: true }) field!: Field;
  readonly service = inject(TemplateService);
  schemaTitle = '';
  schemaDescription = '';
  get artifact() {
    return fieldArtifactMetadata(this.field);
  }
  preferredLabel = '';
  alternateLabels = '';
  schemaIdentifier = '';
  language = '';
  propertyIri = '';
  deploymentName = '';
  annotations: NonNullable<Field['annotations']> = [];
  displayLabel = '';
  displayDescription = '';
  hidden = false;
  continuePreviousLine = false;
  get dynamic(): boolean {
    return descriptorOf(this.field.type).deployment !== 'static';
  }
  /** Whether this field's type takes a parameter, so the panel offers its control. */
  accepts(parameter: FieldParameter): boolean {
    return accepts(this.field.type, parameter);
  }
  text: NonNullable<Field['textConstraints']> = { minLength: null, maxLength: null, regex: null };
  readonly numericTypes = NUMERIC_TYPES;
  numeric: NonNullable<Field['numeric']> = {
    type: 'xsd:decimal',
    min: null,
    max: null,
    decimalPlaces: null,
    unit: null,
  };
  temporal: NonNullable<Field['temporal']> = {
    type: 'xsd:date',
    granularity: 'day',
    timezoneEnabled: false,
    inputTimeFormat: null,
  };
  get granularities() {
    return temporalGranularities(this.temporal.type);
  }
  changeTemporalType(type: NonNullable<Field['temporal']>['type']): void {
    this.temporal.type = type;
    if (!this.granularities.includes(this.temporal.granularity))
      this.temporal.granularity = type === 'xsd:time' ? 'minute' : 'day';
  }
  width: number | null = null;
  height: number | null = null;
  min: number | null = null;
  max: number | null = null;
  error: string | null = null;
  get multiple(): boolean {
    return descriptorOf(this.field.type).deployment === 'alwaysMultiple' || this.field.allowMultiple;
  }
  ngOnChanges(): void {
    this.schemaTitle = this.artifact.title ?? '';
    this.schemaDescription = this.artifact.description ?? '';
    this.preferredLabel = this.field.preferredLabel ?? '';
    this.alternateLabels = this.field.alternateLabels?.join('\n') ?? '';
    this.schemaIdentifier = this.field.schemaIdentifier ?? '';
    this.language = this.field.language ?? '';
    this.propertyIri = this.field.propertyIri ?? '';
    this.deploymentName = this.field.deploymentName ?? this.field.name;
    this.annotations = this.field.annotations?.map((annotation) => ({ ...annotation })) ?? [];
    this.displayLabel = this.field.displayLabel ?? '';
    this.displayDescription = this.field.displayDescription ?? '';
    this.hidden = this.field.hidden ?? false;
    this.continuePreviousLine = this.field.continuePreviousLine ?? false;
    this.text = { ...(this.field.textConstraints ?? { minLength: null, maxLength: null, regex: null }) };
    this.numeric = {
      ...(this.field.numeric ?? { type: 'xsd:decimal', min: null, max: null, decimalPlaces: null, unit: null }),
    };
    this.temporal = {
      ...(this.field.temporal ?? {
        type: this.field.type === 'time' ? 'xsd:time' : 'xsd:date',
        granularity: this.field.type === 'time' ? 'minute' : 'day',
        timezoneEnabled: false,
        inputTimeFormat: null,
      }),
    };
    this.width = this.field.width ?? null;
    this.height = this.field.height ?? null;
    this.min = this.field.minItems ?? null;
    this.max = this.field.maxItems ?? null;
    this.error = null;
  }
  saveMetadata(): void {
    if (this.propertyIri && !/^[a-z][a-z0-9+.-]*:\S+$/i.test(this.propertyIri)) {
      this.error = 'The property IRI must be an absolute identifier.';
      return;
    }
    this.error = this.service.updateFieldSettings(this.field.id, {
      artifact: { ...this.artifact, title: this.schemaTitle || null, description: this.schemaDescription || null },
      preferredLabel: this.preferredLabel || undefined,
      alternateLabels: this.alternateLabels
        .split('\n')
        .map((label) => label.trim())
        .filter(Boolean),
      schemaIdentifier: this.schemaIdentifier || undefined,
      language: this.language || undefined,
      propertyIri: this.propertyIri || undefined,
      deploymentName: this.deploymentName || undefined,
      annotations: this.annotations.map((annotation) => ({ ...annotation })),
    });
  }
  addAnnotation(): void {
    this.annotations = [...this.annotations, { name: '', kind: 'literal', value: '' }];
  }
  removeAnnotation(index: number): void {
    this.annotations = this.annotations.filter((_, i) => i !== index);
  }
  saveMedia(): void {
    this.error = this.service.updateFieldSettings(this.field.id, { width: this.width, height: this.height });
  }
  saveTemporal(): void {
    this.error = this.service.updateFieldSettings(this.field.id, {
      temporal: { ...this.temporal },
      type: this.temporal.type === 'xsd:time' ? 'time' : 'date',
    });
  }
  saveNumeric(): void {
    this.error = this.service.updateFieldSettings(this.field.id, {
      numeric: { ...this.numeric, unit: this.numeric.unit || null },
    });
  }
  saveText(): void {
    this.error = this.service.updateFieldSettings(this.field.id, {
      textConstraints: { ...this.text, regex: this.text.regex || null },
    });
  }
  saveLayout(): void {
    this.error = this.service.updateFieldSettings(this.field.id, {
      displayLabel: this.displayLabel || undefined,
      displayDescription: this.displayDescription || undefined,
      hidden: this.hidden,
      continuePreviousLine: this.continuePreviousLine,
    });
  }
  saveBounds(): void {
    this.error = this.service.updateFieldSettings(this.field.id, { minItems: this.min, maxItems: this.max });
  }
}
