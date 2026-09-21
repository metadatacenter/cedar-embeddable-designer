import { AttributeValueNamePolicy } from 'cedar-model-typescript-library';

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

export function childKeyError(value: string, attributeValue = false): string | null {
  const key = value.trim();
  if (!key) return 'Key is required.';
  if (['__proto__', 'prototype', 'constructor'].includes(key)) return 'This key is reserved for object internals.';
  if (AttributeValueNamePolicy.isReserved(key)) return 'This key is reserved for CEDAR metadata.';
  if ([...key].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    return 'Key must not contain control characters.';
  if (attributeValue && yamlEnvelope.has(key)) return 'This key is reserved for CEDAR YAML metadata.';
  return null;
}
