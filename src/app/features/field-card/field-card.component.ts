import { Component, Input, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { TemplateService, FIELD_TYPES } from '../../core/services/template.service';
import { Field } from '../../core/models/types';
import { allowsMultiple, allowsOptions, allowsStatus, contentKindOf } from '../../core/model/cedar-template';
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

  /*
   * What a type will actually accept, asked of the same table that builds it.
   * A control offered for a setting the artifact cannot carry is a control that
   * lies: a page break has no required value, and a radio's cardinality is
   * decided by its type rather than by its author.
   */
  allowsStatus(type: string): boolean {
    return allowsStatus(type);
  }

  allowsMultiple(type: string): boolean {
    return allowsMultiple(type);
  }

  allowsOptions(type: string): boolean {
    return allowsOptions(type);
  }

  /** The label for a static field's one value, or nothing for a type without one. */
  contentLabel(type: string): string | null {
    switch (contentKindOf(type)) {
      case 'markup':
        return 'Content';
      case 'url':
        return 'Image URL';
      case 'videoId':
        return 'YouTube video ID';
      default:
        return null;
    }
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
