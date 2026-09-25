import { childKeyError } from './child-key-policy';
import type { CedValidationIssue, CedValidationReport } from '../../ced-public-api';
import { ContainerDraft, childName, fieldView } from './container-draft';
import type { Field } from '../models/types';
import {
  deploymentKeys,
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
    ) => {
      const prefix = t('errors.namedField', { name: label.trim() || t('common.anUnnamedField'), message: '' });
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
      });
    };
    const pending = (id: number, label: string, nodePath: number[]) => {
      for (const [key, value] of Object.entries(drafts)) {
        if (key.startsWith(`${id}:`))
          add(id, label, nodePath, key.slice(key.indexOf(':') + 1), value.message, value.tab, 'draft');
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
        childKeyError(key, node.kind === 'field' && fieldView(node).type === 'attributeValue', t) ??
        (keys.filter((candidate) => candidate === key).length > 1 ? t('validation.key.duplicate') : null);
      if (keyError)
        add(
          node.id,
          childName(node),
          [...path, node.id],
          'key',
          keyError,
          node.kind === 'field' ? SETTINGS_TABS.fieldMetadata : SETTINGS_TABS.elementMetadata,
          'model',
        );
      if (node.kind === 'element') {
        visit(node.definition, path);
        try {
          buildContainer({ ...container, children: [{ ...node, definition: { ...node.definition, children: [] } }] });
        } catch (error) {
          add(
            node.id,
            childName(node),
            [...path, node.id],
            'placement',
            describeError(error, t),
            'Occurrences',
            'model',
          );
        }
        continue;
      }
      const field = fieldView(node);
      const nodePath = [...path, node.id];
      const nameError = artifactNameError(field.name, 'field', t);
      if (nameError) add(node.id, t('validation.unnamed.field'), nodePath, 'name', nameError, 'Display', 'model');
      pending(node.id, childName(node), nodePath);
      if (allowsOptions(field.type)) {
        field.options.forEach((option, index) => {
          if (!option.trim())
            add(
              node.id,
              childName(node),
              nodePath,
              `option-${index}`,
              t('validation.optionName', { number: index + 1 }),
              'Constraints',
              'model',
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
          childName(node),
          nodePath,
          'settings',
          describeError(error, t),
          media ? 'Content' : 'Constraints',
          'model',
        );
      }
      if (settingsValid) {
        try {
          buildTemplate({
            name: 'Validation',
            description: '',
            identifier: 'urn:ced:validation',
            version: '0.0.1',
            fields: [settingsField],
          });
        } catch (error) {
          add(node.id, childName(node), nodePath, 'occurrences', describeError(error, t), 'Occurrences', 'model');
        }
        const error = choiceDefaultConflict(field, t) ?? defaultValueError(field, field.defaultValue, t);
        if (error) add(node.id, childName(node), nodePath, 'defaultValue', error, 'Constraints', 'model');
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
      });
    }
  }
  return { valid: issues.length === 0, canSave: issues.length === 0, issues };
}
