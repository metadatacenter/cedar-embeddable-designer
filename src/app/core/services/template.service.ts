import { Injectable, signal, computed, inject } from '@angular/core';
import { Field, Library, CustomField, ControlledTermConfig, UserPreferences, FIELD_TYPES } from '../models/types';
import { PreferencesService } from './preferences.service';
import {
  EditorTemplate,
  buildTemplate,
  newFieldIdentity,
  newTemplateIdentifier,
  readTemplate,
  templateToJson,
  templateToYaml,
  toEditorTemplate,
} from '../model/cedar-template';

export { FIELD_TYPES } from '../models/types';

/**
 * The three fields a new template opens with.
 *
 * A function, and the only source: the list was written out twice, once in the
 * signal initializer and once in `resetTemplate`, and the two drifted — the reset
 * copy minted field identifiers and the initializer's did not, so the fields an
 * author saw on first load had no identity at all.
 */
function starterFields(): Field[] {
  return [
    {
      id: 1,
      ...newFieldIdentity(),
      type: 'text',
      name: 'Title',
      status: 'required',
      options: [],
      defaultValue: '',
      allowMultiple: false,
    },
    {
      id: 2,
      ...newFieldIdentity(),
      type: 'multipleChoice',
      name: 'Category',
      status: 'optional',
      options: ['Option 1', 'Option 2'],
      defaultValue: '',
      allowMultiple: false,
    },
    {
      id: 3,
      ...newFieldIdentity(),
      type: 'date',
      name: 'Publication Date',
      status: 'optional',
      options: [],
      defaultValue: '',
      allowMultiple: false,
    },
  ];
}

@Injectable({
  providedIn: 'root',
})
export class TemplateService {
  // Inject PreferencesService
  readonly preferencesService = inject(PreferencesService);

  /**
   * CEDAR's teal, at the hues the CEDAR Embeddable Editor publishes.
   *
   * These were a green nobody in CEDAR uses — `#2D6F5F`, labelled "Cedar green"
   * by the Figma export. The real values live as custom properties in
   * `styles.css`; this object exists because a handful of bindings set a colour
   * from TypeScript rather than from a class.
   */
  readonly COLORS = {
    primary: '#0f7686',
    primaryHover: '#0d6e7e',
    primaryLight: '#e2eff0',
    border: '#b7d6db',
  };

  // State Signals
  readonly templateName = signal<string>('Untitled Template');
  readonly templateDesc = signal<string>('');
  readonly templateIdentifier = signal<string>('');
  readonly templateVersion = signal<string>('0.0.1');

  readonly fields = signal<Field[]>(starterFields());

  /**
   * The editor state as it was when the template was last saved, opened or reset.
   *
   * Compared against the live state rather than set by each mutation, because a
   * flag set by hand is a flag someone forgets: this used to be one boolean that
   * only field reordering ever raised, so every other edit left the unsaved-changes
   * guard believing there was nothing to lose.
   *
   * The editor's own state rather than the written template, because the two are
   * not the same question: a template can be rewritten byte-identically and still
   * be unsaved.
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

  /**
   * The editor's state as one value, and that value as a CEDAR template.
   *
   * Four places used to build the template themselves from the five signals
   * below — both export panels, the file menu and the custom element — each
   * calling a serializer that minted fresh identifiers, so the same template
   * appeared with different identity in each of them. Built once here, and
   * memoized, so what the element publishes and what the panels display are the
   * same artifact.
   */
  /**
   * The identifier a template carries before its author gives it one.
   *
   * Minted once per template rather than at each build, for the same reason a
   * field's is: `buildTemplate` would otherwise invent a new one on every
   * keystroke, and the artifact a host is holding would change identity under it.
   * Re-minted by `resetTemplate`, which is where a new template begins.
   */
  private readonly mintedIdentifier = signal<string>(newTemplateIdentifier());

  readonly editorTemplate = computed<EditorTemplate>(() => ({
    name: this.templateName(),
    description: this.templateDesc(),
    identifier: this.templateIdentifier() || this.mintedIdentifier(),
    version: this.templateVersion(),
    fields: this.fields(),
  }));

  readonly template = computed(() => buildTemplate(this.editorTemplate()));
  readonly templateJson = computed(() => templateToJson(this.template()));
  readonly templateYaml = computed(() => templateToYaml(this.template()));

  readonly libraries = signal<Library[]>([]);
  readonly customFields = signal<CustomField[]>([]);
  readonly selectedLibraryId = signal<number | null>(null);
  readonly sidebarCollapsed = signal<boolean>(false);

  // Modal & Navigation States
  readonly showPicker = signal<number | null>(null);
  readonly showPreview = signal<boolean>(false);
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
  get showPreferencesModal() {
    return this.preferencesService.showPreferencesModal;
  }
  get showPresetDefinitionsModal() {
    return this.preferencesService.showPresetDefinitionsModal;
  }
  get showUserMenu() {
    return this.preferencesService.showUserMenu;
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
      ...newFieldIdentity(),
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
      ...newFieldIdentity(),
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

  /** The one value a static field shows. */
  updateContent(id: number, content: string) {
    this.fields.update((prev) => prev.map((f) => (f.id === id ? { ...f, content } : f)));
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
  updatePreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
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

  resetTemplate() {
    this.templateName.set('Untitled Template');
    this.templateDesc.set('');
    this.templateIdentifier.set('');
    this.mintedIdentifier.set(newTemplateIdentifier());
    this.templateVersion.set('0.0.1');
    this.fields.set(starterFields());
    this.markSaved();
  }

  /**
   * Load a template a host or a file supplied, in either serialization.
   *
   * Reading is the model library's, so JSON and YAML arrive as the same
   * `Template` and the editor's state is derived from the model rather than from
   * whichever set of keys the file happened to use. This used to try `JSON.parse`,
   * fall back to a hand-written YAML parser, and on failure log to the console and
   * return — leaving the author looking at their previous template with nothing to
   * say the file had not been read.
   */
  loadTemplate(source: unknown): void {
    if (source === null || source === undefined || source === '') {
      return;
    }

    const state = toEditorTemplate(readTemplate(source as string | object));

    this.templateName.set(state.name || 'Untitled Template');
    this.templateDesc.set(state.description);
    this.templateIdentifier.set(state.identifier);
    this.templateVersion.set(state.version);
    this.fields.set(state.fields);
    this.markSaved();
  }
}
