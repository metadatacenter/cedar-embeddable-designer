import { Component, inject, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TemplateService, FIELD_TYPES } from '../../../core/services/template.service';
import { PresetDefinition } from '../../../core/models/types';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-preset-definitions-modal',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './preset-definitions.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./preset-definitions.component.scss'],
})
export class PresetDefinitionsModalComponent {
  readonly service = inject(TemplateService);
  readonly presets: Array<'basic' | 'semantic' | 'modular'> = ['basic', 'semantic', 'modular'];

  get fieldTypesList() {
    return Object.entries(FIELD_TYPES).map(([key, value]) => ({ key, value }));
  }

  updateDef(preset: 'basic' | 'semantic' | 'modular', key: keyof PresetDefinition, value: boolean) {
    this.service.presetDefinitions.update((prev) => ({
      ...prev,
      [preset]: {
        ...prev[preset],
        [key]: value,
      },
    }));
  }

  toggleFieldType(preset: 'basic' | 'semantic' | 'modular', fieldType: string) {
    this.service.presetDefinitions.update((prev) => {
      const currentHidden = prev[preset].hiddenFieldTypes;
      const newHidden = currentHidden.includes(fieldType)
        ? currentHidden.filter((ft) => ft !== fieldType)
        : [...currentHidden, fieldType];

      return {
        ...prev,
        [preset]: {
          ...prev[preset],
          hiddenFieldTypes: newHidden,
        },
      };
    });
  }

  close() {
    this.service.showPresetDefinitionsModal.set(false);
  }
}
