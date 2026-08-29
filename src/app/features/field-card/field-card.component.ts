import { Component, Input, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { TemplateService, FIELD_TYPES } from '../../core/services/template.service';
import { Field } from '../../core/models/types';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ControlledTermConfigComponent } from '../controlled-term-config/controlled-term-config.component';

@Component({
  selector: 'app-field-card',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ControlledTermConfigComponent, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './field-card.component.html',
})
export class FieldCardComponent {
  @Input() field!: Field;

  readonly service = inject(TemplateService);

  get FIELD_TYPES_LIST() {
    return FIELD_TYPES;
  }

  getFieldIcon(field: Field): string {
    if (field.customFieldId) {
      const customField = this.service.customFields().find((cf) => cf.id === field.customFieldId);
      if (customField) {
        return customField.baseType;
      }
    }
    return field.type;
  }

  getFieldTypeName(field: Field): string {
    if (field.customFieldId) {
      const customField = this.service.customFields().find((cf) => cf.id === field.customFieldId);
      if (customField) return customField.name;
    }
    return FIELD_TYPES[field.type]?.label || field.type;
  }
}
