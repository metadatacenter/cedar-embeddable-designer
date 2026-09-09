import { ChangeDetectionStrategy, Component, Input, OnChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Field } from '../../core/models/types';
import { descriptorOf } from '../../core/model/cedar-template';
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
  displayLabel = '';
  displayDescription = '';
  hidden = false;
  continuePreviousLine = false;
  get dynamic(): boolean {
    return descriptorOf(this.field.type).deployment !== 'static';
  }
  text: NonNullable<Field['textConstraints']> = { minLength: null, maxLength: null, regex: null };
  min: number | null = null;
  max: number | null = null;
  error: string | null = null;
  get multiple(): boolean {
    return descriptorOf(this.field.type).deployment === 'alwaysMultiple' || this.field.allowMultiple;
  }
  ngOnChanges(): void {
    this.displayLabel = this.field.displayLabel ?? '';
    this.displayDescription = this.field.displayDescription ?? '';
    this.hidden = this.field.hidden ?? false;
    this.continuePreviousLine = this.field.continuePreviousLine ?? false;
    this.text = { ...(this.field.textConstraints ?? { minLength: null, maxLength: null, regex: null }) };
    this.min = this.field.minItems ?? null;
    this.max = this.field.maxItems ?? null;
    this.error = null;
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
