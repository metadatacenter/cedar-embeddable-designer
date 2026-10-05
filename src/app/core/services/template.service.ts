import { elementDisplayOverride, fieldDisplayOverride } from '../model/field-display-name';
import { fieldSetting, ValidationCoordinator } from './validation-coordinator';
import { CedChildSource, CedJsonObject, CedValidationIssue } from '../../ced-public-api';
import { EditorSession } from './editor-session';
import {
  containerFromFlat,
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
import { childKeys, deploymentKeys, freshChildKey, keyedChild } from '../model/child-key-policy';
import { CedLanguageService } from '../../i18n/ced-language.service';
import { LocalizedError, message } from '../../i18n/messages';
import { Injectable, signal, computed, inject } from '@angular/core';
import { Field, FieldDefaultValue, CustomField, ControlledTermSet, UserPreferences } from '../models/types';
import { PreferencesService } from './preferences.service';
import {
  newFieldIdentity,
  newTemplateIdentifier,
  readContainer,
  readField,
  buildContainer,
  containerPreview,
  newContainer,
  templateToJson,
} from '../model/cedar-template';

export { FIELD_TYPES } from '../models/types';

/** Every container and child whose name the author can see, throughout the document. */
function namedIds(container: ContainerDraft): number[] {
  return [
    container.id,
    ...container.children.flatMap((node) =>
      node.kind === 'element' ? [node.id, ...namedIds(node.definition)] : [node.id],
    ),
  ];
}

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
  private readonly automaticFieldNames = new Set<number>();

  private generatedKey(id: number, name: string): string {
    const parent = parentOf(this.session.document(), id);
    const node = parent?.children.find((child) => child.id === id);
    const child = node ? keyedChild(node) : { kind: 'field' as const, attributeValue: false };
    return freshChildKey(name, child, parent?.kind ?? 'template', (key) => !!this.keyError(id, key));
  }

  // Inject PreferencesService
  readonly preferencesService = inject(PreferencesService);
  /** The language validation messages and errors are rendered in. */
  private readonly i18n = inject(CedLanguageService);

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
  readonly loadError = signal<string | null>(null);
  readonly validation = new ValidationCoordinator(this.session, this.i18n.t, (id, changes) => {
    if (changes.deploymentName !== undefined) this.automaticKeys.delete(id);
  });
  readonly nameFocusRequest = signal<number | null>(null);
  readonly initialInsertionId = signal<number | null>(null);
  touchName(id: number): void {
    this.validation.touchName(id);
  }
  nameError(id: number, name: string, kind: 'field' | 'element' | 'template'): string | null {
    return this.validation.nameError(id, name, kind);
  }
  touchOption(id: number, index: number): void {
    this.validation.touchOption(id, index);
  }
  optionErrorVisible(id: number, index: number): boolean {
    return this.validation.optionVisible(id, index);
  }
  readonly visibleIssues = computed(() => this.validationReport().issues.filter((issue) => issue.shown));
  visibleIssuesFor(id: number): CedValidationIssue[] {
    return this.visibleIssues().filter((issue) => issue.path.includes(id));
  }
  tabHasErrors(id: number, tab: string): boolean {
    return this.visibleIssues().some((issue) => issue.nodeId === id && issue.setting !== 'name' && issue.tab === tab);
  }
  readonly validationTarget = signal<CedValidationIssue | null>(null);
  setSettingsError(id: number, setting: string, message: string | null, tab = 'Constraints'): void {
    this.validation.setInputError(id, setting, message, tab);
  }
  readonly validationReport = this.validation.report;
  settingError(id: number, setting: string): string | null {
    return (
      this.validation.error(id, setting) ??
      this.validationReport().issues.find(
        (issue) => issue.source === 'model' && issue.nodeId === id && issue.setting === setting,
      )?.message ??
      null
    );
  }
  editingField(field: Field): Field {
    return { ...field, ...this.validation.changes(field.id) };
  }
  revealIssue(issue: CedValidationIssue): void {
    if (issue.setting === 'name') this.touchName(issue.nodeId);
    if (issue.setting === 'option-0') this.touchOption(issue.nodeId, 0);
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

  readonly isDirty = computed(() => this.validation.hasPendingEdits() || this.stateKey() !== this.savedState());

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

  readonly document = computed(() => ({
    ...this.session.document(),
    identifier: this.session.document().identifier || this.mintedIdentifier(),
  }));
  readonly template = computed(() => buildContainer(this.document()));
  readonly previewState = computed(() => {
    try {
      return { artifact: templateToJson(containerPreview(this.document())), error: null };
    } catch (error) {
      return { artifact: null, error: this.i18n.describe(error) };
    }
  });
  readonly previewJson = computed(() => this.previewState().artifact);
  readonly templateJson = computed(() => templateToJson(this.template()));

  readonly fieldLibrary = inject(FieldLibraryService);
  readonly libraries = this.fieldLibrary.libraries;
  readonly customFields = this.fieldLibrary.fields;
  readonly sidebarCollapsed = signal<boolean>(false);

  // Modal & Navigation States
  readonly showPicker = signal<number | null>(null);
  readonly showPreview = signal<boolean>(false);
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
      this.loadError.set(this.i18n.t('errors.pageBreakPlacement'));
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
    this.automaticFieldNames.add(newField.id);
    this.insertNode(fieldNode(newField), position, targetId, false);
    if (newField.options[0] === '') this.validation.startOption(newField.id);
    this.nameFocusRequest.set(newField.id);

    this.showPicker.set(null);
    this.selectedField.set(newField.id);

    this.scrollRequest.set(newField.id);
  }

  addCustomFieldToTemplate(customField: CustomField, position: number, targetId = this.session.active().id) {
    if (!this.canAddField(customField.definition.type, targetId)) {
      this.loadError.set(this.i18n.t('errors.pageBreakPlacement'));
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

  updateFieldDisplayName(id: number, value: string): string | null {
    const field = this.fieldsFor(id)().find((item) => item.id === id);
    if (!field) return null;
    if (this.automaticFieldNames.has(id)) this.updateFieldName(id, value);
    return this.updateFieldSettings(
      id,
      fieldDisplayOverride(field) ? { displayLabel: value } : { preferredLabel: value },
    );
  }

  /**
   * Edits the name an element placement shows, from its header or its Display tab alike: the
   * parent's override where there is one, otherwise the element's own name.
   */
  updateElementDisplayName(node: ElementNode, value: string): string | null {
    if (elementDisplayOverride(node)) {
      return this.updateElementPlacement(node.id, { displayLabel: value }, 'display', 'Display');
    }
    // A filler label repeating the old name would otherwise outlive the rename as an override.
    if (node.placement.displayLabel !== undefined) {
      const failure = this.updateElementPlacement(node.id, { displayLabel: undefined }, 'display', 'Display');
      if (failure) return failure;
    }
    this.updateContainerDefinition(node.definition.id, { name: value });
    return null;
  }

  updateFieldName(id: number, name: string) {
    if (this.isPublished(id)) return;
    const deploymentName = this.automaticKeys.has(id) ? this.generatedKey(id, name) : undefined;
    this.fieldsFor(id).update((prev) =>
      prev.map((f) => (f.id === id ? { ...f, name, ...(deploymentName ? { deploymentName } : {}) } : f)),
    );
  }

  updateFieldStatus(id: number, status: string) {
    if (this.isPublished(id)) return;
    this.fieldsFor(id).update((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
  }

  updateOption(fieldId: number, optionIndex: number, value: string) {
    this.touchOption(fieldId, optionIndex);
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
    this.touchOption(fieldId, optionIndex);
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

  /**
   * The property keys from the template to this field or element, which is how the CEE
   * preview addresses it. Null for the template itself, or while two siblings share a key.
   *
   * An element designed on its own is previewed inside a template that holds it under
   * its name, so its path starts there.
   */
  previewPath(id: number): string[] | null {
    const document = this.session.document();
    const search = (container: ContainerDraft, prefix: string[]): string[] | null => {
      let keys: string[];
      try {
        keys = deploymentKeys(container.children.map(keyedChild), container.kind);
      } catch {
        return null;
      }
      for (const [index, node] of container.children.entries()) {
        const path = [...prefix, keys[index]];
        if (node.id === id) return path;
        if (node.kind === 'element') {
          const found = search(node.definition, path);
          if (found) return found;
        }
      }
      return null;
    };
    return search(document, document.kind === 'element' ? [document.name || 'Element'] : []);
  }

  childKey(id: number): string {
    const parent = parentOf(this.session.document(), id);
    const siblings = parent?.children ?? [];
    const keys = deploymentKeys(siblings.map(keyedChild), parent?.kind ?? 'template');
    return keys[siblings.findIndex((node) => node.id === id)] ?? '';
  }

  private keyError(id: number, value: string): string | null {
    return this.validation.keyError(this.session.document(), id, value);
  }

  updateFieldSettings(id: number, changes: Partial<Field>): string | null {
    if (this.isPublished(id)) return this.i18n.t('errors.publishedReadOnly');
    const current = this.fieldsFor(id)().find((field) => field.id === id);
    if (current && !this.canAddField(changes.type ?? current.type, this.parentContainerId(id)))
      return this.i18n.t('errors.pageBreakPlacement');
    const { setting, tab } = fieldSetting(changes);
    return this.validation.submit(id, changes, setting, tab);
  }

  updateDefaultValue(id: number, value: FieldDefaultValue): string | null {
    return this.updateFieldSettings(id, { defaultValue: value, importedChoiceDefault: undefined });
  }

  toggleAllowMultiple(id: number) {
    if (this.isPublished(id)) return;
    const multiple = !this.fieldsFor(id)().find((field) => field.id === id)?.allowMultiple;
    this.fieldsFor(id).update((prev) => prev.map((f) => (f.id === id ? { ...f, allowMultiple: multiple } : f)));
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
    this.initialInsertionId.set(!withStarterFields ? document.id : null);
    if (kind === 'template') {
      document.identifier = '';
      document.children = withStarterFields ? containerFromFlat({ ...document, fields: starterFields() }).children : [];
    }
    this.validation.reset();
    this.nameFocusRequest.set(null);
    this.childPicker.set(null);
    this.selectedField.set(null);
    this.validationTarget.set(null);
    this.showPicker.set(null);
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
      this.loadError.set(this.i18n.describe(error));
      throw error;
    }
    this.loadError.set(null);

    this.initialInsertionId.set(null);
    // A name the template arrived with is the author's, not a blank the designer has just
    // put in front of them, so a missing one is stated at once. Held back like a new
    // field's, it refused Save with nothing on screen to say why.
    this.validation.reset(namedIds(state));
    this.nameFocusRequest.set(null);
    this.childPicker.set(null);
    this.selectedField.set(null);
    this.validationTarget.set(null);
    this.showPicker.set(null);
    this.session.replace(state);
    this.collapsedElements.set(new Set());
    this.markSaved();
  }
  readonly children = computed(() => this.session.active().children);
  readonly containerChoices = computed(() => containers(this.session.document()));
  readonly hasElements = computed(() => this.containerChoices().length > 1);
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
    if (!target) throw new LocalizedError(message('errors.importDestinationMissing'));
    // Beginning child authoring must explain why Save is blocked even when the
    // author never focused the containing template or element's name.
    for (
      let ancestor: ContainerDraft | undefined = target;
      ancestor;
      ancestor = parentOf(this.document(), ancestor.id)
    ) {
      if (!ancestor.name.trim()) this.touchName(ancestor.id);
    }
    this.loadError.set(null);
    if (namePlacement) {
      // The key a rename would give it, in the container the child joins.
      const used = new Set(childKeys(target.children.map(keyedChild), target.kind));
      const name = freshChildKey(childName(node), keyedChild(node), target.kind, (key) => used.has(key));
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
    if (!target) throw new LocalizedError(message('errors.destinationMissing'));
    const nodes = sources.map(({ type, artifact }): ChildNode => {
      if (type === 'field') {
        const field = readField(JSON.stringify(artifact));
        if (!allowedInContainer(field.type, target.kind))
          throw new LocalizedError(message('errors.pageBreakPlacement'));
        return fieldNode({
          ...field,
          id: newNodeId(),
          deploymentName: field.name,
          propertyIri: newFieldIdentity().propertyIri,
        });
      }
      const definition = readContainer(artifact);
      if (definition.kind !== 'element') throw new LocalizedError(message('errors.chooseFieldOrElement'));
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
      this.loadError.set(this.i18n.describe(error));
    }
  }
  updateElementPlacement(
    id: number,
    placement: Partial<ElementNode['placement']>,
    setting = 'placement',
    tab = 'Occurrences',
  ): string | null {
    return this.validation.submit(id, placement, setting, tab);
  }
}
