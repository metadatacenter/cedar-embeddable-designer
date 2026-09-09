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
  min: number | null = null;
  max: number | null = null;
  error: string | null = null;
  get multiple(): boolean {
    return descriptorOf(this.field.type).deployment === 'alwaysMultiple' || this.field.allowMultiple;
  }
  ngOnChanges(): void {
    this.min = this.field.minItems ?? null;
    this.max = this.field.maxItems ?? null;
    this.error = null;
  }
  saveBounds(): void {
    this.error = this.service.updateFieldSettings(this.field.id, { minItems: this.min, maxItems: this.max });
  }
}
