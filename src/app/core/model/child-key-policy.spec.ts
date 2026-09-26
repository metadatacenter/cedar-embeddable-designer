import { childKeyError } from './child-key-policy';

describe('serialized child keys', () => {
  it('rejects metadata and unsafe object keys', () => {
    for (const key of ['', '  ', '@id', '@context', 'schema:name', '__proto__', 'constructor', 'prototype', 'bad\nkey'])
      expect(childKeyError(key)).not.toBeNull();
  });
  it('allows ordinary schema keywords and YAML scalar spellings', () => {
    for (const key of ['type', 'properties', 'required', 'name', 'true', 'null', 'yes', '2026-09-21'])
      expect(childKeyError(key)).toBeNull();
  });
  it('protects the YAML envelope only for attribute-value group keys', () => {
    for (const key of ['type', 'name', 'children', 'id', 'annotations']) {
      expect(childKeyError(key, true)).not.toBeNull();
      expect(childKeyError(key)).toBeNull();
    }
  });
  it("protects only an element's own YAML keys for an attribute-value field inside it", () => {
    for (const key of ['type', 'id', 'children']) expect(childKeyError(key, true, undefined, 'element')).not.toBeNull();
    for (const key of ['name', 'description', 'annotations']) {
      expect(childKeyError(key, true, undefined, 'element')).toBeNull();
      expect(childKeyError(key, true, undefined, 'template')).not.toBeNull();
    }
  });
});
