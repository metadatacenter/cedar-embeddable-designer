import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TemplateService } from '../../core/services/template.service';
import { Library, CustomField, ValidationRule } from '../../core/models/types';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-field-designer',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './field-designer.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./field-designer.component.scss'],
})
export class FieldDesignerComponent {
  readonly service = inject(TemplateService);

  readonly activeTab = signal<'custom' | 'libraries'>('libraries');
  readonly showCreateForm = signal(false);
  readonly showCreateLibrary = signal(false);
  readonly editingCustomFieldId = signal<number | null>(null);

  // Form state for custom fields
  fieldName = '';
  baseType = 'text';
  description = '';
  placeholder = '';
  validationRules: ValidationRule[] = [];
  selectedLibraryId = 0;

  // Form state for libraries
  libraryName = '';
  libraryDescription = '';

  readonly BASE_FIELD_TYPES = [
    { value: 'text', label: 'Text' },
    { value: 'paragraph', label: 'Paragraph' },
    { value: 'number', label: 'Number' },
    { value: 'email', label: 'Email' },
    { value: 'date', label: 'Date' },
    { value: 'time', label: 'Time' },
    { value: 'link', label: 'Link' },
    { value: 'phone', label: 'Phone' },
  ];

  readonly VALIDATION_TYPES = [
    { value: 'regex', label: 'Regex Pattern' },
    { value: 'minLength', label: 'Minimum Length' },
    { value: 'maxLength', label: 'Maximum Length' },
    { value: 'range', label: 'Number Range' },
    { value: 'custom', label: 'Custom Validation' },
  ];

  getBaseTypeLabel(val: string): string {
    return this.BASE_FIELD_TYPES.find((t) => t.value === val)?.label || val;
  }

  openCreateForm() {
    if (this.service.libraries().length > 0) {
      this.resetForm();
      this.showCreateForm.set(true);
    }
  }

  editCustomField(cf: CustomField) {
    this.editingCustomFieldId.set(cf.id);
    this.fieldName = cf.name;
    this.baseType = cf.baseType;
    this.description = cf.description || '';
    this.placeholder = cf.placeholder || '';
    this.validationRules = [...cf.validationRules];
    this.selectedLibraryId = cf.libraryId;
    this.showCreateForm.set(true);
  }

  addValidationRule() {
    const newRule: ValidationRule = {
      id: Date.now(),
      type: 'regex',
      pattern: '',
      errorMessage: '',
    };
    this.validationRules = [...this.validationRules, newRule];
  }

  deleteValidationRule(id: number) {
    this.validationRules = this.validationRules.filter((r) => r.id !== id);
  }

  handleCreateField() {
    if (!this.fieldName.trim()) return;

    const editingId = this.editingCustomFieldId();
    if (editingId !== null) {
      const updatedField: CustomField = {
        id: editingId,
        name: this.fieldName,
        icon: 'text',
        baseType: this.baseType,
        libraryId: Number(this.selectedLibraryId),
        description: this.description,
        placeholder: this.placeholder,
        validationRules: this.validationRules,
      };
      this.service.updateCustomField(updatedField);
    } else {
      const newField: CustomField = {
        id: Date.now(),
        name: this.fieldName,
        icon: 'text',
        baseType: this.baseType,
        libraryId: Number(this.selectedLibraryId),
        description: this.description,
        placeholder: this.placeholder,
        validationRules: this.validationRules,
      };
      this.service.customFields.update((prev) => [...prev, newField]);
    }

    this.resetForm();
  }

  resetForm() {
    this.fieldName = '';
    this.baseType = 'text';
    this.description = '';
    this.placeholder = '';
    this.validationRules = [];
    this.showCreateForm.set(false);
    this.editingCustomFieldId.set(null);
    this.selectedLibraryId = 0;
  }

  handleCreateLibrary() {
    if (!this.libraryName.trim()) return;

    const newLibrary: Library = {
      id: Date.now(),
      name: this.libraryName,
      description: this.libraryDescription,
      icon: 'library',
    };

    this.service.libraries.update((prev) => [...prev, newLibrary]);
    this.resetLibraryForm();
  }

  resetLibraryForm() {
    this.libraryName = '';
    this.libraryDescription = '';
    this.showCreateLibrary.set(false);
  }

  backToBuilder() {
    this.service.showFieldDesigner.set(false);
  }
}
