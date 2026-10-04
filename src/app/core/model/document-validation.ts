import { childKeyError } from './child-key-policy';
import type { CedValidationIssue, CedValidationReport } from '../../ced-public-api';
import { ChildNode, ContainerDraft, fieldView } from './container-draft';
import { elementDisplayName, fieldDisplayName } from './field-display-name';
import type { Field } from '../models/types';
import {
  deploymentKeys,
  descriptorOf,
  buildContainer,
  buildTemplate,
  fieldToJson,
  choiceDefaultConflict,
  defaultValueError,
  allowsOptions,
} from './cedar-template';
import { Translate, describeError, english } from '../../i18n/messages';
import { SETTINGS_TABS } from '../../shared/settings-tabs';

export type DraftIssues = Readonly<Record<string, { message: string; tab: string }>>;

/** An issue names a child as its card heading does, so a key or plain name never stands in for a display name. */
function issueLabel(node: ChildNode): string {
  return node.kind === 'field' ? fieldDisplayName(fieldView(node)) : elementDisplayName(node);
}

/** Names are required independently of the generated property key used by a draft. */
export function artifactNameError(
  name: string,
  kind: 'field' | 'element' | 'template',
  t: Translate = english,
): string | null {
  return name.trim() ? null : t(`validation.nameRequired.${kind}`);
}

/**
 * Validate one document snapshot, including unsaved settings drafts, without UI state.
 *
 * Messages and labels are rendered through `t`, which is English unless the caller
 * supplies the designer's language. Draft messages arrive already rendered.
 */
export function validateDocument(
  document: ContainerDraft,
  drafts: DraftIssues,
  t: Translate = english,
): CedValidationReport {
  const issues: CedValidationIssue[] = [];
  const visit = (container: ContainerDraft, ancestors: number[]) => {
    const path = [...ancestors, container.id];
    const add = (
      id: number,
      label: string,
      nodePath: number[],
      setting: string,
      message: string,
      tab: string,
      source: 'model' | 'draft',
      // The model names an artifact by its plain name when it prefixes a message.
      name = label,
    ) => {
      const prefix = t('errors.namedField', { name: name.trim() || t('common.anUnnamedField'), message: '' });
      issues.push({
        nodeId: id,
        label,
        path: nodePath,
        setting,
        message: message.startsWith(prefix) ? message.slice(prefix.length) : message,
        tab,
        code: `${setting}.invalid`,
        severity: 'error',
        source,
        shown: true,
      });
    };
    const pending = (id: number, label: string, nodePath: number[], name = label) => {
      for (const [key, value] of Object.entries(drafts)) {
        if (key.startsWith(`${id}:`))
          add(id, label, nodePath, key.slice(key.indexOf(':') + 1), value.message, value.tab, 'draft', name);
      }
    };
    const nameError = artifactNameError(container.name, container.kind, t);
    if (nameError)
      add(
        container.id,
        t(`validation.unnamed.${container.kind}`),
        path,
        'name',
        nameError,
        SETTINGS_TABS.display,
        'model',
      );
    pending(container.id, container.name, path);
    const keyFields = container.children.map((node) => ({
      name: node.definition.name,
      deploymentName: node.placement.deploymentName,
    }));
    let keys: string[];
    try {
      keys = deploymentKeys(keyFields);
    } catch {
      keys = keyFields.map((field, index) => field.deploymentName ?? (field.name.trim() || `field_${index + 1}`));
    }
    for (const node of container.children) {
      const key = keys[container.children.indexOf(node)];
      const keyError =
        childKeyError(key, node.kind === 'field' && fieldView(node).type === 'attributeValue', t, container.kind) ??
        (keys.filter((candidate) => candidate === key).length > 1 ? t('validation.key.duplicate') : null);
      if (keyError)
        add(
          node.id,
          issueLabel(node),
          [...path, node.id],
          'key',
          keyError,
          node.kind === 'field' ? SETTINGS_TABS.fieldMetadata : SETTINGS_TABS.elementMetadata,
          'model',
          node.definition.name,
        );
      if (node.kind === 'element') {
        visit(node.definition, path);
        try {
          buildContainer({ ...container, children: [{ ...node, definition: { ...node.definition, children: [] } }] });
        } catch (error) {
          add(
            node.id,
            issueLabel(node),
            [...path, node.id],
            'placement',
            describeError(error, t),
            'Occurrences',
            'model',
            node.definition.name,
          );
        }
        continue;
      }
      const field = fieldView(node);
      const nodePath = [...path, node.id];
      const nameError = artifactNameError(field.name, 'field', t);
      if (nameError) add(node.id, t('validation.unnamed.field'), nodePath, 'name', nameError, 'Display', 'model');
      pending(node.id, issueLabel(node), nodePath, field.name);
      if (allowsOptions(field.type)) {
        field.options.forEach((option, index) => {
          if (!option.trim())
            add(
              node.id,
              issueLabel(node),
              nodePath,
              `option-${index}`,
              t('validation.optionName', { number: index + 1 }),
              'Constraints',
              'model',
              field.name,
            );
        });
      }
      const settingsField: Field = { ...field, defaultValue: { kind: 'none' }, importedChoiceDefault: undefined };
      let settingsValid = true;
      try {
        fieldToJson(settingsField);
      } catch (error) {
        settingsValid = false;
        const media = ['image', 'youtube', 'richText'].includes(field.type);
        add(
          node.id,
          issueLabel(node),
          nodePath,
          'settings',
          describeError(error, t),
          media ? 'Content' : 'Constraints',
          'model',
          field.name,
        );
      }
      if (descriptorOf(field.type).deployment !== 'static') {
        try {
          buildTemplate({
            name: 'Validation',
            description: '',
            identifier: 'urn:ced:validation',
            version: '0.0.1',
            // Occurrences are independent of definition errors. A broken
            // definition must not conceal a second, repairable placement error.
            fields: [
              {
                id: field.id,
                name: field.name,
                type: 'text',
                status: field.status,
                options: [],
                defaultValue: { kind: 'none' },
                allowMultiple: field.allowMultiple || descriptorOf(field.type).deployment === 'alwaysMultiple',
                minItems: field.minItems,
                maxItems: field.maxItems,
              },
            ],
          });
        } catch (error) {
          add(
            node.id,
            issueLabel(node),
            nodePath,
            'occurrences',
            describeError(error, t),
            'Occurrences',
            'model',
            field.name,
          );
        }
      }
      if (settingsValid) {
        const error = choiceDefaultConflict(field, t) ?? defaultValueError(field, field.defaultValue, t);
        if (error) add(node.id, issueLabel(node), nodePath, 'defaultValue', error, 'Constraints', 'model', field.name);
      }
    }
  };
  visit(document, []);
  try {
    buildContainer(document);
  } catch (error) {
    if (!issues.some((issue) => issue.source === 'model')) {
      const root = document;
      issues.push({
        nodeId: root.id,
        path: [root.id],
        label: root.name,
        setting: 'artifact',
        tab: 'Display',
        code: 'artifact.invalid',
        message: describeError(error, t),
        severity: 'error',
        source: 'model',
        shown: true,
      });
    }
  }
  return { valid: issues.length === 0, canSave: issues.length === 0, issues };
}
