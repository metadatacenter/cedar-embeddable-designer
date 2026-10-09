import {
  elementDisplayDescription,
  elementDisplayName,
  fieldDisplayDescription,
  fieldDisplayName,
} from '../model/field-display-name';
import { childLocks } from '../model/child-locks';
import { fieldSetting, ValidationCoordinator } from './validation-coordinator';
import { CedChildSource, CedJsonObject, CedValidationIssue } from '../../ced-public-api';
import { EditorSession } from './editor-session';
import { TerminologyService } from './terminology.service';
import { TerminologyEditCommands } from './terminology-edit-commands';
import {
  containerFromFlat,
  newNodeId,
  ContainerDraft,
  ChildNode,
  ElementNode,
  fieldNode,
  containers,
  isPlacementKey,
  moveChild,
  parentOf,
  updateContainer,
  allowedInContainer,
  findContainer,
} from '../model/container-draft';
import { FieldLibraryService } from './field-library.service';
import { deploymentKeys, keyedChild } from '../model/child-key-policy';
import { CedLanguageService } from '../../i18n/ced-language.service';
import { SETTINGS_TABS } from '../../shared/settings-tabs';
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
  PREVIEW_ELEMENT_KEY,
  newContainer,
  templateToJson,
} from '../model/cedar-template';

export { FIELD_TYPES } from '../models/types';

/** Every container and child whose name the author can see, throughout the document. */
/**
 * What a child brought into a parent from elsewhere takes from itself: its display name and
 * display description are its own name and description. Its key is its name too, which
 * `takeKeyFromName` gives it once the child is in place.
 */
function copiedPlacement(name: string, description: string) {
  return { displayLabel: name, displayDescription: description };
}

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
 *
 * Each is keyed by its name, as a new child is once it has been named, so renaming one leaves its key
 * where it is.
 */
function starterFields(): Field[] {
  return [
    {
      id: 1,
      ...newFieldIdentity(),
      type: 'text',
      name: 'Title',
      deploymentName: 'Title',
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
      deploymentName: 'Category',
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
      deploymentName: 'Publication Date',
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
  /**
   * The children whose key still follows their name: a new child, until its name first loses focus.
   * After that the key is the author's, and a rename leaves it where it is.
   */
  private readonly automaticKeys = new Set<number>();

  /**
   * The key a child takes from its name: the name as written, which is CEDAR's convention, or none
   * while the child has no name, so an unnamed child is not reported for a blank key. A name that
   * clashes with a sibling's key, or is reserved, is kept and reported, so the author sees it.
   */
  private generatedKey(name: string): string | undefined {
    return name.trim() || undefined;
  }
  /** Set while a key is taken from a name, which is not the author choosing one. */
  private takingKey = false;

  /**
   * Gives a child the key its name gives. A key the parent accepts lands; one that clashes or is
   * reserved stays as a pending edit, reported at once, while the child keeps a usable key.
   */
  private takeKeyFromName(id: number, name: string): void {
    // A field designed on its own has no parent to key it in.
    if (this.fieldDocumentMode()) return;
    const node = parentOf(this.session.document(), id)?.children.find((child) => child.id === id);
    if (!node) return;
    const deploymentName = this.generatedKey(name);
    this.takingKey = true;
    try {
      if (node.kind === 'element') this.updateElementPlacement(id, { deploymentName }, 'key');
      else this.updateFieldSettings(id, { deploymentName });
    } finally {
      this.takingKey = false;
    }
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
    if ('deploymentName' in changes && !this.takingKey) this.automaticKeys.delete(id);
  });
  readonly terminologyEdits = new TerminologyEditCommands(this, inject(TerminologyService), this.i18n);
  readonly nameFocusRequest = signal<number | null>(null);
  readonly initialInsertionId = signal<number | null>(null);
  touchName(id: number): void {
    this.validation.touchName(id);
    const node = parentOf(this.session.document(), id)?.children.find((child) => child.id === id);
    if (node?.definition.name.trim()) this.automaticKeys.delete(id);
  }
  /** Whether a child's own definition can no longer change: it is published, or inside a published element. */
  definitionLocked(id: number): boolean {
    return childLocks(this.session.document(), id).definition;
  }
  /** Whether a child's placement in its parent can no longer change: it is inside a published element. */
  placementLocked(id: number): boolean {
    return childLocks(this.session.document(), id).placement;
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
  /**
   * The problems the designer points at: the validation report's, or none while the designer is read
   * only. A reader can fix none of them, and the report itself still names them all to the host.
   */
  readonly displayedIssues = computed(() => (this.validation.readOnly() ? [] : this.validationReport().issues));
  readonly visibleIssues = computed(() => this.displayedIssues().filter((issue) => issue.shown));
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
    if (this.validation.readOnly()) return null;
    return (
      this.validation.error(id, setting) ??
      this.displayedIssues().find(
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
    if (this.definitionLocked(id)) return;
    this.session.document.update((root) => updateContainer(root, id, (container) => ({ ...container, ...changes })));
    if (changes.name !== undefined && this.automaticKeys.has(id)) this.takeKeyFromName(id, changes.name);
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
    if (this.definitionLocked(targetId)) return;
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
    this.insertNode(fieldNode(newField), position, targetId);
    if (newField.options[0] === '') this.validation.startOption(newField.id);
    this.nameFocusRequest.set(newField.id);

    this.showPicker.set(null);
    this.selectedField.set(newField.id);

    this.scrollRequest.set(newField.id);
  }

  addCustomFieldToTemplate(customField: CustomField, position: number, targetId = this.session.active().id) {
    if (this.definitionLocked(targetId)) return;
    if (!this.canAddField(customField.definition.type, targetId)) {
      this.loadError.set(this.i18n.t('errors.pageBreakPlacement'));
      return;
    }
    const definition = structuredClone(customField.definition);
    const newField: Field = {
      ...definition,
      ...copiedPlacement(definition.name, definition.helpText ?? ''),
      deploymentName: undefined,
      id: newNodeId(),
      customFieldId: customField.id,
      libraryId: customField.libraryId,
    };

    this.insertNode(fieldNode(newField), position, targetId);
    this.takeKeyFromName(newField.id, newField.name);

    this.showPicker.set(null);
    this.selectedField.set(newField.id);

    this.scrollRequest.set(newField.id);
  }

  deleteField(id: number) {
    if (!this.validation.canPlace(id)) return;
    this.fieldsFor(id).update((prev) => prev.filter((f) => f.id !== id));
    this.pruneCollapsed();
    if (this.selectedField() === id) {
      this.selectedField.set(null);
    }
  }

  private fieldOf(id: number): Field | undefined {
    return this.fieldsFor(id)().find((item) => item.id === id);
  }

  /*
   * A child's display name and description, which its parent shows, and its own name and
   * description, which it holds itself, are one value each while the child is a draft its parent
   * shows as itself. An edit from either side then writes both. A published child keeps its own,
   * and a parent that already shows a child differently keeps doing so: each side then edits its own.
   */
  private fieldNamesSynced(field: Field): boolean {
    return !this.definitionLocked(field.id) && fieldDisplayName(field) === field.name;
  }
  private fieldDescriptionsSynced(field: Field): boolean {
    return !this.definitionLocked(field.id) && fieldDisplayDescription(field) === (field.helpText ?? '');
  }

  /**
   * Renames a field and the name its parent shows it by together. A label repeating the old name,
   * and a preferred label that only repeated it, move with it: CEE would otherwise go on showing
   * the old name.
   */
  private renameField(field: Field, name: string): void {
    this.updateFieldName(field.id, name, {
      ...(field.displayLabel === undefined ? {} : { displayLabel: name }),
      ...(field.preferredLabel !== undefined && field.preferredLabel === field.name ? { preferredLabel: name } : {}),
    });
  }

  /** Edits the name a field shows in its parent, from its header or its Configuration tab. */
  updateFieldDisplayName(id: number, value: string): string | null {
    const field = this.fieldOf(id);
    if (!field) return null;
    // A field designed on its own has no parent, so its header names the field itself.
    if (this.fieldDocumentMode()) {
      this.updateFieldName(id, value);
      return null;
    }
    if (!this.fieldNamesSynced(field)) return this.updateFieldSettings(id, { displayLabel: value });
    this.renameField(field, value);
    return null;
  }

  /** Edits a field's own name, from its Display tab. */
  updateOwnFieldName(id: number, value: string): void {
    const field = this.fieldOf(id);
    if (!field) return;
    if (this.fieldNamesSynced(field)) this.renameField(field, value);
    else this.updateFieldName(id, value);
  }

  /** Edits the description a field shows in its parent, from its Configuration tab. */
  updateFieldDisplayDescription(id: number, value: string): string | null {
    const field = this.fieldOf(id);
    if (!field) return null;
    if (!this.fieldDescriptionsSynced(field)) return this.updateFieldSettings(id, { displayDescription: value });
    this.describeField(field, value);
    return null;
  }

  private describeField(field: Field, helpText: string): void {
    if (!this.validation.canEdit(field.id)) return;
    const displayDescription = field.displayDescription === undefined ? undefined : helpText;
    this.fieldsFor(field.id).update((prev) =>
      prev.map((f) => (f.id === field.id ? { ...f, helpText, displayDescription } : f)),
    );
  }

  private elementNamesSynced(node: ElementNode): boolean {
    return !this.definitionLocked(node.id) && elementDisplayName(node) === node.definition.name;
  }
  private elementDescriptionsSynced(node: ElementNode): boolean {
    return !this.definitionLocked(node.id) && elementDisplayDescription(node) === node.definition.description;
  }

  /** Edits the name an element shows in its parent, from its header or its Configuration tab. */
  updateElementDisplayName(node: ElementNode, value: string): string | null {
    if (!this.elementNamesSynced(node)) return this.updateElementPlacement(node.id, { displayLabel: value }, 'display');
    // A label repeating the old name moves with it, or it would outlive the rename as an override.
    if (node.placement.displayLabel !== undefined) {
      const failure = this.updateElementPlacement(node.id, { displayLabel: value }, 'display');
      if (failure) return failure;
    }
    this.updateContainerDefinition(node.definition.id, { name: value });
    return null;
  }

  /** Edits an element's own name, from its Display tab. */
  updateOwnElementName(node: ElementNode, value: string): void {
    if (this.elementNamesSynced(node)) this.updateElementDisplayName(node, value);
    else this.updateContainerDefinition(node.definition.id, { name: value });
  }

  /** Edits the description an element shows in its parent, from its header or its Configuration tab. */
  updateElementDisplayDescription(node: ElementNode, value: string): string | null {
    if (!this.elementDescriptionsSynced(node))
      return this.updateElementPlacement(node.id, { displayDescription: value }, 'display');
    if (node.placement.displayDescription !== undefined) {
      const failure = this.updateElementPlacement(node.id, { displayDescription: value }, 'display');
      if (failure) return failure;
    }
    this.updateContainerDefinition(node.definition.id, { description: value });
    return null;
  }

  /** Edits an element's own description, from its Display tab. */
  updateOwnElementDescription(node: ElementNode, value: string): void {
    if (this.elementDescriptionsSynced(node)) this.updateElementDisplayDescription(node, value);
    else this.updateContainerDefinition(node.definition.id, { description: value });
  }

  updateFieldName(id: number, name: string, follow: Pick<Partial<Field>, 'displayLabel' | 'preferredLabel'> = {}) {
    if (!this.validation.canEdit(id)) return;
    this.fieldsFor(id).update((prev) => prev.map((f) => (f.id === id ? { ...f, name, ...follow } : f)));
    if (this.automaticKeys.has(id)) this.takeKeyFromName(id, name);
  }

  updateFieldStatus(id: number, status: string) {
    if (!this.validation.canPlace(id)) return;
    this.fieldsFor(id).update((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
  }

  updateOption(fieldId: number, optionIndex: number, value: string) {
    this.touchOption(fieldId, optionIndex);
    if (!this.validation.canEdit(fieldId)) return;
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
    if (!this.validation.canEdit(fieldId)) return;
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
    if (!this.validation.canEdit(fieldId)) return;
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

  /**
   * The property keys from the template to this field or element, which is how the CEE
   * preview addresses it. Null for the template itself, or while two siblings share a key.
   *
   * An element designed on its own is previewed inside a template that holds it under
   * `PREVIEW_ELEMENT_KEY`, so its path starts there.
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
    return search(document, document.kind === 'element' ? [PREVIEW_ELEMENT_KEY] : []);
  }

  childKey(id: number): string {
    const parent = parentOf(this.session.document(), id);
    const siblings = parent?.children ?? [];
    const keys = deploymentKeys(siblings.map(keyedChild), parent?.kind ?? 'template');
    return keys[siblings.findIndex((node) => node.id === id)] ?? '';
  }

  updateFieldSettings(id: number, changes: Partial<Field>): string | null {
    const locks = childLocks(this.session.document(), id);
    const keys = Object.keys(changes);
    if (
      (locks.definition && keys.some((key) => !isPlacementKey(key))) ||
      (locks.placement && keys.some(isPlacementKey))
    )
      return this.i18n.t('errors.publishedReadOnly');
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
    if (!this.validation.canPlace(id)) return;
    const multiple = !this.fieldsFor(id)().find((field) => field.id === id)?.allowMultiple;
    this.fieldsFor(id).update((prev) => prev.map((f) => (f.id === id ? { ...f, allowMultiple: multiple } : f)));
  }

  /** The one value a static field shows. */
  updateContent(id: number, content: string) {
    if (!this.validation.canEdit(id)) return;
    this.fieldsFor(id).update((prev) => prev.map((f) => (f.id === id ? { ...f, content } : f)));
  }

  /** Edits a field's own description, from its Display tab. */
  updateHelpText(id: number, helpText: string) {
    const field = this.fieldOf(id);
    if (!field || !this.validation.canEdit(id)) return;
    if (this.fieldDescriptionsSynced(field)) this.describeField(field, helpText);
    else this.fieldsFor(id).update((prev) => prev.map((f) => (f.id === id ? { ...f, helpText } : f)));
  }

  updateControlledTermConstraints(id: number, constraints: ControlledTermSet) {
    if (!this.validation.canEdit(id)) return;
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
  private insertNode(node: ChildNode, position: number, targetId = this.session.active().id): void {
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
    if (this.definitionLocked(targetId)) throw new LocalizedError(message('errors.publishedReadOnly'));
    const nodes = sources.map(({ type, artifact }): ChildNode => {
      if (type === 'field') {
        const field = readField(JSON.stringify(artifact));
        if (!allowedInContainer(field.type, target.kind))
          throw new LocalizedError(message('errors.pageBreakPlacement'));
        return fieldNode({
          ...field,
          ...copiedPlacement(field.name, field.helpText ?? ''),
          deploymentName: undefined,
          id: newNodeId(),
          propertyIri: newFieldIdentity().propertyIri,
        });
      }
      const definition = readContainer(artifact);
      if (definition.kind !== 'element') throw new LocalizedError(message('errors.chooseFieldOrElement'));
      return {
        kind: 'element',
        id: definition.id,
        definition,
        placement: {
          ...copiedPlacement(definition.name, definition.description),
          allowMultiple: false,
          propertyIri: newFieldIdentity().propertyIri,
        },
      };
    });
    try {
      nodes.forEach((node, index) => this.insertNode(node, position + index, targetId));
      for (const node of nodes) this.takeKeyFromName(node.id, node.definition.name);
    } catch (error) {
      this.session.document.set(root);
      throw error;
    }
  }

  /** Adds an inline element and returns its id, or -1 where the target cannot take one. */
  addElement(targetId = this.session.active().id, position = Number.MAX_SAFE_INTEGER): number {
    if (this.definitionLocked(targetId)) return -1;
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
    );
    this.openContainer(targetId);
    this.scrollRequest.set(definition.id);
    this.nameFocusRequest.set(definition.id);
    return definition.id;
  }
  deleteChild(id: number): void {
    const parent = parentOf(this.session.document(), id);
    if (!parent || !this.validation.canPlace(id)) return;
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
    // A child inside a published element stays where it is, and nothing moves into one.
    if (!this.validation.canPlace(id) || this.definitionLocked(targetId)) return;
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
    tab: string = SETTINGS_TABS.configuration,
  ): string | null {
    return this.validation.submit(id, placement, setting, tab);
  }
}
