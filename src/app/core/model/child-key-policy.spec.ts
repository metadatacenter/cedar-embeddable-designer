import { KeyedChild, childKeyError, childKeys, deploymentKeys, freshChildKey } from './child-key-policy';

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
  it('protects nested and standalone element metadata', () => {
    for (const key of ['type', 'id', 'children', 'name', 'description', 'createdOn'])
      expect(childKeyError(key, true, undefined, 'element')).not.toBeNull();
    for (const key of ['annotations', 'isBasedOn', 'derivedFrom']) {
      expect(childKeyError(key, true, undefined, 'element')).toBeNull();
      expect(childKeyError(key, true, undefined, 'template')).not.toBeNull();
    }
  });
});

const child = (name: string, overrides: Partial<KeyedChild> = {}): KeyedChild => ({
  name,
  kind: 'field',
  attributeValue: false,
  ...overrides,
});

/**
 * Every key the designer derives comes from one of two forms, and both apply the policy for the
 * parent the child sits in. Fresh keys are what the designer chooses for a new, renamed or imported
 * child; kept keys are what a child holds before it has a key of its own.
 */
describe('derived child keys', () => {
  it('chooses a fresh key in lower case, past taken and refused keys, falling back to the kind', () => {
    const none = () => false;
    expect(freshChildKey('Sample ID', child(''), 'template', none)).toBe('sample_id');
    expect(freshChildKey('Sample', child(''), 'template', (key) => key === 'sample')).toBe('sample_2');
    expect(freshChildKey('@id', child(''), 'template', none)).toBe('field');
    expect(freshChildKey('@id', child('', { kind: 'element' }), 'template', none)).toBe('element');
    expect(freshChildKey('', child('', { kind: 'element' }), 'template', none)).toBe('element');
    expect(freshChildKey('schema:name', child(''), 'template', none)).toBe('schema:name_2');
    expect(freshChildKey('name', child('', { attributeValue: true }), 'template', none)).toBe('name_2');
    expect(freshChildKey('annotations', child('', { attributeValue: true }), 'element', none)).toBe('annotations');
    expect(freshChildKey('annotations', child('', { attributeValue: true }), 'template', none)).toBe('annotations_2');
  });

  it('keeps a usable name as written, and derives a key for a name the policy refuses', () => {
    expect(childKeys([child('Sample ID'), child('Sample ID'), child('')], 'template')).toEqual([
      'Sample ID',
      'Sample ID_2',
      'field',
    ]);
    expect(childKeys([child('@id'), child('@id', { kind: 'element' })], 'template')).toEqual(['field', 'element']);
    expect(childKeys([child('name', { attributeValue: true }), child('name')], 'template')).toEqual(['name_2', 'name']);
  });

  it("keeps a key of the child's own, and derives no key a sibling already holds", () => {
    expect(childKeys([child('Taken'), child('Other', { deploymentName: 'Taken' })], 'template')).toEqual([
      'Taken_2',
      'Taken',
    ]);
  });

  it('refuses a parent whose own keys are blank or repeated only in the strict form', () => {
    const blank = [child('A', { deploymentName: ' ' })];
    const repeated = [child('A', { deploymentName: 'a' }), child('B', { deploymentName: 'a' })];
    expect(() => deploymentKeys(blank, 'template')).toThrow();
    expect(() => deploymentKeys(repeated, 'template')).toThrow();
    expect(childKeys(blank, 'template')).toEqual([' ']);
    expect(childKeys(repeated, 'template')).toEqual(['a', 'a']);
  });
});
