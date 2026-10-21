/**
 * The identity a child takes on import, on detaching, and on replacement.
 *
 * Every case reads a real artifact the model library wrote, so what is asserted is what a template
 * holding the child would store: a published source keeps its `@id`, and a draft source becomes a
 * copy with an `@id` of its own, a `pav:derivedFrom` naming the version copied, a version line
 * starting at 0.0.1, and no previous version.
 */
import {
  buildContainer,
  fieldToJson,
  newContainer,
  newFieldIdentity,
  readContainer,
  readField,
  templateToJson,
} from './cedar-template';
import { forkedChild, FORK_VERSION, importedChild, replacedChild } from './child-identity';
import { ChildNode, ElementNode, fieldNode, FieldNode, newNodeId } from './container-draft';
import { Field } from '../models/types';
import { childDerivedFrom, childIdentifier, childVersion } from './version-state';

function sourceField(published: boolean): Record<string, unknown> {
  const field: Field = {
    id: newNodeId(),
    ...newFieldIdentity(),
    type: 'text',
    name: 'Title',
    status: 'optional',
    options: [],
    defaultValue: { kind: 'none' },
    allowMultiple: false,
  };
  const json = fieldToJson(field) as Record<string, unknown>;
  return published ? { ...json, 'bibo:status': 'bibo:published', 'pav:version': '1.2.0' } : json;
}

function sourceElement(published: boolean): Record<string, unknown> {
  const definition = newContainer('element', 'Section');
  const inner: Field = {
    id: newNodeId(),
    ...newFieldIdentity(),
    type: 'text',
    name: 'Inner',
    status: 'optional',
    options: [],
    defaultValue: { kind: 'none' },
    allowMultiple: false,
  };
  definition.children = [fieldNode(inner)];
  const json = templateToJson(buildContainer(definition)) as Record<string, unknown>;
  return published ? { ...json, 'bibo:status': 'bibo:published', 'pav:version': '1.2.0' } : json;
}

function readChild(kind: 'field' | 'element', json: Record<string, unknown>): ChildNode {
  if (kind === 'field')
    return fieldNode({ ...readField(JSON.stringify(json)), id: newNodeId(), deploymentName: 'title' });
  const definition = readContainer(json);
  return {
    kind: 'element',
    id: definition.id,
    definition,
    placement: { deploymentName: 'section', allowMultiple: false },
  };
}

const source = (kind: 'field' | 'element', published: boolean) =>
  kind === 'field' ? sourceField(published) : sourceElement(published);

/** The child as the artifact a parent would store for it. */
function stored(node: ChildNode): Record<string, unknown> {
  return (
    node.kind === 'field'
      ? fieldToJson({ ...node.definition, ...node.placement, id: node.id })
      : templateToJson(buildContainer(node.definition))
  ) as Record<string, unknown>;
}

describe('child identity', () => {
  const KINDS = ['field', 'element'] as const;

  it.each(KINDS)('imports a published %s as itself', (kind) => {
    const json = source(kind, true);
    const node = readChild(kind, json);
    expect(importedChild(node)).toBe(node);
    expect(stored(importedChild(node))['@id']).toBe(json['@id']);
  });

  it.each(KINDS)('imports a draft %s as a copy derived from it', (kind) => {
    const json = source(kind, false);
    const imported = importedChild(readChild(kind, json));
    const artifact = stored(imported);
    expect(artifact['@id']).not.toBe(json['@id']);
    expect(String(artifact['@id'])).toMatch(
      kind === 'field'
        ? /^https:\/\/repo\.metadatacenter\.org\/template-fields\//
        : /^https:\/\/repo\.metadatacenter\.org\/template-elements\//,
    );
    expect(artifact['pav:derivedFrom']).toBe(json['@id']);
    expect(artifact['pav:version']).toBe(FORK_VERSION);
    expect(artifact['bibo:status']).toBe('bibo:draft');
    expect(artifact['pav:previousVersion']).toBeUndefined();
  });

  it.each(KINDS)('detaches a linked %s into an editable copy of the version it was', (kind) => {
    const json = source(kind, true);
    const linked = readChild(kind, json);
    const copy = forkedChild(linked);
    expect(copy.id).toBe(linked.id);
    expect(copy.placement).toEqual(linked.placement);
    expect(childIdentifier(copy)).not.toBe(json['@id']);
    expect(childDerivedFrom(copy)).toBe(json['@id']);
    expect(childVersion(copy)).toBe(FORK_VERSION);
    if (copy.kind === 'field') expect(copy.definition.publishedDefinition).toBeUndefined();
    const artifact = stored(copy);
    expect(artifact['bibo:status']).toBe('bibo:draft');
    expect(artifact['pav:derivedFrom']).toBe(json['@id']);
  });

  it("leaves a detached element's descendants as they were", () => {
    const linked = readChild('element', source('element', true)) as ElementNode;
    const copy = forkedChild(linked) as ElementNode;
    expect(copy.definition.children).toBe(linked.definition.children);
  });

  it.each(KINDS)('replaces a %s and keeps how its parent placed it', (kind) => {
    const existing = readChild(kind, source(kind, false));
    const replacement = readChild(kind, source(kind, true));
    const replaced = replacedChild(existing, replacement)!;
    expect(replaced.id).toBe(existing.id);
    expect(replaced.placement).toBe(existing.placement);
    expect(childIdentifier(replaced)).toBe(childIdentifier(replacement));
    if (replaced.kind === 'element') expect(replaced.definition.id).toBe(existing.id);
  });

  it('refuses to replace a field with an element or an element with a field', () => {
    const field = readChild('field', source('field', true)) as FieldNode;
    const element = readChild('element', source('element', true));
    expect(replacedChild(field, element)).toBeNull();
    expect(replacedChild(element, field)).toBeNull();
  });
});
