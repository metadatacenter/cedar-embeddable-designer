import { Component, Input, inject, computed, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TemplateService, FIELD_TYPES } from '../../core/services/template.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-field-type-picker',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './field-type-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./field-type-picker.component.scss'],
})
export class FieldTypePickerComponent {
  readonly service = inject(TemplateService);

  @Input() insertPosition = 0;

  /** Every field type the palette offers, in the order it declares them. */
  readonly fieldTypesList = computed(() => Object.entries(FIELD_TYPES).map(([key, value]) => ({ key, value })));

  onFieldClick(key: string) {
    this.service.addField(key, this.insertPosition);
  }

  close() {
    this.service.showPicker.set(null);
  }
}
