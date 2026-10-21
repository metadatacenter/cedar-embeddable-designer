import { DefaultSemanticChecks } from './default-semantic-checks';
import { isBlank, trimInputPadding } from '../model/cedar-model/text-policy';
import { JsonSourcePolicy } from '../model/cedar-template';
import {
  elementDisplayDescription,
  elementDisplayName,
  fieldDisplayDescription,
  fieldDisplayName,
} from '../model/field-display-name';
import { fieldSetting, ValidationCoordinator } from './validation-coordinator';
import {
  CedChildSource,
  CedHostFinding,
  CedJsonObject,
  CedValidationIssue,
  CedRecoveryDraft,
} from '../../ced-public-api';
import { recoveryDocument } from '../model/recovery-document';
import { hostFindings } from '../model/host-findings';
import { retainSessionIds } from '../model/retain-session-ids';
import { EditorSession } from './editor-session';
import { TerminologyService } from './terminology.service';
import { TerminologyEditCommands } from './terminology-edit-commands';
import {
  containerFromFlat,
  newNodeId,
  reserveNodeIds,
  ContainerDraft,
  ChildNode,
  ElementNode,
  fieldNode,
  containers,
  moveChild,
  parentOf,
  updateContainer,
  allowedInContainer,
  findContainer,
} from '../model/container-draft';
import { FieldLibraryService } from './field-library.service';
import { forkedChild, importedChild, replacedChild } from '../model/child-identity';
import { versionState } from '../model/version-state';
import { deploymentKeys, keyedChild } from '../model/child-key-policy';
import { CedLanguageService } from '../../i18n/ced-language.service';
import { SETTINGS_TABS } from '../../shared/settings-tabs';
import { countKey, LocalizedError, message } from '../../i18n/messages';
import { Injectable, signal, computed, inject, effect, DestroyRef } from '@angular/core';
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

/** A control that should take focus once it renders: a child's card, or a container's Add field. */
export type FocusRequest =
  { readonly kind: 'card'; readonly id: number } | { readonly kind: 'add-field'; readonly containerId: number };

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
    .filter((label) => !isBlank(label) && (options.includes(label) || !field.options.includes(label)));
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
    return isBlank(name) ? undefined : trimInputPadding(name);
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
  get fieldDocumentMode() {
    return this.access.fieldDocument;
  }

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
  readonly access = this.session.access;
  readonly templateName = this.session.property('name');
  readonly loadError = signal<string | null>(null);
  readonly validation = new ValidationCoordinator(this.session, this.i18n.t, (id, changes) => {
    if ('deploymentName' in changes && !this.takingKey) this.automaticKeys.delete(id);
  });
  readonly terminologyEdits = new TerminologyEditCommands(this, inject(TerminologyService), this.i18n);
  readonly nameFocusRequest = signal<number | null>(null);
  touchName(id: number): void {
    this.validation.touchName(id);
    const node = parentOf(this.session.document(), id)?.children.find((child) => child.id === id);
    if (node && !isBlank(node.definition.name)) this.automaticKeys.delete(id);
  }
  /** Definition editability, including host access and publication ownership. */
  definitionLocked(id: number): boolean {
    return !this.access.canEditDefinition(id);
  }
  /** Parent-owned placement editability; roots have no placement. */
  placementLocked(id: number): boolean {
    return !this.access.canEditPlacement(id);
  }
  nameError(id: number, name: string, kind: 'field' | 'element' | 'template'): string | null {
    return this.access.readOnly()
      ? null
      : (this.validation.nameError(id, name, kind) ??
          this.displayedIssues().find(
            (issue) => issue.source === 'host' && issue.nodeId === id && issue.setting === 'name',
          )?.message ??
          null);
  }
  touchOption(id: number, index: number): void {
    this.validation.touchOption(id, index);
  }
  optionErrorVisible(id: number, index: number): boolean {
    return !this.access.readOnly() && this.validation.optionVisible(id, index);
  }
  /**
   * Inline authoring markers are hidden during inspection. The separate read-only
   * summary and public report still expose every validation finding.
   */
  readonly displayedIssues = computed(() =>
    this.validation.readOnly() ? [] : this.validationReport().issues.filter((issue) => issue.severity === 'error'),
  );
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
  private readonly hostReport = signal<{ document: ContainerDraft; findings: CedHostFinding[] } | null>(null);
  setHostFindings(findings: CedHostFinding[]): void {
    // Copy host-owned data. No input assignment edits the artifact or pending settings.
    if (
      !Array.isArray(findings) ||
      findings.some(
        (f) =>
          !f ||
          typeof f.location !== 'string' ||
          typeof f.message !== 'string' ||
          !['error', 'warning'].includes(f.severity),
      )
    )
      throw new TypeError('Validation findings require a location, message and error/warning severity');
    const previous = this.hostReport()?.findings ?? [];
    this.hostReport.set(
      findings.length ? { document: this.document(), findings: JsonSourcePolicy.clone(findings) } : null,
    );
    // A host that reports the same set again, or keeps reporting none, says nothing new.
    if (JSON.stringify(findings) === JSON.stringify(previous)) return;
    if (findings.length) this.announce(this.hostFindingsMessage(findings));
    else this.announce(this.i18n.t('announce.hostFindings.cleared'));
  }
  private hostFindingsMessage(findings: CedHostFinding[]): string {
    const counted = (key: string, count: number) => ({ key: countKey(key, count), params: { count } });
    const errors = findings.filter((finding) => finding.severity === 'error').length;
    const warnings = findings.length - errors;
    if (errors && warnings)
      return this.i18n.t('announce.hostFindings.both', {
        errors: counted('announce.hostFindings.errors', errors),
        warnings: counted('announce.hostFindings.warnings', warnings),
      });
    return this.i18n.t('announce.hostFindings.one', {
      issues: errors
        ? counted('announce.hostFindings.errors', errors)
        : counted('announce.hostFindings.warnings', warnings),
    });
  }

  /**
   * What the designer last said to assistive technology, which its one polite live region shows.
   *
   * The region is in the page from the first render, because a screen reader announces a change
   * to a live region it already knows and often misses one that arrives with its text. The text
   * is cleared first and set a moment later, so a message that repeats the last one is read again.
   */
  readonly announcement = signal('');
  private pendingAnnouncement: ReturnType<typeof setTimeout> | undefined;
  private pendingMessage: string | null = null;
  announce(text: string): void {
    this.pendingMessage = text;
    this.show(text);
  }
  /**
   * Say `text` after a message `announce` has not shown yet, rather than in its place. A second
   * call replaces the first one's text and keeps the message.
   */
  announceAfter(text: string): void {
    this.show(this.pendingMessage === null ? text : `${this.pendingMessage} ${text}`);
  }
  private show(text: string): void {
    clearTimeout(this.pendingAnnouncement);
    this.announcement.set('');
    this.pendingAnnouncement = setTimeout(() => {
      this.pendingMessage = null;
      this.announcement.set(text);
    }, 100);
  }

  /**
   * A control to focus once the view has rendered, after an action removed the one that had focus.
   *
   * The service holds the request and the component that renders the control performs it, as with
   * `nameFocusRequest`, because only the component can find the control inside the shadow root.
   */
  readonly focusRequest = signal<FocusRequest | null>(null);

  /** Where focus belongs once `id` is gone: its next sibling, else its previous one, else Add field. */
  focusAfterRemoving(id: number): FocusRequest | null {
    const parent = parentOf(this.session.document(), id);
    if (!parent) return null;
    const index = parent.children.findIndex((child) => child.id === id);
    const sibling = parent.children[index + 1] ?? parent.children[index - 1];
    return sibling ? { kind: 'card', id: sibling.id } : { kind: 'add-field', containerId: parent.id };
  }
  private readonly defaultSemantics = new DefaultSemanticChecks();
  validate() {
    this.defaultSemantics.refreshExpired();
    return this.validationReport();
  }
  readonly validationReport = computed(() => {
    const local = this.validation.report();
    const host = this.hostReport();
    const issues =
      host?.document === this.document()
        ? hostFindings(this.document(), host.findings, this.access.fieldDocument())
        : [];
    const semantic = this.defaultSemantics.inspect(this.session.document(), this.fieldEditorConfig(), this.i18n.t);
    const errors = [...issues, ...semantic.issues].some((issue) => issue.severity === 'error');
    const pendingValidation = !!local.pendingValidation || semantic.pendingValidation;
    const valid =
      local.valid &&
      !errors &&
      !pendingValidation &&
      semantic.semanticChecks.every((check) => check.status === 'passed');
    return {
      ...local,
      valid,
      canSave: local.canSave && !errors && !pendingValidation,
      ...(pendingValidation ? { pendingValidation: true } : {}),
      semanticChecks: semantic.semanticChecks,
      issues: [...local.issues, ...issues, ...semantic.issues],
    };
  });
  revealValidationFinding(location: string): boolean {
    const issue = this.validationReport().issues.find(
      (issue) => issue.source === 'host' && issue.location === location && !issue.unmapped,
    );
    if (!issue) return false;
    this.revealIssue(issue);
    return true;
  }
  settingError(id: number, setting: string): string | null {
    if (this.validation.readOnly()) return null;
    return (
      this.validation.error(id, setting) ??
      this.displayedIssues().find(
        (issue) => issue.source !== 'draft' && issue.nodeId === id && issue.setting === setting,
      )?.message ??
      null
    );
  }
  editingField(field: Field): Field {
    return { ...field, ...this.validation.changes(field.id) };
  }
  revealIssue(issue: CedValidationIssue): void {
    if (!this.access.readOnly()) {
      if (issue.setting === 'name') this.touchName(issue.nodeId);
      if (issue.setting === 'option-0') this.touchOption(issue.nodeId, 0);
    }
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
    inject(DestroyRef).onDestroy(() => {
      this.validation.dispose();
      this.defaultSemantics.dispose();
      clearTimeout(this.pendingAnnouncement);
    });
    effect(() => {
      if (this.validation.readOnly()) {
        this.showPicker.set(null);
        this.childPicker.set(null);
        this.fieldTypeDropdownLibrary.set(null);
      }
    });
    this.markSaved();
  }

  /** Everything a save would write, and nothing that changes on its own. */
  private stateKey(): string {
    return JsonSourcePolicy.stringify(this.session.document());
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
    const definition = JsonSourcePolicy.clone(customField.definition);
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

  /** Removes the field and returns whether it did; a field inside a published element stays. */
  deleteField(id: number): boolean {
    if (!this.validation.canPlace(id)) return false;
    this.fieldsFor(id).update((prev) => prev.filter((f) => f.id !== id));
    this.pruneCollapsed();
    if (this.selectedField() === id) {
      this.selectedField.set(null);
    }
    return true;
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
    if (!this.access.canChange(id, Object.keys(changes))) return this.i18n.t('errors.publishedReadOnly');
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
    if (this.definitionLocked(this.session.active().id)) return;
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

  captureDraft(): CedRecoveryDraft {
    return {
      format: 'cedar-designer-draft',
      version: 1,
      kind: this.fieldDocumentMode() ? 'field' : this.session.document().kind,
      state: JsonSourcePolicy.stringify({
        document: this.session.document(),
        validation: this.validation.captureRecovery(),
        baseline: this.savedState(),
        identifier: this.mintedIdentifier(),
        automaticKeys: [...this.automaticKeys].filter((id) => !!parentOf(this.document(), id)),
      }),
    };
  }
  restoreDraft(draft: CedRecoveryDraft): void {
    if (
      draft?.format !== 'cedar-designer-draft' ||
      draft.version !== 1 ||
      !['template', 'element', 'field'].includes(draft.kind) ||
      (draft.kind === 'field') !== this.fieldDocumentMode()
    )
      throw new Error();
    const parsed = JsonSourcePolicy.parse(draft.state) as unknown as {
      document: unknown;
      baseline: unknown;
      identifier: unknown;
      automaticKeys: unknown;
      validation: Parameters<ValidationCoordinator['restoreRecovery']>[0];
    };
    const { document, maximumId } = recoveryDocument(parsed.document);
    if (
      (draft.kind !== 'field' && draft.kind !== document.kind) ||
      typeof parsed.baseline !== 'string' ||
      typeof parsed.identifier !== 'string' ||
      (draft.kind === 'field' &&
        (document.children.length > 1 || document.children.some((node) => node.kind !== 'field')))
    )
      throw new Error();
    if (
      !Array.isArray(parsed.automaticKeys) ||
      parsed.automaticKeys.some(
        (id: unknown) => typeof id !== 'number' || !Number.isSafeInteger(id) || !parentOf(document, id),
      )
    )
      throw new Error();
    // Validate in a detached session. Invalid author input is allowed; malformed state is not.
    const candidate = new EditorSession(document);
    candidate.access.fieldDocument.set(this.fieldDocumentMode());
    const validation = new ValidationCoordinator(candidate, this.i18n.t);
    try {
      validation.restoreRecovery(parsed.validation);
      validation.report();
    } finally {
      validation.dispose();
    }
    reserveNodeIds(maximumId);
    this.validation.reset();
    this.session.replace(document);
    this.validation.restoreRecovery(parsed.validation);
    this.savedState.set(parsed.baseline);
    this.mintedIdentifier.set(parsed.identifier);
    this.automaticKeys.clear();
    for (const id of parsed.automaticKeys) this.automaticKeys.add(id);
    this.loadError.set(null);
    this.hostReport.set(null);
    this.nameFocusRequest.set(null);
    this.childPicker.set(null);
    this.validationTarget.set(null);
    this.showPicker.set(null);
    this.selectedField.set(null);
    this.collapsedElements.set(new Set());
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
  loadTemplate(source: unknown, preserveView = false): void {
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
    const previous = this.session.document();
    const retainView = preserveView && previous.kind === state.kind;
    if (retainView) state = retainSessionIds(previous, state);
    this.loadError.set(null);

    // A name the template arrived with is the author's, not a blank the designer has just
    // put in front of them, so a missing one is stated at once. Held back like a new
    // field's, it refused Save with nothing on screen to say why.
    this.validation.reset(namedIds(state));
    this.nameFocusRequest.set(null);
    this.childPicker.set(null);
    this.validationTarget.set(null);
    this.showPicker.set(null);
    if (retainView) {
      this.session.document.set(state);
      if (!findContainer(state, this.session.activeId())) this.session.activeId.set(state.id);
      const selected = this.selectedField();
      if (selected !== null && !parentOf(state, selected)) this.selectedField.set(null);
      this.collapsedElements.update((ids) => new Set([...ids].filter((id) => !!findContainer(state, id))));
    } else {
      this.selectedField.set(null);
      this.session.replace(state);
      this.collapsedElements.set(new Set());
    }
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
      if (isBlank(ancestor.name)) this.touchName(ancestor.id);
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
    if (this.definitionLocked(targetId)) return;
    this.childPicker.set({ targetId, position, type });
  }

  /**
   * The child a repository artifact becomes in `target`, placed under its own name. A published
   * artifact is linked and keeps its identifier; a draft becomes a fork with one of its own.
   */
  private childFromArtifact(type: 'field' | 'element', artifact: CedJsonObject, target: ContainerDraft): ChildNode {
    if (type === 'field') {
      const field = readField(JsonSourcePolicy.stringify(artifact));
      if (!allowedInContainer(field.type, target.kind)) throw new LocalizedError(message('errors.pageBreakPlacement'));
      return importedChild(
        fieldNode({
          ...field,
          ...copiedPlacement(field.name, field.helpText ?? ''),
          deploymentName: undefined,
          id: newNodeId(),
          propertyIri: newFieldIdentity().propertyIri,
        }),
      );
    }
    const definition = readContainer(artifact);
    if (definition.kind !== 'element') throw new LocalizedError(message('errors.chooseFieldOrElement'));
    return importedChild({
      kind: 'element',
      id: definition.id,
      definition,
      placement: {
        ...copiedPlacement(definition.name, definition.description),
        allowMultiple: false,
        propertyIri: newFieldIdentity().propertyIri,
      },
    });
  }

  /**
   * Parse the complete batch before changing the document, then return the inserted children's ids
   * in order. Published sources keep their identity; drafts arrive as forks of the version loaded.
   */
  importChildren(
    sources: { type: 'field' | 'element'; artifact: CedJsonObject }[],
    targetId: number,
    position: number,
  ): number[] {
    const root = this.session.document();
    const target = findContainer(root, targetId);
    if (!target) throw new LocalizedError(message('errors.destinationMissing'));
    if (this.definitionLocked(targetId)) throw new LocalizedError(message('errors.publishedReadOnly'));
    const nodes = sources.map(({ type, artifact }) => this.childFromArtifact(type, artifact, target));
    try {
      nodes.forEach((node, index) => this.insertNode(node, position + index, targetId));
      for (const node of nodes) this.takeKeyFromName(node.id, node.definition.name);
    } catch (error) {
      this.session.document.set(root);
      throw error;
    }
    return nodes.map((node) => node.id);
  }

  /**
   * Put stored versions in place of children, keeping each child's placement, in one change to the
   * document. Every artifact is read before anything changes, so one that cannot be read, or a
   * child that can no longer be replaced, leaves the document as it was.
   */
  replaceChildren(replacements: readonly { id: number; type: 'field' | 'element'; artifact: CedJsonObject }[]): void {
    this.replaceNodes(this.replacementNodes(replacements));
  }

  /** Serialize the exact proposed replacement without changing the editing session. */
  replacementPreview(
    replacements: readonly { id: number; type: 'field' | 'element'; artifact: CedJsonObject }[],
  ): CedJsonObject {
    return templateToJson(
      buildContainer(this.withReplacements(this.session.document(), this.replacementNodes(replacements, false))),
    ) as CedJsonObject;
  }

  private replacementNodes(
    replacements: readonly { id: number; type: 'field' | 'element'; artifact: CedJsonObject }[],
    checkAccess = true,
  ): Map<number, ChildNode> {
    const root = this.session.document();
    const nodes = new Map<number, ChildNode>();
    for (const { id, type, artifact } of replacements) {
      const parent = parentOf(root, id);
      const existing = parent?.children.find((child) => child.id === id);
      if (!parent || !existing || (checkAccess && this.placementLocked(id)))
        throw new LocalizedError(message('errors.publishedReadOnly'));
      const replaced = replacedChild(existing, this.childFromArtifact(type, artifact, parent));
      if (!replaced) throw new LocalizedError(message('errors.chooseFieldOrElement'));
      nodes.set(id, replaced);
    }
    return nodes;
  }

  /** Make a linked child an editable fork of the version it links to. Returns whether it did. */
  detachChild(id: number): boolean {
    const existing = parentOf(this.session.document(), id)?.children.find((child) => child.id === id);
    if (!existing || this.placementLocked(id) || versionState(this.session.document(), id)?.kind !== 'linked')
      return false;
    this.replaceNodes(new Map([[id, forkedChild(existing)]]));
    return true;
  }

  private replaceNodes(nodes: ReadonlyMap<number, ChildNode>): void {
    if (!nodes.size) return;
    this.loadError.set(null);
    this.session.document.update((root) => this.withReplacements(root, nodes));
    this.pruneCollapsed();
  }

  private withReplacements(root: ContainerDraft, nodes: ReadonlyMap<number, ChildNode>): ContainerDraft {
    const replace = (container: ContainerDraft): ContainerDraft => ({
      ...container,
      children: container.children.map((node) => {
        const replaced = nodes.get(node.id);
        if (replaced) return replaced;
        return node.kind === 'element' ? { ...node, definition: replace(node.definition) } : node;
      }),
    });
    return replace(root);
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
  /** Removes the child and returns whether it did. */
  deleteChild(id: number): boolean {
    const parent = parentOf(this.session.document(), id);
    if (!parent || !this.validation.canPlace(id)) return false;
    this.session.document.update((root) =>
      updateContainer(root, parent.id, (container) => ({
        ...container,
        children: container.children.filter((node) => node.id !== id),
      })),
    );
    this.pruneCollapsed();
    if (!this.containerChoices().some((choice) => choice.id === this.session.activeId())) this.openContainer(parent.id);
    return true;
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
