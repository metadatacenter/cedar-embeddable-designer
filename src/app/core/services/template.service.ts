import { EditorSession } from './editor-session';
import {
  containerFromFlat,
  flatView,
  newNodeId,
  ContainerDraft,
  ChildNode,
  ElementNode,
  fieldNode,
  containers,
  childName,
  moveChild,
  parentOf,
  updateContainer,
  allowedInContainer,
  findContainer,
} from '../model/container-draft';
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
  readContainer,
  buildContainer,
  containerPreview,
  newContainer,
  templateToJson,
  templateToYaml,
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

  readonly document = computed(() => ({
    ...this.session.document(),
    identifier: this.session.document().identifier || this.mintedIdentifier(),
  }));
  readonly template = computed(() => buildContainer(this.document()));
  readonly previewJson = computed(() => templateToJson(containerPreview(this.document())));
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
    if (!this.canAddField(type)) {
      this.loadError.set('Page breaks can only be placed in templates.');
      return;
    }
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

    this.insertNode(fieldNode(newField), position);

    this.showPicker.set(null);
    this.selectedField.set(newField.id);

    this.scrollRequest.set(newField.id);
  }

  addCustomFieldToTemplate(customField: CustomField, position: number) {
    if (!this.canAddField(customField.definition.type)) {
      this.loadError.set('Page breaks can only be placed in templates.');
      return;
    }
    const newField: Field = {
      ...structuredClone(customField.definition),
      id: newNodeId(),
      customFieldId: customField.id,
      libraryId: customField.libraryId,
    };

    this.insertNode(fieldNode(newField), position);

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
    if (!this.canAddField(type)) {
      this.loadError.set('Page breaks can only be placed in templates.');
      return;
    }
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
    if (!this.canAddField(customField.definition.type)) {
      this.loadError.set('Page breaks can only be placed in templates.');
      return;
    }
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
    if (
      changes.deploymentName !== undefined &&
      this.children().some((node) => node.id !== id && childName(node) === changes.deploymentName?.trim())
    )
      return 'Another child already uses that property name.';
    const current = this.fields().find((field) => field.id === id);
    if (current && !this.canAddField(changes.type ?? current.type))
      return 'Page breaks can only be placed in templates.';
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

  resetTemplate(kind: 'template' | 'element' = 'template') {
    this.loadError.set(null);
    this.mintedIdentifier.set(newTemplateIdentifier());
    const document = newContainer(kind);
    if (kind === 'template') {
      document.identifier = '';
      document.children = containerFromFlat({ ...document, fields: starterFields() }).children;
    }
    this.session.replace(document);
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

    let state: ContainerDraft;
    try {
      state = readContainer(source as string | object);
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
      throw error;
    }
    this.loadError.set(null);

    this.session.replace(state);
    this.markSaved();
  }
  readonly children = computed(() => this.session.active().children);
  readonly containerChoices = computed(() => containers(this.session.document()));
  readonly hasElements = computed(() => this.containerChoices().length > 1);
  readonly breadcrumbs = computed(() => {
    const active = this.session.active().id;
    const path: ContainerDraft[] = [];
    let current = this.session.active();
    path.unshift(current);
    while (current.id !== this.session.document().id) {
      const parent = parentOf(this.session.document(), current.id);
      if (!parent) break;
      path.unshift(parent);
      current = parent;
    }
    return active === this.session.document().id ? [this.session.document()] : path;
  });
  canAddField(type: string): boolean {
    return allowedInContainer(type, this.session.active().kind);
  }
  openContainer(id: number): void {
    if (!this.containerChoices().some((choice) => choice.id === id)) return;
    this.session.activeId.set(id);
    this.showPicker.set(null);
    this.selectedField.set(null);
    this.fieldTypeDropdown.set(null);
  }
  private insertNode(node: ChildNode, position: number, targetId = this.session.active().id): void {
    const target = findContainer(this.session.document(), targetId);
    if (!target) throw new Error('The import destination no longer exists.');
    this.loadError.set(null);
    const used = new Set(target.children.map(childName));
    const base = childName(node).trim() || (node.kind === 'element' ? 'Element' : 'Field');
    let name = base;
    for (let suffix = 2; used.has(name); suffix++) name = `${base} ${suffix}`;
    node =
      node.kind === 'field' &&
      node.placement.deploymentName === undefined &&
      node.definition.customFieldId === undefined
        ? { ...node, definition: { ...node.definition, name } }
        : { ...node, placement: { ...node.placement, deploymentName: name } };
    this.session.document.update((root) =>
      updateContainer(root, targetId, (container) => {
        const children = [...container.children];
        children.splice(Math.max(0, Math.min(position, children.length)), 0, node);
        return { ...container, children };
      }),
    );
  }

  addElement(): void {
    const definition = newContainer('element', 'Element');
    this.insertNode(
      {
        kind: 'element',
        id: definition.id,
        definition,
        placement: { status: 'optional', allowMultiple: false, propertyIri: newFieldIdentity().propertyIri },
      },
      this.children().length,
    );
  }
  importElement(source: string | object, targetId = this.session.active().id): void {
    const definition = readContainer(source);
    if (definition.kind !== 'element') throw new Error('Choose an element document to insert into this container.');
    // Import is an independent local copy retaining its source artifact identity.
    this.insertNode(
      {
        kind: 'element',
        id: definition.id,
        definition,
        placement: { status: 'optional', allowMultiple: false, propertyIri: newFieldIdentity().propertyIri },
      },
      Number.MAX_SAFE_INTEGER,
      targetId,
    );
  }
  duplicateElement(id: number): void {
    const node = this.children().find((child): child is ElementNode => child.kind === 'element' && child.id === id);
    if (!node) return;
    const clone = (source: ChildNode): ChildNode => {
      const copy = structuredClone(source);
      copy.id = newNodeId();
      copy.placement.propertyIri = newFieldIdentity().propertyIri;
      const resetMetadata = (metadata: NonNullable<Field['artifact']>, sourceId: string) => ({
        ...metadata,
        publicationStatus: 'bibo:draft' as const,
        version: '0.0.1',
        createdOn: null,
        createdBy: null,
        modifiedOn: null,
        modifiedBy: null,
        derivedFrom: sourceId || null,
        previousVersion: null,
      });
      if (copy.kind === 'field') {
        const previousId = copy.definition.atId ?? '';
        copy.definition.atId = newFieldIdentity().atId;
        copy.definition.publishedDefinition = undefined;
        if (copy.definition.artifact) copy.definition.artifact = resetMetadata(copy.definition.artifact, previousId);
      } else {
        const previousId = copy.definition.identifier;
        copy.definition.id = copy.id;
        copy.definition.identifier = newContainer('element').identifier;
        copy.definition.version = '0.0.1';
        if (copy.definition.metadata)
          copy.definition.metadata.artifact = resetMetadata(copy.definition.metadata.artifact, previousId);
        copy.definition.children = copy.definition.children.map(clone);
      }
      return copy;
    };
    try {
      this.insertNode(
        clone({ ...node, definition: readContainer(templateToJson(buildContainer(node.definition))) }),
        this.children().findIndex((child) => child.id === id) + 1,
      );
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
    }
  }

  deleteChild(id: number): void {
    const parent = parentOf(this.session.document(), id);
    if (!parent) return;
    this.session.document.update((root) =>
      updateContainer(root, parent.id, (container) => ({
        ...container,
        children: container.children.filter((node) => node.id !== id),
      })),
    );
    if (!this.containerChoices().some((choice) => choice.id === this.session.activeId())) this.openContainer(parent.id);
  }
  moveChild(id: number, targetId: number, index = Number.MAX_SAFE_INTEGER): void {
    try {
      this.session.document.update((root) => moveChild(root, id, targetId, index));
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
    }
  }
  updateElementPlacement(id: number, placement: ElementNode['placement']): string | null {
    const parent = parentOf(this.session.document(), id);
    if (!parent) return 'The element no longer exists.';
    const name = placement.deploymentName?.trim();
    if (!name) return 'A property name is required.';
    if (parent.children.some((node) => node.id !== id && childName(node) === name))
      return 'Another child already uses that property name.';
    const next = updateContainer(this.session.document(), parent.id, (container) => ({
      ...container,
      children: container.children.map((node) =>
        node.id === id ? { ...node, placement: { ...placement, deploymentName: name } } : node,
      ),
    }));
    try {
      buildContainer(next);
      this.session.document.set(next);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
}
