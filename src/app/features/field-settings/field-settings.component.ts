import { FieldDefaultValueComponent } from '../field-default-value/field-default-value.component';
import { ChangeDetectionStrategy, Component, Input, OnChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Field } from '../../core/models/types';
import {
  accepts,
  allowsDefault,
  descriptorOf,
  FieldParameter,
  fieldArtifactMetadata,
  NUMERIC_TYPES,
  temporalGranularities,
} from '../../core/model/cedar-template';
import { TemplateService } from '../../core/services/template.service';

@Component({
  selector: 'app-field-settings',
  imports: [FormsModule, FieldDefaultValueComponent],
  templateUrl: './field-settings.component.html',
  styleUrl: './field-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldSettingsComponent implements OnChanges {
  @Input({ required: true }) field!: Field;
  @Input() hasValues = false;
  expanded = false;
  activeTab = 'Display';
  get valuesTab(): string {
    return ['richText', 'image', 'youtube'].includes(this.field.type) ? 'Content' : 'Constraints';
  }
  readonly allowsDefault = allowsDefault;
  get hasConstraints(): boolean {
    return (
      allowsDefault(this.field.type) ||
      this.accepts('temporalPrecision') ||
      this.accepts('textLength') ||
      this.accepts('numericBounds')
    );
  }
  get tabs(): string[] {
    return [
      'Display',
      ...(this.hasValues || this.hasConstraints ? [this.valuesTab] : []),
      'Field details',
      ...(this.multiple ? ['Occurrences'] : []),
      'Field metadata',
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
  get artifact() {
    return fieldArtifactMetadata(this.field);
  }
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
  private errors: Record<string, string | null> = {};
  get error(): string | null {
    const message = this.errors[this.selectedTab] ?? null;
    const prefix = `${this.field.name.trim() || 'an unnamed field'}: `;
    return message?.startsWith(prefix) ? message.slice(prefix.length) : message;
  }
  get multiple(): boolean {
    return descriptorOf(this.field.type).deployment === 'alwaysMultiple' || this.field.allowMultiple;
  }
  /** Keep invalid/incomplete input while valid edits update the field immediately. */
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
    if (first) this.errors = {};
  }

  saveMedia(): void {
    this.errors['Content'] = this.service.updateFieldSettings(this.field.id, {
      width: this.width,
      height: this.height,
    });
  }
  saveTemporal(): void {
    this.errors['Constraints'] = this.service.updateFieldSettings(this.field.id, {
      temporal: { ...this.temporal },
      type: this.temporal.type === 'xsd:time' ? 'time' : 'date',
    });
  }
  saveNumeric(form?: HTMLFormElement): void {
    // Number inputs expose malformed text (e.g., an incomplete exponent) as null.
    // Keep that draft out of the model instead of treating it as a cleared bound.
    const invalid = form && Array.from(form.querySelectorAll('input')).find((input) => input.validity.badInput);
    if (invalid) {
      const label = invalid.closest('label')?.textContent?.trim() || 'Numeric value';
      this.errors['Constraints'] = `${label} must be a valid number.`;
      return;
    }
    this.errors['Constraints'] = this.service.updateFieldSettings(this.field.id, {
      numeric: { ...this.numeric, unit: this.numeric.unit || null },
    });
  }
  saveText(): void {
    this.errors['Constraints'] = this.service.updateFieldSettings(this.field.id, {
      textConstraints: { ...this.text, regex: this.text.regex || null },
    });
  }
  saveLayout(): void {
    this.errors['Display'] = this.service.updateFieldSettings(this.field.id, {
      displayLabel: this.displayLabel || undefined,
      displayDescription: this.displayDescription || undefined,
      hidden: this.hidden,
      continuePreviousLine: this.continuePreviousLine,
    });
  }
  saveBounds(): void {
    this.errors['Occurrences'] = this.service.updateFieldSettings(this.field.id, {
      minItems: this.min,
      maxItems: this.max,
    });
  }
}
