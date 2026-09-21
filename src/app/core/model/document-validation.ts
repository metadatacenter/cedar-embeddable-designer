import type { CedValidationIssue, CedValidationReport } from '../../ced-public-api';
import { ContainerDraft, childName, fieldView } from './container-draft';
import type { Field } from '../models/types';
import {
  buildContainer,
  buildTemplate,
  fieldToJson,
  choiceDefaultConflict,
  defaultValueError,
  allowsOptions,
} from './cedar-template';

export type DraftIssues = Readonly<Record<string, { message: string; tab: string }>>;

/** Names are required independently of the generated property key used by a draft. */
export function artifactNameError(name: string, kind: 'field' | 'element' | 'template'): string | null {
  return name.trim() ? null : `${kind[0].toUpperCase()}${kind.slice(1)} name is required.`;
}

/** Validate one document snapshot, including unsaved settings drafts, without UI state. */
export function validateDocument(document: ContainerDraft, drafts: DraftIssues): CedValidationReport {
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
      const prefix = `${label.trim() || 'an unnamed field'}: `;
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
    const nameError = artifactNameError(container.name, container.kind);
    if (nameError) add(container.id, `Unnamed ${container.kind}`, path, 'name', nameError, 'Display', 'model');
    pending(container.id, container.name, path);
    for (const node of container.children) {
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
            error instanceof Error ? error.message : String(error),
            'Occurrences',
            'model',
          );
        }
        continue;
      }
      const field = fieldView(node);
      const nodePath = [...path, node.id];
      const nameError = artifactNameError(field.name, 'field');
      if (nameError) add(node.id, 'Unnamed field', nodePath, 'name', nameError, 'Display', 'model');
      pending(node.id, childName(node), nodePath);
      if (allowsOptions(field.type)) {
        field.options.forEach((option, index) => {
          if (!option.trim())
            add(
              node.id,
              childName(node),
              nodePath,
              `option-${index}`,
              `Option ${index + 1} needs a name.`,
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
          error instanceof Error ? error.message : String(error),
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
          add(
            node.id,
            childName(node),
            nodePath,
            'occurrences',
            error instanceof Error ? error.message : String(error),
            'Occurrences',
            'model',
          );
        }
        const error = choiceDefaultConflict(field) ?? defaultValueError(field, field.defaultValue);
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
        message: error instanceof Error ? error.message : String(error),
        severity: 'error',
        source: 'model',
      });
    }
  }
  return { valid: issues.length === 0, canSave: issues.length === 0, issues };
}
