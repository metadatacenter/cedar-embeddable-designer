import { describe, it, expect } from 'vitest';
import { EditorSession } from './editor-session';
import { containerFromFlat, fieldNode, fieldView } from '../model/container-draft';
import { Field } from '../models/types';

const field: Field = {
  id: 1,
  type: 'text',
  name: 'Definition',
  deploymentName: 'Placement',
  status: 'required',
  allowMultiple: true,
  minItems: 2,
  options: [],
  defaultValue: { kind: 'none' },
};
describe('container editor session', () => {
  it('keeps reusable definition and parent placement separate without changing the field view', () => {
    const node = fieldNode(field);
    expect(node.definition).not.toHaveProperty('deploymentName');
    expect(node.definition).not.toHaveProperty('minItems');
    expect(node.placement.deploymentName).toBe('Placement');
    expect(fieldView(node)).toEqual(field);
  });
  it('edits a nested container in the same document without changing its sibling', () => {
    const child = containerFromFlat({
      name: 'Child',
      description: '',
      identifier: 'urn:child',
      version: '1.0.0',
      fields: [field],
    });
    child.kind = 'element';
    const root = containerFromFlat({
      name: 'Root',
      description: '',
      identifier: 'urn:root',
      version: '1.0.0',
      fields: [field],
    });
    root.children.push({
      kind: 'element',
      id: child.id,
      placement: { status: 'optional', allowMultiple: false },
      definition: child,
    });
    const session = new EditorSession(root);
    session.activeId.set(child.id);
    session.property('name').set('Changed');
    session.fieldBinding().update((fields) => fields.map((f) => ({ ...f, name: 'Nested field' })));
    expect(session.document().name).toBe('Root');
    expect(session.active().name).toBe('Changed');
    session.activeId.set(root.id);
    expect(session.fieldBinding()()[0].name).toBe('Definition');
    expect(root.children[1]).toMatchObject({ definition: { name: 'Child' } });
  });
});
