import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TemplateService } from '../../core/services/template.service';
import { CustomField, Field } from '../../core/models/types';
import {
  fieldArtifactMetadata,
  validateFieldSpecification,
  newFieldIdentity,
  readField,
} from '../../core/model/cedar-template';
import { FieldSpecificationEditorComponent } from '../field-specification-editor/field-specification-editor.component';

@Component({
  selector: 'app-field-designer',
  imports: [FormsModule, FieldSpecificationEditorComponent],
  templateUrl: './field-designer.component.html',
  styleUrls: ['./field-designer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldDesignerComponent {
  readonly service = inject(TemplateService);
  readonly metadata = fieldArtifactMetadata;
  readonly draft = signal<Field | null>(null);
  edited: Field | null = null;
  editingId: number | null = null;
  selectedLibraryId = 0;
  libraryName = '';
  libraryDescription = '';
  error: string | null = null;
  constructor() {
    const pending = this.service.libraryDraft();
    if (pending) {
      this.service.libraryDraft.set(null);
      this.openDraft(pending);
    }
  }
  openDraft(field: Field, id: number | null = null): void {
    this.editingId = id;
    this.edited = structuredClone(field);
    this.draft.set(structuredClone(field));
    this.error = null;
    this.selectedLibraryId = this.service.libraries()[0]?.id ?? 0;
  }
  createField(): void {
    this.openDraft({
      id: Date.now(),
      ...newFieldIdentity(),
      type: 'text',
      name: '',
      status: 'optional',
      options: [],
      defaultValue: { kind: 'none' },
      allowMultiple: false,
    });
  }
  editField(field: CustomField): void {
    this.openDraft(field.definition, field.id);
    this.selectedLibraryId = field.libraryId;
  }
  createLibrary(): void {
    if (!this.libraryName.trim()) return;
    const id = Date.now();
    this.service.libraries.update((libraries) => [
      ...libraries,
      { id, name: this.libraryName.trim(), description: this.libraryDescription, icon: 'library' },
    ]);
    this.selectedLibraryId = id;
    this.libraryName = '';
    this.libraryDescription = '';
  }
  saveField(): void {
    if (!this.edited?.name.trim()) {
      this.error = 'Give the field a name.';
      return;
    }
    if (!this.service.libraries().some((library) => library.id === Number(this.selectedLibraryId))) {
      this.error = 'Choose a library, or create one first.';
      return;
    }
    try {
      validateFieldSpecification(this.edited);
      const field: CustomField = {
        id: this.editingId ?? Date.now(),
        libraryId: Number(this.selectedLibraryId),
        definition: structuredClone(this.edited),
      };
      if (this.editingId !== null) this.service.updateCustomField(field);
      else this.service.customFields.update((fields) => [...fields, field]);
      this.cancel();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }
  }
  cancel(): void {
    this.draft.set(null);
    this.edited = null;
    this.editingId = null;
    this.error = null;
  }
  async importField(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const source = await file.text();
      const document = source.trim().startsWith('{') ? JSON.parse(source) : null;
      if (document?.format === 'ced-field-specification-v1') {
        validateFieldSpecification(document.definition);
        this.openDraft(document.definition);
      } else this.openDraft(readField(source));
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not read this field.';
    }
    input.value = '';
  }
  exportField(field: Field): void {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ format: 'ced-field-specification-v1', definition: field }, null, 2)], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${field.name || 'field'}.ced-field.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  addToTemplate(field: CustomField): void {
    this.service.addCustomFieldToTemplate(field, this.service.fields().length);
    this.service.showFieldDesigner.set(false);
  }
}
