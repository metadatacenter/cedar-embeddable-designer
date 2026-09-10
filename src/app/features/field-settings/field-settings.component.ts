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
  @Input() hasValues = false;
  @Input() hasPlacement = false;
  expanded = false;
  activeTab = 'Display';
  get tabs(): string[] {
    return [
      ...(this.hasValues ? ['Values'] : []),
      ...(this.multiple ? ['Occurrences'] : []),
      'Display',
      ...(this.hasPlacement ? ['Placement'] : []),
      ...(this.accepts('textLength') ? ['Text constraints'] : []),
      ...(this.accepts('numericBounds') ? ['Numeric constraints'] : []),
      ...(this.accepts('temporalPrecision') ? ['Temporal settings'] : []),
      ...(this.accepts('mediaDimensions') ? ['Media size'] : []),
      'Field metadata',
      'Field identity',
    ];
  }
  get selectedTab(): string {
    return this.tabs.includes(this.activeTab) ? this.activeTab : this.tabs[0];
  }
  selectTab(tab: string): void {
    this.activeTab = tab;
  }
  onTabKey(event: KeyboardEvent, index: number): void {
    const tabs = this.tabs;
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    this.selectTab(tabs[next]);
    const parent = (event.currentTarget as HTMLElement).parentElement;
    parent?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
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
  /**
   * What each box held when it was last read from the field.
   *
   * The panel's boxes are a draft: an author types, then presses Apply. `field` is an
   * input that changes identity on *any* template edit, so reloading every box from it
   * on every change threw away whatever was half-typed — and it was not only a
   * theoretical race. It made this suite disagree with itself by a dozen tests a run:
   * an Apply arriving from the previous step reloaded the box the current step had just
   * cleared, and Apply then saved the value that had been put back.
   *
   * So a box adopts an incoming value only where the author has not touched it, which
   * is what this records. An untouched box still follows the field, so a change made
   * elsewhere is still shown.
   */
  private loaded: Record<string, unknown> = {};
  private loadedFieldId: number | null = null;

  private adopt<T>(key: string, current: T, incoming: T): T {
    const untouched = JSON.stringify(current) === JSON.stringify(this.loaded[key]);
    this.loaded[key] = incoming;
    return untouched ? incoming : current;
  }

  ngOnChanges(): void {
    const first = this.loadedFieldId !== this.field.id;
    if (first) {
      // A different field: the previous draft belonged to the previous card.
      this.loaded = {};
      this.loadedFieldId = this.field.id;
    }
    const take = <T>(key: string, current: T, incoming: T): T =>
      first ? incoming : this.adopt(key, current, incoming);
    if (first) this.loaded = {};

    this.schemaTitle = take('schemaTitle', this.schemaTitle, this.artifact.title ?? '');
    this.schemaDescription = take('schemaDescription', this.schemaDescription, this.artifact.description ?? '');
    this.preferredLabel = take('preferredLabel', this.preferredLabel, this.field.preferredLabel ?? '');
    this.alternateLabels = take('alternateLabels', this.alternateLabels, this.field.alternateLabels?.join('\n') ?? '');
    this.schemaIdentifier = take('schemaIdentifier', this.schemaIdentifier, this.field.schemaIdentifier ?? '');
    this.language = take('language', this.language, this.field.language ?? '');
    this.propertyIri = take('propertyIri', this.propertyIri, this.field.propertyIri ?? '');
    this.deploymentName = take('deploymentName', this.deploymentName, this.field.deploymentName ?? this.field.name);
    this.annotations = take(
      'annotations',
      this.annotations,
      this.field.annotations?.map((annotation) => ({ ...annotation })) ?? [],
    );
    this.displayLabel = take('displayLabel', this.displayLabel, this.field.displayLabel ?? '');
    this.displayDescription = take('displayDescription', this.displayDescription, this.field.displayDescription ?? '');
    this.hidden = take('hidden', this.hidden, this.field.hidden ?? false);
    this.continuePreviousLine = take(
      'continuePreviousLine',
      this.continuePreviousLine,
      this.field.continuePreviousLine ?? false,
    );
    this.text = take('text', this.text, {
      ...(this.field.textConstraints ?? { minLength: null, maxLength: null, regex: null }),
    });
    this.numeric = take('numeric', this.numeric, {
      ...(this.field.numeric ?? { type: 'xsd:decimal', min: null, max: null, decimalPlaces: null, unit: null }),
    });
    this.temporal = take('temporal', this.temporal, {
      ...(this.field.temporal ?? {
        type: this.field.type === 'time' ? 'xsd:time' : 'xsd:date',
        granularity: this.field.type === 'time' ? 'minute' : 'day',
        timezoneEnabled: false,
        inputTimeFormat: null,
      }),
    });
    this.width = take('width', this.width, this.field.width ?? null);
    this.height = take('height', this.height, this.field.height ?? null);
    this.min = take('min', this.min, this.field.minItems ?? null);
    this.max = take('max', this.max, this.field.maxItems ?? null);
    this.error = null;
  }

  saveMetadata(): void {
    if (this.dynamic && this.propertyIri && !/^[a-z][a-z0-9+.-]*:\S+$/i.test(this.propertyIri)) {
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
