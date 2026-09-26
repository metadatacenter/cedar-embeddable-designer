import { AttributeValueFieldParent, ReservedNames } from './cedar-template';
import { Translate, english } from '../../i18n/messages';

/**
 * Why a child's key is unusable, rendered through `t`, or null for a usable key.
 *
 * The model library's `ReservedNames` decides which names are reserved. `parent` is the kind of
 * container the child sits in, and matters only for an attribute-value field: the YAML form writes
 * that field beside its parent's metadata, and a template carries more metadata keys than an element.
 */
export function childKeyError(
  value: string,
  attributeValue = false,
  t: Translate = english,
  parent: AttributeValueFieldParent = 'template',
): string | null {
  const key = value.trim();
  if (!key) return t('validation.key.required');
  if (['__proto__', 'prototype', 'constructor'].includes(key)) return t('validation.key.objectInternals');
  if (ReservedNames.isReservedName(key)) return t('validation.key.cedarMetadata');
  if ([...key].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    return t('validation.key.controlCharacters');
  if (attributeValue && ReservedNames.isReservedAttributeValueFieldName(key, parent))
    return t('validation.key.yamlMetadata');
  return null;
}
