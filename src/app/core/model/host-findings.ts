import type { CedHostFinding, CedValidationIssue } from '../../ced-public-api';
import { ChildNode, ContainerDraft, fieldView } from './container-draft';
import { childKeys, keyedChild } from './child-key-policy';
import { accepts, allowsDefault, descriptorOf } from './cedar-template';
import { elementDisplayName, fieldDisplayName } from './field-display-name';

/** Resolve schema paths by placement, never by reusable artifact identity or display label. */
export function hostFindings(
  document: ContainerDraft,
  findings: readonly CedHostFinding[],
  fieldDocument = false,
): CedValidationIssue[] {
  return findings.map((finding) => {
    let container = document;
    let node: ChildNode | undefined = fieldDocument ? document.children[0] : undefined;
    const path = [document.id];
    if (node) path.push(node.id);
    let parts =
      finding.location.startsWith('/') && !/~(?![01])/u.test(finding.location)
        ? finding.location
            .slice(1)
            .split('/')
            .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
        : [];
    while (!node && parts[0] === 'properties' && parts.length > 1) {
      const keys = childKeys(container.children.map(keyedChild), container.kind);
      const child = container.children[keys.indexOf(parts[1])];
      if (!child) break;
      node = child;
      path.push(child.id);
      parts = parts.slice(2);
      const repeated =
        child.placement.allowMultiple ||
        (child.kind === 'field' && descriptorOf(fieldView(child).type).deployment === 'alwaysMultiple');
      if (parts[0] === 'items') {
        if (!repeated) {
          parts = [];
          break;
        }
        parts = parts.slice(1);
      } else if (repeated && !['minItems', 'maxItems'].includes(parts[0])) {
        parts = [];
        break;
      }
      if (child.kind === 'element' && parts[0] === 'properties') {
        container = child.definition;
        node = undefined;
      }
    }
    const field = node?.kind === 'field';
    const key = parts.join('/');
    let setting: string | undefined;
    let tab = 'Display';
    if (key === 'schema:name') {
      setting = node ? 'ownName' : 'name';
    } else if (key === 'schema:description') {
      setting = node?.kind === 'element' ? 'ownDescription' : 'description';
    } else if (parts[0] === '_annotations') {
      setting = 'annotations';
      tab = 'Annotations';
    } else if (['minItems', 'maxItems'].includes(key) && node) {
      setting = key;
      tab = 'Configuration';
    } else if (field && parts[0] === '_valueConstraints') {
      tab = 'Constraints';
      const constraint = parts[1];
      if (
        [
          'regex',
          'minLength',
          'maxLength',
          'minValue',
          'maxValue',
          'decimalPlace',
          'unitOfMeasure',
          'numberType',
        ].includes(constraint)
      )
        setting = constraint;
      else if (constraint === 'defaultValue') setting = 'defaultValue';
      else if (['ontologies', 'branches', 'classes', 'valueSets', 'actions'].includes(constraint))
        setting = 'controlledTerms';
      else if (constraint === 'literals' && /^\d+$/.test(parts[2] ?? '')) setting = 'option-' + parts[2];
      else if (['requiredValue', 'recommendedValue'].includes(constraint)) {
        setting = 'layout';
        tab = 'Configuration';
      }
    }
    if (node?.kind === 'field') {
      const view = fieldView(node);
      if (
        ['regex', 'minLength', 'maxLength'].includes(setting ?? '') &&
        !accepts(view.type, setting === 'regex' ? 'textPattern' : 'textLength')
      )
        setting = undefined;
      if (
        ['minValue', 'maxValue', 'decimalPlace', 'unitOfMeasure', 'numberType'].includes(setting ?? '') &&
        !accepts(view.type, 'numericBounds')
      )
        setting = undefined;
      if (setting === 'controlledTerms' && view.type !== 'controlledTerms') setting = undefined;
      if (setting === 'defaultValue' && !allowsDefault(view.type)) setting = undefined;
      if (setting?.startsWith('option-') && Number(setting.slice(7)) >= view.options.length) setting = undefined;
    }
    const label = node
      ? node.kind === 'field'
        ? fieldDisplayName(fieldView(node))
        : elementDisplayName(node)
      : container.name;
    return {
      nodeId: node?.id ?? container.id,
      path,
      label,
      setting: setting ?? 'artifact',
      tab,
      code: 'host.validation',
      message: finding.message,
      severity: finding.severity,
      source: 'host',
      shown: true,
      location: finding.location,
      unmapped: !setting,
    };
  });
}
