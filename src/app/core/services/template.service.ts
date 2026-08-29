import { Injectable, signal, computed, inject } from '@angular/core';
import { Field, Library, CustomField, ControlledTermConfig, UserPreferences, FIELD_TYPES } from '../models/types';
import { PreferencesService } from './preferences.service';
import { fromCedarYaml } from '../cedar-shim';

export { FIELD_TYPES } from '../models/types';

@Injectable({
  providedIn: 'root',
})
export class TemplateService {
  // Inject PreferencesService
  readonly preferencesService = inject(PreferencesService);

  // Cedar green color palette
  readonly COLORS = {
    primary: '#2D6F5F', // Cedar green
    primaryHover: '#245A4D',
    primaryLight: '#E8F3F0',
    border: '#3B7A5D',
  };

  // State Signals
  readonly templateName = signal<string>('Untitled Template');
  readonly templateDesc = signal<string>('');
  readonly templateIdentifier = signal<string>('');
  readonly templateVersion = signal<string>('0.0.1');

  readonly fields = signal<Field[]>([
    { id: 1, type: 'text', name: 'Title', status: 'required', options: [], defaultValue: '', allowMultiple: false },
    {
      id: 2,
      type: 'multipleChoice',
      name: 'Category',
      status: 'optional',
      options: ['Option 1', 'Option 2'],
      defaultValue: '',
      allowMultiple: false,
    },
    {
      id: 3,
      type: 'date',
      name: 'Publication Date',
      status: 'optional',
      options: [],
      defaultValue: '',
      allowMultiple: false,
    },
  ]);

  /**
   * The editor state as it was when the template was last saved, opened or reset.
   *
   * Compared against the live state rather than set by each mutation, because a
   * flag set by hand is a flag someone forgets: this used to be one boolean that
   * only field reordering ever raised, so every other edit left the unsaved-changes
   * guard believing there was nothing to lose.
   *
   * The editor's own state, not the serialization: `toCedarJson` stamps a fresh
   * timestamp and fresh identifiers on every call, so a template compared through
   * it would read as changed the moment it was written.
   */
  private readonly savedState = signal<string>('');

  readonly isDirty = computed(() => this.stateKey() !== this.savedState());

  /**
   * The field a newly added card should be scrolled to, or null.
   *
   * The service holds the request and the component performs it. Looking the card
   * up from here meant `document.getElementById`, which finds nothing once the
   * editor renders inside a shadow root — the element is in the tree, just not in
   * the document's.
   */
  readonly scrollRequest = signal<number | null>(null);

  readonly libraries = signal<Library[]>([]);
  readonly customFields = signal<CustomField[]>([]);
  readonly selectedLibraryId = signal<number | null>(null);
  readonly sidebarCollapsed = signal<boolean>(false);

  // Modal & Navigation States
  readonly showPicker = signal<number | null>(null);
  readonly showPreview = signal<boolean>(false);
  readonly previewInitialTab = signal<'preview' | 'json' | 'yaml'>('preview');
  readonly showFieldDesigner = signal<boolean>(false);
  readonly selectedField = signal<number | null>(null);
  readonly fieldTypeDropdown = signal<number | null>(null);
  readonly fieldTypeDropdownLibrary = signal<number | null>(null);

  // Proxies for PreferencesService State
  get preferences() {
    return this.preferencesService.preferences;
  }
  get presetDefinitions() {
    return this.preferencesService.presetDefinitions;
  }
  get bioportalApiKey() {
    return this.preferencesService.bioportalApiKey;
  }
  get showPreferencesModal() {
    return this.preferencesService.showPreferencesModal;
  }
  get showPresetDefinitionsModal() {
    return this.preferencesService.showPresetDefinitionsModal;
  }
  get showUserMenu() {
    return this.preferencesService.showUserMenu;
  }
  get showApiKeyModal() {
    return this.preferencesService.showApiKeyModal;
  }

  constructor() {
    this.markSaved();
  }

  /** Everything a save would write, and nothing that changes on its own. */
  private stateKey(): string {
    return JSON.stringify({
      name: this.templateName(),
      description: this.templateDesc(),
      identifier: this.templateIdentifier(),
      version: this.templateVersion(),
      fields: this.fields(),
    });
  }

  /** Take the current state as the baseline, after a save, an open or a reset. */
  markSaved(): void {
    this.savedState.set(this.stateKey());
  }

  // Field manipulation methods
  addField(type: string, position: number) {
    const newField: Field = {
      id: Date.now(),
      type,
      name: FIELD_TYPES[type].label,
      status: 'optional',
      options: type === 'multipleChoice' || type === 'checkboxes' ? ['Option 1'] : [],
      defaultValue: '',
      allowMultiple: false,
    };

    this.fields.update((prev) => {
      const updated = [...prev];
      updated.splice(position, 0, newField);
      return updated;
    });

    this.showPicker.set(null);
    this.selectedField.set(newField.id);

    this.scrollRequest.set(newField.id);
  }

  addCustomFieldToTemplate(customField: CustomField, position: number) {
    const newField: Field = {
      id: Date.now(),
      type: customField.baseType,
      name: customField.name,
      helpText: customField.description || '',
      defaultValue: customField.placeholder || '',
      status: 'optional',
      options: customField.baseType === 'multipleChoice' || customField.baseType === 'checkboxes' ? ['Option 1'] : [],
      allowMultiple: false,
      customFieldId: customField.id,
      libraryId: customField.libraryId,
    };

    this.fields.update((prev) => {
      const updated = [...prev];
      updated.splice(position, 0, newField);
      return updated;
    });

    this.showPicker.set(null);
    this.selectedField.set(newField.id);

    this.scrollRequest.set(newField.id);
  }

  deleteField(id: number) {
    this.fields.update((prev) => prev.filter((f) => f.id !== id));
    if (this.selectedField() === id) {
      this.selectedField.set(null);
    }
  }

  updateFieldName(id: number, name: string) {
    this.fields.update((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }

  updateFieldType(id: number, type: string) {
    this.fields.update((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              type,
              options:
                type === 'multipleChoice' || type === 'checkboxes'
                  ? f.options.length > 0
                    ? f.options
                    : ['Option 1']
                  : [],
              defaultValue: '',
              allowMultiple: false,
              customFieldId: undefined,
              libraryId: undefined,
            }
          : f,
      ),
    );
  }

  convertFieldToCustomField(fieldId: number, customField: CustomField) {
    this.fields.update((prev) =>
      prev.map((f) =>
        f.id === fieldId
          ? {
              ...f,
              type: customField.baseType,
              name: customField.name,
              helpText: customField.description || f.helpText,
              defaultValue: customField.placeholder || f.defaultValue,
              options:
                customField.baseType === 'multipleChoice' || customField.baseType === 'checkboxes'
                  ? f.options.length > 0
                    ? f.options
                    : ['Option 1']
                  : [],
              allowMultiple: false,
              customFieldId: customField.id,
              libraryId: customField.libraryId,
            }
          : f,
      ),
    );
  }

  updateCustomField(updatedCustomField: CustomField) {
    // 1. Update customFields signal
    this.customFields.update((prev) => prev.map((cf) => (cf.id === updatedCustomField.id ? updatedCustomField : cf)));

    // 2. Sync changes automatically to all fields in the template created from this custom field
    this.fields.update((prev) =>
      prev.map((f) => {
        if (f.customFieldId === updatedCustomField.id) {
          return {
            ...f,
            name: updatedCustomField.name,
            type: updatedCustomField.baseType,
            helpText: updatedCustomField.description || f.helpText,
            defaultValue: updatedCustomField.placeholder || f.defaultValue,
          };
        }
        return f;
      }),
    );
  }

  deleteCustomField(id: number) {
    this.customFields.update((prev) => prev.filter((cf) => cf.id !== id));
  }

  updateFieldStatus(id: number, status: string) {
    this.fields.update((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
  }

  updateOption(fieldId: number, optionIndex: number, value: string) {
    this.fields.update((prev) =>
      prev.map((f) => {
        if (f.id === fieldId) {
          const newOptions = [...f.options];
          newOptions[optionIndex] = value;
          return { ...f, options: newOptions };
        }
        return f;
      }),
    );
  }

  addOption(fieldId: number) {
    this.fields.update((prev) =>
      prev.map((f) => {
        if (f.id === fieldId) {
          return { ...f, options: [...f.options, `Option ${f.options.length + 1}`] };
        }
        return f;
      }),
    );
  }

  deleteOption(fieldId: number, optionIndex: number) {
    this.fields.update((prev) =>
      prev.map((f) => {
        if (f.id === fieldId) {
          const newOptions = f.options.filter((_, index) => index !== optionIndex);
          return { ...f, options: newOptions.length > 0 ? newOptions : ['Option 1'] };
        }
        return f;
      }),
    );
  }

  updateDefaultValue(id: number, value: string) {
    this.fields.update((prev) => prev.map((f) => (f.id === id ? { ...f, defaultValue: value } : f)));
  }

  toggleAllowMultiple(id: number) {
    this.fields.update((prev) => prev.map((f) => (f.id === id ? { ...f, allowMultiple: !f.allowMultiple } : f)));
  }

  updateHelpText(id: number, helpText: string) {
    this.fields.update((prev) => prev.map((f) => (f.id === id ? { ...f, helpText } : f)));
  }

  updateControlledTermConfig(id: number, config: ControlledTermConfig) {
    this.fields.update((prev) => prev.map((f) => (f.id === id ? { ...f, controlledTermConfig: config } : f)));
  }

  moveField(dragIndex: number, hoverIndex: number) {
    this.fields.update((prev) => {
      const updated = [...prev];
      const dragField = updated[dragIndex];
      updated.splice(dragIndex, 1);
      updated.splice(hoverIndex, 0, dragField);
      return updated;
    });
  }

  // Proxies for PreferencesService Methods
  updatePreference(key: keyof UserPreferences, value: any) {
    this.preferencesService.updatePreference(key, value);
  }

  updateFieldTypeVisibility(fieldType: string, visible: boolean) {
    this.preferencesService.updateFieldTypeVisibility(fieldType, visible);
  }

  toggleAllFieldTypes(visible: boolean) {
    this.preferencesService.toggleAllFieldTypes(visible);
  }

  applyPreset(preset: 'basic' | 'semantic' | 'modular') {
    this.preferencesService.applyPreset(preset);
  }

  getActivePreset(): 'basic' | 'semantic' | 'modular' | null {
    return this.preferencesService.getActivePreset();
  }

  // Programmatic Web Component Methods
  setBioPortalApiKey(key: string) {
    if (key) {
      this.preferencesService.bioportalApiKey.set(key);
    }
  }

  resetTemplate() {
    this.templateName.set('Untitled Template');
    this.templateDesc.set('');
    this.templateIdentifier.set('');
    this.templateVersion.set('0.0.1');
    this.fields.set([
      { id: 1, type: 'text', name: 'Title', status: 'required', options: [], defaultValue: '', allowMultiple: false },
      {
        id: 2,
        type: 'multipleChoice',
        name: 'Category',
        status: 'optional',
        options: ['Option 1', 'Option 2'],
        defaultValue: '',
        allowMultiple: false,
      },
      {
        id: 3,
        type: 'date',
        name: 'Publication Date',
        status: 'optional',
        options: [],
        defaultValue: '',
        allowMultiple: false,
      },
    ]);
    this.markSaved();
  }

  loadTemplate(templateData: any) {
    if (!templateData) return;
    if (typeof templateData === 'string') {
      try {
        templateData = JSON.parse(templateData);
      } catch {
        try {
          templateData = fromCedarYaml(templateData);
        } catch (e) {
          console.error('Failed to parse template as JSON or YAML:', e);
          return;
        }
      }
    }
    if (!templateData || typeof templateData !== 'object') return;
    if (templateData.name) this.templateName.set(templateData.name);
    else if (templateData['schema:name']) this.templateName.set(templateData['schema:name']);

    if (templateData.description !== undefined) this.templateDesc.set(templateData.description);
    else if (templateData['schema:description']) this.templateDesc.set(templateData['schema:description']);

    if (templateData.id) this.templateIdentifier.set(templateData.id);
    else if (templateData['schema:identifier']) this.templateIdentifier.set(templateData['schema:identifier']);

    if (templateData.version) this.templateVersion.set(templateData.version);
    else if (templateData['pav:version']) this.templateVersion.set(templateData['pav:version']);

    if (Array.isArray(templateData.children)) {
      // Parse CEDAR 1.6.0 structural model format
      const cedarTypeToEditorType: Record<string, string> = {
        'text-field': 'text',
        'textarea-field': 'paragraph',
        'radio-field': 'multipleChoice',
        'checkbox-field': 'checkboxes',
        'temporal-field': 'date',
        'email-field': 'email',
        'link-field': 'link',
        'phone-number-field': 'phone',
        'numeric-field': 'number',
        'image-field': 'image',
        'orcid-field': 'orcid',
        'controlled-term-field': 'controlledTerms',
      };

      const parsedFields: Field[] = templateData.children.map((child: any, idx: number) => {
        const type = cedarTypeToEditorType[child.type] || 'text';
        const options = Array.isArray(child.values) ? child.values.map((v: any) => v.label || v) : [];
        const isRequired = child.configuration?.required === true;

        return {
          id: Date.now() + idx,
          type,
          name: child.name || child.key || `Field ${idx + 1}`,
          helpText: child.description || '',
          status: isRequired ? 'required' : 'optional',
          options,
          defaultValue: '',
          allowMultiple: false,
        };
      });

      this.fields.set(parsedFields);
    } else if (Array.isArray(templateData.fields)) {
      // Internal editor state format
      this.fields.set(templateData.fields);
    }

    this.markSaved();
  }
}
