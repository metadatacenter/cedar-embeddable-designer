import { EditorSession } from './editor-session';
import { containerFromFlat, flatView, newNodeId } from '../model/container-draft';
import { FieldLibraryService } from './field-library.service';
import { Injectable, signal, computed, inject } from '@angular/core';
import {
  Field,
  FieldDefaultValue,
  CustomField,
  ControlledTermSet,
  UserPreferences,
  FIELD_TYPES,
} from '../models/types';
import { PreferencesService } from './preferences.service';
import {
  DesignerTemplate,
  buildTemplate,
  newFieldIdentity,
  newTemplateIdentifier,
  readTemplate,
  templateToJson,
  templateToYaml,
  toDesignerTemplate,
  defaultValueError,
  allowsOptions,
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
      defaultValue: { kind: 'none' },
      allowMultiple: false,
    },
    {
      id: 2,
      ...newFieldIdentity(),
      type: 'multipleChoice',
      name: 'Category',
      status: 'optional',
      options: ['', ''],
      defaultValue: { kind: 'none' },
      allowMultiple: false,
    },
    {
      id: 3,
      ...newFieldIdentity(),
      type: 'date',
      name: 'Publication Date',
      status: 'optional',
      options: [],
      defaultValue: { kind: 'none' },
      allowMultiple: false,
    },
  ];
}

/** Keep selected options tied to their labels as the author edits the option list. */
function choiceDefault(field: Field, options: string[], renamed?: { from: string; to: string }): FieldDefaultValue {
  const value = field.defaultValue;
  if (value.kind !== 'literal' && value.kind !== 'literals') return value;
  const selected = (value.kind === 'literal' ? [value.value] : value.values)
    .map((label) => (renamed && label === renamed.from ? renamed.to : label))
    .filter((label) => label.trim() !== '' && (options.includes(label) || !field.options.includes(label)));
  if (!selected.length) return { kind: 'none' };
  return value.kind === 'literal'
    ? { kind: 'literal', value: selected[0] }
    : { kind: 'literals', values: [...new Set(selected)] };
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

  readonly fieldEditorConfig = signal<{ bridgeBaseUrl?: string; terminologyBaseUrl?: string }>({});

  readonly session = new EditorSession(
    containerFromFlat({
      name: 'Untitled Template',
      description: '',
      identifier: '',
      version: '0.0.1',
      fields: starterFields(),
    }),
  );
  readonly templateName = this.session.property('name');
  readonly templateDesc = this.session.property('description');
  readonly templateIdentifier = this.session.property('identifier');
  readonly templateVersion = this.session.property('version');
  readonly loadError = signal<string | null>(null);
  private readonly containerMetadata = this.session.property('metadata');
  readonly fields = this.session.fieldBinding();

  /**
   * The designer's state as it was when the template was last saved, opened or
   * reset.
   *
   * Compared against the live state rather than set by each mutation, because a
   * flag set by hand is a flag someone forgets: this used to be one boolean that
   * only field reordering ever raised, so every other edit left the unsaved-changes
   * guard believing there was nothing to lose.
   *
   * The designer's own state rather than the written template, because the two are
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
   * designer renders inside a shadow root — the element is in the tree, just not
   * in the document's.
   */
  readonly scrollRequest = signal<number | null>(null);

  /**
   * The designer's state as one value, and that value as a CEDAR template.
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

  readonly designerTemplate = computed<DesignerTemplate>(() => ({
    ...flatView(this.session.document()),
    identifier: this.session.document().identifier || this.mintedIdentifier(),
  }));

  readonly template = computed(() => buildTemplate(this.designerTemplate()));
  readonly templateJson = computed(() => templateToJson(this.template()));
  readonly templateYaml = computed(() => templateToYaml(this.template()));

  readonly fieldLibrary = inject(FieldLibraryService);
  readonly libraries = this.fieldLibrary.libraries;
  readonly customFields = this.fieldLibrary.fields;
  readonly selectedLibraryId = signal<number | null>(null);
  readonly sidebarCollapsed = signal<boolean>(false);

  // Modal & Navigation States
  readonly showPicker = signal<number | null>(null);
  readonly showPreview = signal<boolean>(false);
  readonly showFieldDesigner = signal<boolean>(false);
  readonly libraryDraft = signal<Field | null>(null);
  saveFieldToLibrary(id: number): void {
    const field = this.fields().find((field) => field.id === id);
    if (field) {
      this.libraryDraft.set(structuredClone(field));
      this.showFieldDesigner.set(true);
    }
  }
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
    return JSON.stringify(this.session.document());
  }

  /** Take the current state as the baseline, after a save, an open or a reset. */
  markSaved(): void {
    this.savedState.set(this.stateKey());
  }

  // Field manipulation methods
  addField(type: string, position: number) {
    const newField: Field = {
      id: newNodeId(),
      ...newFieldIdentity(),
      type,
      name: FIELD_TYPES[type].label,
      status: 'optional',
      options: type === 'multipleChoice' || type === 'checkboxes' ? [''] : [],
      defaultValue: { kind: 'none' },
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
      ...structuredClone(customField.definition),
      id: newNodeId(),
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
    if (this.isPublished(id)) return;
    this.fields.update((prev) => prev.filter((f) => f.id !== id));
    if (this.selectedField() === id) {
      this.selectedField.set(null);
    }
  }

  updateFieldName(id: number, name: string) {
    if (this.isPublished(id)) return;
    this.fields.update((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }

  updateFieldType(id: number, type: string) {
    if (this.isPublished(id) || this.fields().find((field) => field.id === id)?.type === type) return;
    this.fields.update((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              type,
              options: allowsOptions(type) ? (f.options.length > 0 ? f.options : ['']) : [],
              defaultValue: { kind: 'none' },
              temporal: undefined,
              numeric: undefined,
              textConstraints: undefined,
              allowMultiple: false,
              customFieldId: undefined,
              libraryId: undefined,
            }
          : f,
      ),
    );
  }

  convertFieldToCustomField(fieldId: number, customField: CustomField) {
    if (this.isPublished(fieldId)) return;
    this.fields.update((fields) =>
      fields.map((field) =>
        field.id === fieldId
          ? {
              ...structuredClone(customField.definition),
              id: fieldId,
              customFieldId: customField.id,
              libraryId: customField.libraryId,
            }
          : field,
      ),
    );
  }

  updateCustomField(updated: CustomField) {
    this.customFields.update((fields) =>
      fields.map((field) => (field.id === updated.id ? structuredClone(updated) : field)),
    );
    // Existing template deployments are independent copies. Editing a library field
    // must not silently overwrite changes made in a template that already uses it.
  }

  deleteCustomField(id: number) {
    this.customFields.update((prev) => prev.filter((cf) => cf.id !== id));
  }

  updateFieldStatus(id: number, status: string) {
    if (this.isPublished(id)) return;
    this.fields.update((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
  }

  updateOption(fieldId: number, optionIndex: number, value: string) {
    if (this.isPublished(fieldId)) return;
    this.fields.update((prev) =>
      prev.map((f) => {
        if (f.id === fieldId) {
          const newOptions = [...f.options];
          newOptions[optionIndex] = value;
          return {
            ...f,
            options: newOptions,
            defaultValue: choiceDefault(f, newOptions, { from: f.options[optionIndex], to: value }),
            importedChoiceDefault:
              f.importedChoiceDefault === f.options[optionIndex] ? value || undefined : f.importedChoiceDefault,
          };
        }
        return f;
      }),
    );
  }

  addOption(fieldId: number) {
    if (this.isPublished(fieldId)) return;
    this.fields.update((prev) =>
      prev.map((f) => {
        if (f.id === fieldId) {
          /*
           * Empty, so the input's placeholder shows the author a hint rather than
           * a value. Seeding the label meant clicking an option put the caret in
           * the middle of the words "Option 2" and the author had to clear them,
           * and an option nobody renamed went into the artifact called that.
           */
          return { ...f, options: [...f.options, ''] };
        }
        return f;
      }),
    );
  }

  deleteOption(fieldId: number, optionIndex: number) {
    if (this.isPublished(fieldId)) return;
    this.fields.update((prev) =>
      prev.map((f) => {
        if (f.id === fieldId) {
          const newOptions = f.options.filter((_, index) => index !== optionIndex);
          return {
            ...f,
            options: newOptions.length > 0 ? newOptions : [''],
            defaultValue: choiceDefault(f, newOptions),
            importedChoiceDefault:
              f.importedChoiceDefault === f.options[optionIndex] ? undefined : f.importedChoiceDefault,
          };
        }
        return f;
      }),
    );
  }

  isPublished(id: number): boolean {
    return !!this.fields().find((field) => field.id === id)?.publishedDefinition;
  }

  updateFieldSettings(id: number, changes: Partial<Field>): string | null {
    if (this.isPublished(id)) return 'Published fields are read-only. Editing a draft version is not available yet.';
    const fields = this.fields().map((field) => (field.id === id ? { ...field, ...changes } : field));
    try {
      buildTemplate({
        name: this.templateName(),
        description: this.templateDesc(),
        identifier: '',
        version: '0.0.1',
        fields,
      });
      this.fields.set(fields);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  updateDefaultValue(id: number, value: FieldDefaultValue) {
    if (this.isPublished(id)) return;
    this.fields.update((prev) =>
      prev.map((f) =>
        f.id === id && defaultValueError(f, value) === null
          ? { ...f, defaultValue: value, importedChoiceDefault: undefined }
          : f,
      ),
    );
  }

  toggleAllowMultiple(id: number) {
    if (this.isPublished(id)) return;
    this.fields.update((prev) => prev.map((f) => (f.id === id ? { ...f, allowMultiple: !f.allowMultiple } : f)));
  }

  /** The one value a static field shows. */
  updateContent(id: number, content: string) {
    if (this.isPublished(id)) return;
    this.fields.update((prev) => prev.map((f) => (f.id === id ? { ...f, content } : f)));
  }

  updateHelpText(id: number, helpText: string) {
    if (this.isPublished(id)) return;
    this.fields.update((prev) => prev.map((f) => (f.id === id ? { ...f, helpText } : f)));
  }

  updateControlledTermConstraints(id: number, constraints: ControlledTermSet) {
    if (this.isPublished(id)) return;
    this.fields.update((prev) => prev.map((f) => (f.id === id ? { ...f, controlledTermConstraints: constraints } : f)));
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
    this.loadError.set(null);
    this.containerMetadata.set(undefined);
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
   * `Template` and the designer's state is derived from the model rather than from
   * whichever set of keys the file happened to use. This used to try `JSON.parse`,
   * fall back to a hand-written YAML parser, and on failure log to the console and
   * return — leaving the author looking at their previous template with nothing to
   * say the file had not been read.
   */
  loadTemplate(source: unknown): void {
    if (source === null || source === undefined || source === '') {
      return;
    }

    let state: DesignerTemplate;
    try {
      state = toDesignerTemplate(readTemplate(source as string | object));
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
      throw error;
    }
    this.loadError.set(null);

    this.templateName.set(state.name || 'Untitled Template');
    this.templateDesc.set(state.description);
    this.templateIdentifier.set(state.identifier);
    this.templateVersion.set(state.version);
    this.containerMetadata.set(state.metadata);
    this.fields.set(state.fields);
    this.markSaved();
  }
}
