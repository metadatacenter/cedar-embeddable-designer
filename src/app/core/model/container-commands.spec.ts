import { describe, expect, it } from 'vitest';
import { newContainer, newFieldIdentity } from './cedar-template';
import {
  fieldNode,
  newNodeId,
  moveChild,
  findContainer,
  ContainerDraft,
  ChildNode,
  replaceFields,
  fieldView,
} from './container-draft';

function setup() {
  const root = newContainer('template', 'Root');
  const a = newContainer('element', 'A');
  const b = newContainer('element', 'B');
  const leaf = fieldNode({
    id: newNodeId(),
    ...newFieldIdentity(),
    type: 'text',
    name: 'Value',
    status: 'required',
    allowMultiple: true,
    minItems: 2,
    maxItems: 4,
    options: [],
    defaultValue: { kind: 'literal', value: 'Default' },
  });
  const element = (definition: ContainerDraft): ChildNode => ({
    kind: 'element',
    id: definition.id,
    definition,
    placement: { status: 'optional', allowMultiple: false },
  });
  a.children.push(leaf, element(b));
  root.children.push(element(a));
  return { root, a, b, leaf };
}
describe('container mutations', () => {
  it('moves a subtree atomically, retaining artifact and placement metadata', () => {
    const { root, a, b, leaf } = setup();
    const moved = moveChild(root, leaf.id, b.id, 0);
    expect(findContainer(moved, b.id)?.children).toEqual([leaf]);
    expect(findContainer(moved, a.id)?.children).toHaveLength(1);
    expect(a.children).toHaveLength(2);
    expect(findContainer(moved, b.id)?.children[0].placement).toEqual(leaf.placement);
  });
  it('rejects moving into self, descendants, missing containers and duplicate keys without mutating the original', () => {
    const { root, a, b, leaf } = setup();
    expect(() => moveChild(root, a.id, a.id, 0)).toThrow(/itself/);
    expect(() => moveChild(root, a.id, b.id, 0)).toThrow(/descendants/);
    expect(() => moveChild(root, leaf.id, -1, 0)).toThrow(/no longer/);
    b.children.push({ ...leaf, id: newNodeId() });
    expect(() => moveChild(root, leaf.id, b.id, 0)).toThrow(/property name/);
    expect(a.children[0]).toBe(leaf);
  });
  it('rejects page breaks inside elements', () => {
    const { root, b, leaf } = setup();
    const page = { ...leaf, id: newNodeId(), definition: { ...leaf.definition, type: 'pageBreak' } };
    root.children.push(page);
    expect(() => moveChild(root, page.id, b.id, 0)).toThrow(/Page breaks/);
  });
  it('reorders a mixed child list by identity and leaves field deletion from crossing an element', () => {
    const { root, a, b, leaf } = setup();
    const another = { ...leaf, id: newNodeId(), definition: { ...leaf.definition, name: 'Another' } };
    a.children.push(another);
    const moved = moveChild(root, another.id, a.id, 0);
    expect(findContainer(moved, a.id)?.children.map((node) => node.id)).toEqual([another.id, leaf.id, b.id]);
    expect(replaceFields(a, [fieldView(another)]).children.map((node) => node.id)).toEqual([b.id, another.id]);
  });
});
