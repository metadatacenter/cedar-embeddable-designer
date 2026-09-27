import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CedLanguageService } from '../../i18n/ced-language.service';
import { publicationStatusLabel } from '../../shared/publication-status';
import { TemplateService } from '../../core/services/template.service';
import { CustomField, Field } from '../../core/models/types';
import { fieldArtifactMetadata, validateFieldSpecification, newFieldIdentity } from '../../core/model/cedar-template';
import { FieldSpecificationEditorComponent } from '../field-specification-editor/field-specification-editor.component';

@Component({
  selector: 'app-field-designer',
  imports: [FormsModule, FieldSpecificationEditorComponent, TranslatePipe],
  templateUrl: './field-designer.component.html',
  styleUrls: ['./field-designer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldDesignerComponent {
  readonly service = inject(TemplateService);
  readonly metadata = fieldArtifactMetadata;
  readonly publicationStatusLabel = publicationStatusLabel;
  private readonly i18n = inject(CedLanguageService);
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
      this.error = this.i18n.t('fieldDesigner.nameRequired');
      return;
    }
    if (!this.service.libraries().some((library) => library.id === Number(this.selectedLibraryId))) {
      this.error = this.i18n.t('fieldDesigner.libraryRequired');
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
      this.error = this.i18n.describe(error);
    }
  }
  cancel(): void {
    this.draft.set(null);
    this.edited = null;
    this.editingId = null;
    this.error = null;
  }
  addToTemplate(field: CustomField): void {
    this.service.addCustomFieldToTemplate(field, this.service.fields().length);
    this.service.showFieldDesigner.set(false);
  }
}
