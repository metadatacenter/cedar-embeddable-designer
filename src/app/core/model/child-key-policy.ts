import { isReservedInstanceName } from './cedar-template';
import { Translate, english } from '../../i18n/messages';

// Attribute-value groups sit beside (rather than inside) `children` in CEDAR YAML.
const yamlEnvelope = new Set([
  'type',
  'name',
  'description',
  'id',
  'isBasedOn',
  'derivedFrom',
  'children',
  'annotations',
  'createdOn',
  'createdBy',
  'modifiedOn',
  'modifiedBy',
]);

/** Why a child's key is unusable, rendered through `t`, or null for a usable key. */
export function childKeyError(value: string, attributeValue = false, t: Translate = english): string | null {
  const key = value.trim();
  if (!key) return t('validation.key.required');
  if (['__proto__', 'prototype', 'constructor'].includes(key)) return t('validation.key.objectInternals');
  if (isReservedInstanceName(key)) return t('validation.key.cedarMetadata');
  if ([...key].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    return t('validation.key.controlCharacters');
  if (attributeValue && yamlEnvelope.has(key)) return t('validation.key.yamlMetadata');
  return null;
}
