import { computed, signal } from '@angular/core';
import { CedValidationReport } from '../../ced-public-api';
import { Translate } from '../../i18n/messages';
import { Field, FieldDefaultValue } from '../models/types';
import { ChildNode, ContainerDraft, fieldNode, fieldView, parentOf, updateContainer } from '../model/container-draft';
import { artifactNameError, DraftIssues, validateDocument } from '../model/document-validation';
import { childKeyError, childKeys, keyedChild } from '../model/child-key-policy';
import { descriptorOf } from '../model/cedar-template';
import { reducePrecision } from '../model/precision-change';
import { EditorSession } from './editor-session';
import { SETTINGS_TABS } from '../../shared/settings-tabs';

interface Edit {
  id: number;
  setting: string;
  tab: string;
  changes: Partial<Field>;
}
export interface ValidationCheck {
  readonly signal: AbortSignal;
  active(): boolean;
  unchanged(): boolean;
  cancel(): void;
}
interface PendingCheck {
  controller: AbortController;
  id: number;
  node: ChildNode | ContainerDraft;
  message: string;
  tab: string;
}
const nodeOf = (document: ContainerDraft, id: number) =>
  document.id === id ? document : parentOf(document, id)?.children.find((child) => child.id === id);

/** The stable setting identity used by controls, pending edits and the public report. */
export function fieldSetting(changes: Partial<Field>): { setting: string; tab: string } {
  if ('deploymentName' in changes) return { setting: 'key', tab: SETTINGS_TABS.fieldMetadata };
  if ('schemaIdentifier' in changes) return { setting: 'identifier', tab: SETTINGS_TABS.fieldMetadata };
  if ('propertyIri' in changes) return { setting: 'propertyIri', tab: SETTINGS_TABS.fieldMetadata };
  if ('annotations' in changes) return { setting: 'annotations', tab: 'Annotations' };
  if ('numeric' in changes) return { setting: 'numeric', tab: 'Constraints' };
  if ('textConstraints' in changes) return { setting: 'textConstraints', tab: 'Constraints' };
  if ('temporal' in changes) return { setting: 'temporal', tab: 'Constraints' };
  if ('minItems' in changes || 'maxItems' in changes) return { setting: 'occurrences', tab: 'Occurrences' };
  if ('width' in changes || 'height' in changes) return { setting: 'media', tab: 'Content' };
  if ('defaultValue' in changes) return { setting: 'defaultValue', tab: 'Constraints' };
  if ('language' in changes) return { setting: 'language', tab: 'Display' };
  if ('alternateLabels' in changes) return { setting: 'alternateLabels', tab: 'Display' };
  return { setting: 'display', tab: 'Display' };
}

const keyOf = (id: number, setting: string) => `${id}:${setting}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Owns pending edits, error visibility and the report for one editor session.
 * Reconciliation runs synchronously at the document boundary, never in a view's
 * change-detection hook. Controls keep input buffers, not independent verdicts.
 */
export class ValidationCoordinator {
  private readonly locked = signal(false);
  readonly readOnly = this.locked.asReadonly();
  private editabilityRevision = 0;
  private readonly edits = signal<Record<string, Edit>>({});
  private readonly inputErrors = signal<
    Record<string, { message: string; tab: string; value?: string | FieldDefaultValue }>
  >({});
  private readonly checks = signal<Record<string, PendingCheck>>({});
  private readonly touchedNames = signal<ReadonlySet<number>>(new Set());
  private readonly quietOptions = signal<ReadonlySet<number>>(new Set());

  constructor(
    private readonly session: EditorSession,
    private readonly t: Translate,
    private readonly accepted: (id: number, changes: Partial<Field>) => void = () => {},
  ) {
    session.reconcile = (document) => this.reconcile(document);
  }

  private readonly draftIssues = computed((): DraftIssues => {
    const issues = { ...this.inputErrors() };
    const document = this.session.document();
    for (const [key, edit] of Object.entries(this.edits())) {
      const result = this.candidate(document, edit.id, edit.changes);
      if (result.error) issues[key] = { message: result.error, tab: edit.tab };
    }
    return issues;
  });
  readonly pendingIssues = computed((): DraftIssues => ({
    ...Object.fromEntries(
      Object.entries(this.checks()).map(([key, check]) => [key, { message: check.message, tab: check.tab }]),
    ),
    ...this.draftIssues(),
  }));
  readonly hasPendingEdits = computed(
    () =>
      Object.keys(this.edits()).length > 0 ||
      Object.keys(this.inputErrors()).length > 0 ||
      Object.keys(this.checks()).length > 0,
  );
  readonly modelReport = computed(() => validateDocument(this.session.document(), {}, this.t));
  readonly report = computed((): CedValidationReport => {
    const pending = this.pendingIssues();
    const report = Object.keys(pending).length
      ? validateDocument(this.session.document(), pending, this.t)
      : this.modelReport();
    return {
      ...report,
      canSave: !this.readOnly() && report.canSave,
      issues: report.issues.map((issue) => ({
        ...issue,
        shown:
          issue.setting === 'name'
            ? this.touchedNames().has(issue.nodeId)
            : issue.setting !== 'option-0' || this.optionVisible(issue.nodeId, 0),
      })),
    };
  });

  setReadOnly(value: boolean): void {
    if (value === this.readOnly()) return;
    this.editabilityRevision++;
    this.locked.set(value);
    this.replaceChecks({});
  }
  canEdit(id: number): boolean {
    const node = nodeOf(this.session.document(), id);
    return (
      !this.readOnly() && !!node && !('kind' in node && node.kind === 'field' && node.definition.publishedDefinition)
    );
  }

  reset(touched: number[] = []): void {
    this.edits.set({});
    this.inputErrors.set({});
    this.replaceChecks({});
    this.touchedNames.set(new Set(touched));
    this.quietOptions.set(new Set());
  }
  startOption(id: number): void {
    this.quietOptions.update((ids) => new Set([...ids, id]));
  }
  touchName(id: number): void {
    this.touchedNames.update((ids) => new Set([...ids, id]));
    // Once naming has finished, an unfinished option must explain the save gate.
    this.touchOption(id, 0);
  }
  nameError(id: number, name: string, kind: ContainerDraft['kind'] | 'field'): string | null {
    return this.touchedNames().has(id) ? artifactNameError(name, kind, this.t) : null;
  }
  touchOption(id: number, index: number): void {
    if (index === 0 && this.quietOptions().has(id))
      this.quietOptions.update((ids) => new Set([...ids].filter((candidate) => candidate !== id)));
  }
  optionVisible(id: number, index: number): boolean {
    return index !== 0 || !this.quietOptions().has(id);
  }

  /** Syntax and asynchronous failures have no typed value to retry. */
  setInputError(
    id: number,
    setting: string,
    message: string | null,
    tab: string,
    value?: string | FieldDefaultValue,
  ): void {
    const key = keyOf(id, setting);
    this.inputErrors.update((previous) => {
      const next = { ...previous };
      if (message) next[key] = { message, tab, ...(value === undefined ? {} : { value: structuredClone(value) }) };
      else delete next[key];
      return same(previous, next) ? previous : next;
    });
    if (message) {
      this.discardEdit(key);
      this.replaceChecks(Object.fromEntries(Object.entries(this.checks()).filter(([, check]) => check.id !== id)));
    }
  }
  private discardEdit(key: string): void {
    if (!this.edits()[key]) return;
    const next = { ...this.edits() };
    delete next[key];
    this.edits.set(next);
  }
  inputValue(id: number, setting: string): string | FieldDefaultValue | undefined {
    return structuredClone(this.inputErrors()[keyOf(id, setting)]?.value);
  }
  inputError(id: number, setting: string): string | null {
    return this.inputErrors()[keyOf(id, setting)]?.message ?? null;
  }
  beginCheck(id: number, setting: string, message: string, tab = 'Constraints'): ValidationCheck {
    const node = nodeOf(this.session.document(), id);
    if (!node || !this.canEdit(id))
      return { signal: AbortSignal.abort(), active: () => false, unchanged: () => false, cancel: () => {} };
    const revision = this.editabilityRevision;
    const key = keyOf(id, setting);
    const check = { id, node, message, tab, controller: new AbortController() };
    this.replaceChecks({ ...this.checks(), [key]: check });
    const unchanged = () =>
      revision === this.editabilityRevision && this.canEdit(id) && nodeOf(this.session.document(), id) === node;
    return {
      signal: check.controller.signal,
      active: () => this.checks()[key] === check && unchanged(),
      unchanged,
      cancel: () => {
        if (this.checks()[key] !== check) return;
        const next = { ...this.checks() };
        delete next[key];
        this.replaceChecks(next);
      },
    };
  }
  private replaceChecks(next: Record<string, PendingCheck>): void {
    const previous = this.checks();
    this.checks.set(next);
    for (const [key, check] of Object.entries(previous)) if (next[key] !== check) check.controller.abort();
  }
  isChecking(id: number, setting: string): boolean {
    return !!this.checks()[keyOf(id, setting)];
  }
  error(id: number, setting: string): string | null {
    return this.draftIssues()[keyOf(id, setting)]?.message ?? null;
  }
  changes(id: number): Partial<Field> {
    return structuredClone(
      Object.assign(
        {},
        ...Object.values(this.edits())
          .filter((edit) => edit.id === id)
          .map((edit) => edit.changes),
      ),
    );
  }
  submit(id: number, changes: Partial<Field>, setting: string, tab: string): string | null {
    if (this.readOnly()) return this.t('fieldElement.readOnly');
    if (!parentOf(this.session.document(), id)) return this.t('errors.elementMissing');
    // A new editing intent supersedes checks of the previous field, even if
    // this edit is held as a draft instead of changing the accepted document.
    this.replaceChecks(Object.fromEntries(Object.entries(this.checks()).filter(([, check]) => check.id !== id)));
    const key = keyOf(id, setting);
    this.setInputError(id, setting, null, tab);
    this.edits.update((previous) => ({ ...previous, [key]: { id, changes: structuredClone(changes), setting, tab } }));
    this.session.document.update((document) => document);
    return this.error(id, setting);
  }

  keyError(document: ContainerDraft, id: number, value: string): string | null {
    const parent = parentOf(document, id);
    if (!parent) return this.t('errors.elementMissing');
    const node = parent.children.find((child) => child.id === id)!;
    const key = value.trim();
    const invalid = childKeyError(
      key,
      node.kind === 'field' && node.definition.type === 'attributeValue',
      this.t,
      parent.kind,
    );
    if (invalid) return invalid;
    // The parent may already hold a blank or repeated key; that is reported elsewhere, so read leniently.
    const keys = childKeys(parent.children.map(keyedChild), parent.kind);
    return parent.children.some((child, index) => child.id !== id && keys[index] === key)
      ? this.t('validation.key.duplicate')
      : null;
  }

  private candidate(
    document: ContainerDraft,
    id: number,
    changes: Partial<Field>,
  ): { node?: ChildNode; error: string | null } {
    const parent = parentOf(document, id);
    const node = parent?.children.find((child) => child.id === id);
    if (!node || !parent) return { error: this.t('errors.elementMissing') };
    if (node.kind === 'field' && node.definition.publishedDefinition)
      return { error: this.t('errors.publishedReadOnly') };
    if (changes.deploymentName !== undefined) {
      const error = this.keyError(document, id, changes.deploymentName);
      if (error) return { error };
      changes = { ...changes, deploymentName: changes.deploymentName.trim() };
    }
    if (node.kind === 'field') {
      const current = fieldView(node);
      changes = reducePrecision(current, changes);
      const value = changes.defaultValue ?? current.defaultValue;
      if (changes.temporal?.timezoneEnabled === false && value.kind === 'temporal')
        changes = { ...changes, defaultValue: { ...value, value: value.value.replace(/(?:Z|[+-]\d{2}:\d{2})$/, '') } };
    }
    const next: ChildNode =
      node.kind === 'field'
        ? fieldNode({ ...fieldView(node), ...changes })
        : { ...node, placement: { ...node.placement, ...changes } };
    // Validate this node, not its siblings or descendants. Existing defects may
    // remain while the author repairs a different setting on an imported node.
    const ownIssues = (child: ChildNode) =>
      validateDocument(
        {
          id: -1,
          kind: parent.kind,
          name: 'Validation',
          description: '',
          identifier: 'urn:ced:validation',
          version: '0.0.1',
          children: [
            child.kind === 'element' ? { ...child, definition: { ...child.definition, children: [] } } : child,
          ],
        },
        {},
        this.t,
      ).issues.filter((issue) => issue.setting !== 'name' && !issue.setting.startsWith('option-'));
    const before = ownIssues(node);
    const error = ownIssues(next).find(
      (issue) => !before.some((old) => old.setting === issue.setting && old.message === issue.message),
    );
    return { node: next, error: error?.message ?? null };
  }

  private reconcile(document: ContainerDraft): ContainerDraft {
    const edits = { ...this.edits() };
    const inputs = { ...this.inputErrors() };
    const checks = { ...this.checks() };
    const available = (id: number, setting: string, enablingMultiple = false) => {
      const node = parentOf(document, id)?.children.find((child) => child.id === id);
      if (!node) return id === document.id;
      return !(
        node.kind === 'field' &&
        (node.definition.publishedDefinition ||
          (setting === 'occurrences' &&
            !enablingMultiple &&
            !node.placement.allowMultiple &&
            descriptorOf(node.definition.type).deployment !== 'alwaysMultiple'))
      );
    };
    for (const [key, edit] of Object.entries(edits))
      if (!available(edit.id, edit.setting, edit.changes.allowMultiple)) delete edits[key];
    for (const key of Object.keys(inputs)) {
      const [id, setting] = key.split(':');
      if (!available(Number(id), setting)) delete inputs[key];
    }
    const commit = (id: number, changes: Partial<Field>): boolean => {
      if (this.readOnly()) return false;
      const result = this.candidate(document, id, changes);
      if (result.error || !result.node) return false;
      const parent = parentOf(document, id)!;
      this.accepted(id, changes);
      document = updateContainer(document, parent.id, (container) => ({
        ...container,
        children: container.children.map((child) => (child.id === id ? result.node! : child)),
      }));
      return true;
    };
    // Joint validation permits mutually dependent corrections (a bound and its
    // default). Independent valid edits still land if another draft is invalid.
    let progress = true;
    while (progress) {
      progress = false;
      for (const id of new Set(Object.values(edits).map((edit) => edit.id))) {
        const entries = Object.entries(edits).filter(([, edit]) => edit.id === id);
        if (commit(id, Object.assign({}, ...entries.map(([, edit]) => edit.changes)))) {
          for (const [key] of entries) delete edits[key];
          progress = true;
        } else {
          for (const [key, edit] of entries)
            if (commit(id, edit.changes)) {
              delete edits[key];
              progress = true;
            }
        }
      }
    }
    if (!same(this.edits(), edits)) this.edits.set(edits);
    if (!same(this.inputErrors(), inputs)) this.inputErrors.set(inputs);
    for (const [key, check] of Object.entries(checks))
      if (nodeOf(document, check.id) !== check.node) delete checks[key];
    if (Object.keys(this.checks()).length !== Object.keys(checks).length) this.replaceChecks(checks);
    return document;
  }
}
