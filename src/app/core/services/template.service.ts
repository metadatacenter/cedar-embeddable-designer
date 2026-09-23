import { childKeyError } from '../model/child-key-policy';
import { reducePrecision } from '../model/precision-change';
import { artifactNameError, validateDocument } from '../model/document-validation';
import { CedChildSource, CedJsonObject, CedValidationIssue } from '../../ced-public-api';
import { EditorSession } from './editor-session';
import {
  containerFromFlat,
  flatView,
  newNodeId,
  ContainerDraft,
  ChildNode,
  ElementNode,
  fieldNode,
  fieldView,
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
import { Field, FieldDefaultValue, CustomField, ControlledTermSet, UserPreferences } from '../models/types';
import { PreferencesService } from './preferences.service';
import {
  DesignerTemplate,
  deploymentKeys,
  buildTemplate,
  newFieldIdentity,
  newTemplateIdentifier,
  readContainer,
  readField,
  buildContainer,
  containerPreview,
  newContainer,
  templateToJson,
  templateToYaml,
  defaultValueError,
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
      options: ['Option A', 'Option B'],
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
  private readonly automaticKeys = new Set<number>();

  private generatedKey(id: number, name: string): string {
    const base = name.trim().toLowerCase().replace(/\s+/g, '_') || 'field';
    let key = base;
    for (let suffix = 2; this.keyError(id, key); suffix++) key = `${base}_${suffix}`;
    return key;
  }

  // Inject PreferencesService
  readonly preferencesService = inject(PreferencesService);

  /** A standalone field has no container-owned placement settings. */
  readonly fieldDocumentMode = signal(false);

  readonly fieldEditorConfig = signal<{ bridgeBaseUrl?: string; terminologyBaseUrl?: string }>({});

  readonly session = new EditorSession(
    containerFromFlat({
      name: '',
      description: '',
      identifier: '',
      version: '0.0.1',
      fields: starterFields(),
    }),
  );
  readonly templateName = this.session.property('name');
  readonly templateDesc = this.session.property('description');
  readonly templateSchemaIdentifier = this.session.property('schemaIdentifier');
  readonly templateVersion = this.session.property('version');
  readonly loadError = signal<string | null>(null);
  private readonly draftIssues = signal<Record<string, { message: string; tab: string }>>({});
  readonly nameFocusRequest = signal<number | null>(null);
  readonly initialInsertionId = signal<number | null>(null);
  private readonly touchedNames = signal<ReadonlySet<number>>(new Set());
  touchName(id: number): void {
    this.touchedNames.update((ids) => new Set([...ids, id]));
  }
  nameError(id: number, name: string, kind: 'field' | 'element' | 'template'): string | null {
    return this.touchedNames().has(id) ? artifactNameError(name, kind) : null;
  }
  readonly visibleIssues = computed(() =>
    this.validationReport().issues.filter((issue) => issue.setting !== 'name' || this.touchedNames().has(issue.nodeId)),
  );
  visibleIssuesFor(id: number): CedValidationIssue[] {
    return this.visibleIssues().filter((issue) => issue.path.includes(id));
  }
  tabHasErrors(id: number, tab: string): boolean {
    return this.visibleIssues().some((issue) => issue.nodeId === id && issue.setting !== 'name' && issue.tab === tab);
  }
  readonly validationTarget = signal<CedValidationIssue | null>(null);
  setSettingsError(id: number, setting: string, message: string | null, tab = 'Constraints'): void {
    const key = `${id}:${setting}`;
    this.draftIssues.update((previous) => {
      if (previous[key]?.message === message && previous[key]?.tab === tab) return previous;
      if (!message && !previous[key]) return previous;
      const next = { ...previous };
      if (message) next[key] = { message, tab };
      else delete next[key];
      return next;
    });
  }
  readonly validationReport = computed(() => validateDocument(this.document(), this.draftIssues()));
  issuesFor(id: number): CedValidationIssue[] {
    return this.validationReport().issues.filter((issue) => issue.path.includes(id));
  }
  revealIssue(issue: CedValidationIssue): void {
    if (issue.setting === 'name') this.touchName(issue.nodeId);
    this.openContainer(this.parentContainerId(issue.nodeId));
    this.selectedField.set(issue.nodeId);
    this.scrollRequest.set(issue.nodeId);
    this.validationTarget.set({ ...issue });
  }
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
    const field = this.fieldsFor(id)().find((field) => field.id === id);
    if (field) {
      this.libraryDraft.set(structuredClone(field));
      this.showFieldDesigner.set(true);
    }
  }
  readonly selectedField = signal<number | null>(null);
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

  /** Field edits are addressed by node identity, never by the last selected container. */
  parentContainerId(id: number): number {
    return parentOf(this.session.document(), id)?.id ?? this.session.active().id;
  }
  private fieldsFor(id: number) {
    return this.session.fieldBinding(this.parentContainerId(id));
  }
  updateContainerDefinition(
    id: number,
    changes: Partial<
      Pick<
        ContainerDraft,
        'name' | 'description' | 'schemaIdentifier' | 'version' | 'metadata' | 'preferredLabel' | 'alternateLabels'
      >
    >,
  ): void {
    if (changes.name !== undefined && this.automaticKeys.has(id)) {
      const parent = parentOf(this.session.document(), id);
      if (parent) {
        const deploymentName = this.generatedKey(id, changes.name);
        this.session.document.update((root) =>
          updateContainer(root, parent.id, (container) => ({
            ...container,
            children: container.children.map((child) =>
              child.id === id && child.kind === 'element'
                ? { ...child, placement: { ...child.placement, deploymentName } }
                : child,
            ),
          })),
        );
      }
    }
    this.session.document.update((root) => updateContainer(root, id, (container) => ({ ...container, ...changes })));
  }
  readonly collapsedElements = signal<ReadonlySet<number>>(new Set());
  expandAllElements(): void {
    this.collapsedElements.set(new Set());
  }
  collapseAllElements(): void {
    this.collapsedElements.set(
      new Set(
        this.containerChoices()
          .filter((choice) => choice.id !== this.session.document().id && this.hasChildren(choice.id))
          .map((choice) => choice.id),
      ),
    );
  }
  toggleElement(id: number): void {
    if (!this.hasChildren(id)) return;
    this.collapsedElements.update((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  private hasChildren(id: number): boolean {
    return !!findContainer(this.session.document(), id)?.children.length;
  }

  private pruneCollapsed(): void {
    this.collapsedElements.update((ids) => new Set([...ids].filter((id) => this.hasChildren(id))));
  }

  // Field manipulation methods
  addField(type: string, position: number, targetId = this.session.active().id) {
    if (!this.canAddField(type, targetId)) {
      this.loadError.set('Page breaks can only be placed in templates.');
      return;
    }
    const newField: Field = {
      id: newNodeId(),
      ...newFieldIdentity(),
      type,
      name: '',
      status: 'optional',
      options: type === 'multipleChoice' || type === 'checkboxes' ? [''] : [],
      defaultValue: { kind: 'none' },
      allowMultiple: false,
    };

    this.automaticKeys.add(newField.id);
    this.insertNode(fieldNode(newField), position, targetId, false);
    this.nameFocusRequest.set(newField.id);

    this.showPicker.set(null);
    this.selectedField.set(newField.id);

    this.scrollRequest.set(newField.id);
  }

  addCustomFieldToTemplate(customField: CustomField, position: number, targetId = this.session.active().id) {
    if (!this.canAddField(customField.definition.type, targetId)) {
      this.loadError.set('Page breaks can only be placed in templates.');
      return;
    }
    const newField: Field = {
      ...structuredClone(customField.definition),
      id: newNodeId(),
      customFieldId: customField.id,
      libraryId: customField.libraryId,
    };

    this.insertNode(fieldNode(newField), position, targetId);

    this.showPicker.set(null);
    this.selectedField.set(newField.id);

    this.scrollRequest.set(newField.id);
  }

  deleteField(id: number) {
    if (this.isPublished(id)) return;
    this.fieldsFor(id).update((prev) => prev.filter((f) => f.id !== id));
    this.pruneCollapsed();
    if (this.selectedField() === id) {
      this.selectedField.set(null);
    }
  }

  updateFieldName(id: number, name: string) {
    if (this.isPublished(id)) return;
    const deploymentName = this.automaticKeys.has(id) ? this.generatedKey(id, name) : undefined;
    this.fieldsFor(id).update((prev) =>
      prev.map((f) => (f.id === id ? { ...f, name, ...(deploymentName ? { deploymentName } : {}) } : f)),
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
    this.fieldsFor(id).update((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
  }

  updateOption(fieldId: number, optionIndex: number, value: string) {
    if (this.isPublished(fieldId)) return;
    this.fieldsFor(fieldId).update((prev) =>
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
    this.fieldsFor(fieldId).update((prev) =>
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
    this.fieldsFor(fieldId).update((prev) =>
      prev.map((f) => {
        if (f.id === fieldId) {
          const newOptions = f.options.filter((_, index) => index !== optionIndex);
          return {
            ...f,
            options: newOptions,
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
    return !!this.fieldsFor(id)().find((field) => field.id === id)?.publishedDefinition;
  }

  childKey(id: number): string {
    const siblings = parentOf(this.session.document(), id)?.children ?? [];
    const keys = deploymentKeys(
      siblings.map((node) => ({
        name: node.definition.name,
        deploymentName: node.placement.deploymentName,
      })),
    );
    return keys[siblings.findIndex((node) => node.id === id)] ?? '';
  }

  private keyError(id: number, value: string): string | null {
    const key = value.trim();
    const siblings = parentOf(this.session.document(), id)?.children ?? [];
    const node = siblings.find((child) => child.id === id);
    const invalid = childKeyError(key, node?.kind === 'field' && fieldView(node).type === 'attributeValue');
    if (invalid) return invalid;
    return siblings.some((node) => node.id !== id && this.childKey(node.id) === key)
      ? 'Another child in this container already uses that key.'
      : null;
  }

  updateFieldSettings(id: number, changes: Partial<Field>): string | null {
    if (this.isPublished(id)) return 'Published fields are read-only. Editing a draft version is not available yet.';
    if (changes.deploymentName !== undefined) {
      const error = this.keyError(id, changes.deploymentName);
      if (error) return error;
      this.automaticKeys.delete(id);
      changes = { ...changes, deploymentName: changes.deploymentName.trim() };
    }
    const current = this.fieldsFor(id)().find((field) => field.id === id);
    if (current && !this.canAddField(changes.type ?? current.type, this.parentContainerId(id)))
      return 'Page breaks can only be placed in templates.';
    if (current) changes = reducePrecision(current, changes);
    if (current && changes.temporal?.timezoneEnabled === false) {
      const value = changes.defaultValue ?? current.defaultValue;
      if (value.kind === 'temporal') {
        changes = { ...changes, defaultValue: { ...value, value: value.value.replace(/(?:Z|[+-]\d{2}:\d{2})$/, '') } };
      }
    }
    if (current) {
      const error = defaultValueError({ ...current, ...changes }, changes.defaultValue ?? current.defaultValue);
      if (error) return error;
    }
    const fields = this.fieldsFor(id)().map((field) => (field.id === id ? { ...field, ...changes } : field));
    try {
      buildTemplate({
        name: this.templateName(),
        description: this.templateDesc(),
        identifier: '',
        version: '0.0.1',
        fields,
      });
      this.fieldsFor(id).set(fields);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  updateDefaultValue(id: number, value: FieldDefaultValue) {
    if (this.isPublished(id)) return;
    this.fieldsFor(id).update((prev) =>
      prev.map((f) =>
        f.id === id && defaultValueError(f, value) === null
          ? { ...f, defaultValue: value, importedChoiceDefault: undefined }
          : f,
      ),
    );
  }

  toggleAllowMultiple(id: number) {
    if (this.isPublished(id)) return;
    this.fieldsFor(id).update((prev) => prev.map((f) => (f.id === id ? { ...f, allowMultiple: !f.allowMultiple } : f)));
  }

  /** The one value a static field shows. */
  updateContent(id: number, content: string) {
    if (this.isPublished(id)) return;
    this.fieldsFor(id).update((prev) => prev.map((f) => (f.id === id ? { ...f, content } : f)));
  }

  updateHelpText(id: number, helpText: string) {
    if (this.isPublished(id)) return;
    this.fieldsFor(id).update((prev) => prev.map((f) => (f.id === id ? { ...f, helpText } : f)));
  }

  updateControlledTermConstraints(id: number, constraints: ControlledTermSet) {
    if (this.isPublished(id)) return;
    this.fieldsFor(id).update((prev) =>
      prev.map((f) => (f.id === id ? { ...f, controlledTermConstraints: constraints } : f)),
    );
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

  resetTemplate(kind: 'template' | 'element' = 'template', withStarterFields = true) {
    this.loadError.set(null);
    this.mintedIdentifier.set(newTemplateIdentifier());
    const document = newContainer(kind);
    this.initialInsertionId.set(kind === 'template' && !withStarterFields ? document.id : null);
    if (kind === 'template') {
      document.identifier = '';
      document.children = withStarterFields ? containerFromFlat({ ...document, fields: starterFields() }).children : [];
    }
    this.draftIssues.set({});
    this.touchedNames.set(new Set());
    this.nameFocusRequest.set(null);
    this.childPicker.set(null);
    this.session.replace(document);
    this.collapsedElements.set(new Set());
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

    this.initialInsertionId.set(null);
    this.draftIssues.set({});
    this.touchedNames.set(new Set());
    this.nameFocusRequest.set(null);
    this.childPicker.set(null);
    this.session.replace(state);
    this.collapsedElements.set(new Set());
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
  canAddField(type: string, targetId = this.session.active().id): boolean {
    return allowedInContainer(
      type,
      findContainer(this.session.document(), targetId)?.kind ?? this.session.active().kind,
    );
  }
  openContainer(id: number): void {
    if (!this.containerChoices().some((choice) => choice.id === id)) return;
    this.session.activeId.set(id);
    this.collapsedElements.update((previous) => {
      const next = new Set(previous);
      let current = findContainer(this.session.document(), id);
      while (current) {
        next.delete(current.id);
        current = parentOf(this.session.document(), current.id);
      }
      return next;
    });
    this.scrollRequest.set(id);
    this.showPicker.set(null);
    this.selectedField.set(null);
  }
  private insertNode(
    node: ChildNode,
    position: number,
    targetId = this.session.active().id,
    namePlacement = true,
  ): void {
    const target = findContainer(this.session.document(), targetId);
    if (!target) throw new Error('The import destination no longer exists.');
    this.loadError.set(null);
    if (namePlacement) {
      const used = new Set(target.children.map((child) => this.childKey(child.id)));
      const base =
        childName(node).trim().toLowerCase().replace(/\s+/g, '_') || (node.kind === 'element' ? 'element' : 'field');
      let name = base;
      for (let suffix = 2; used.has(name); suffix++) name = `${base}_${suffix}`;
      if (node.kind === 'field') {
        node = { ...node, placement: { ...node.placement, deploymentName: name } };
      } else {
        // Branching on the kind keeps each placement its own type; one spread over the union loses
        // which of the two it is, and an element's placement is the narrower of them.
        node = { ...node, placement: { ...node.placement, deploymentName: name } };
      }
    }
    this.session.document.update((root) =>
      updateContainer(root, targetId, (container) => {
        const children = [...container.children];
        children.splice(Math.max(0, Math.min(position, children.length)), 0, node);
        return { ...container, children };
      }),
    );
  }

  readonly childSource = signal<CedChildSource | null>(null);
  readonly childPicker = signal<{ targetId: number; position: number; type?: 'field' | 'element' } | null>(null);
  openChildPicker(
    targetId = this.session.active().id,
    position = this.session.active().children.length,
    type?: 'field' | 'element',
  ): void {
    this.showPicker.set(null);
    this.childPicker.set({ targetId, position, type });
  }

  /** Parse the complete batch before changing the document. Source definitions keep their identity. */
  importChildren(
    sources: { type: 'field' | 'element'; artifact: CedJsonObject }[],
    targetId: number,
    position: number,
  ): void {
    const root = this.session.document();
    const target = findContainer(root, targetId);
    if (!target) throw new Error('The destination no longer exists.');
    const nodes = sources.map(({ type, artifact }): ChildNode => {
      if (type === 'field') {
        const field = readField(JSON.stringify(artifact));
        if (!allowedInContainer(field.type, target.kind))
          throw new Error('Page breaks can only be placed in templates.');
        return fieldNode({
          ...field,
          id: newNodeId(),
          deploymentName: field.name,
          propertyIri: newFieldIdentity().propertyIri,
        });
      }
      const definition = readContainer(artifact);
      if (definition.kind !== 'element') throw new Error('Choose a field or element artifact.');
      return {
        kind: 'element',
        id: definition.id,
        definition,
        placement: { allowMultiple: false, propertyIri: newFieldIdentity().propertyIri },
      };
    });
    try {
      nodes.forEach((node, index) => this.insertNode(node, position + index, targetId));
    } catch (error) {
      this.session.document.set(root);
      throw error;
    }
  }

  addElement(targetId = this.session.active().id, position = Number.MAX_SAFE_INTEGER): number {
    const definition = newContainer('element');
    this.automaticKeys.add(definition.id);
    this.insertNode(
      {
        kind: 'element',
        id: definition.id,
        definition,
        placement: { allowMultiple: false, propertyIri: newFieldIdentity().propertyIri },
      },
      position,
      targetId,
      false,
    );
    this.openContainer(targetId);
    this.scrollRequest.set(definition.id);
    this.nameFocusRequest.set(definition.id);
    return definition.id;
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
        placement: { allowMultiple: false, propertyIri: newFieldIdentity().propertyIri },
      },
      Number.MAX_SAFE_INTEGER,
      targetId,
    );
  }
  duplicateElement(id: number): void {
    const parent = parentOf(this.session.document(), id);
    const node = parent?.children.find((child): child is ElementNode => child.kind === 'element' && child.id === id);
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
        parent!.children.findIndex((child) => child.id === id) + 1,
        parent!.id,
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
    this.pruneCollapsed();
    if (!this.containerChoices().some((choice) => choice.id === this.session.activeId())) this.openContainer(parent.id);
  }
  moveChild(id: number, targetId: number, index = Number.MAX_SAFE_INTEGER): void {
    try {
      this.session.document.update((root) => moveChild(root, id, targetId, index));
      this.pruneCollapsed();
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
    }
  }
  updateElementPlacement(id: number, placement: ElementNode['placement']): string | null {
    const parent = parentOf(this.session.document(), id);
    if (!parent) return 'The element no longer exists.';
    const name = placement.deploymentName?.trim();
    if (name !== undefined) {
      const error = this.keyError(id, name);
      if (error) return error;
      this.automaticKeys.delete(id);
    }
    const next = updateContainer(this.session.document(), parent.id, (container) => ({
      ...container,
      children: container.children.map((node) =>
        node.id === id && node.kind === 'element'
          ? { ...node, placement: { ...placement, deploymentName: name } }
          : node,
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
