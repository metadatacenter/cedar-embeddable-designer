import { childLocks } from './child-locks';
import { ChildNode, ContainerDraft, fieldNode, newNodeId } from './container-draft';
import { newContainer, newFieldIdentity } from './cedar-template';
import { ArtifactMetadata, Field } from '../models/types';

function field(name: string, published = false): ChildNode {
  const value: Field = {
    id: newNodeId(),
    ...newFieldIdentity(),
    type: 'text',
    name,
    status: 'optional',
    options: [],
    defaultValue: { kind: 'none' },
    allowMultiple: false,
    ...(published ? { publishedDefinition: '{}' } : {}),
  };
  return fieldNode(value);
}

function element(name: string, published: boolean, ...children: ChildNode[]): ChildNode {
  const definition: ContainerDraft = { ...newContainer('element', name), children };
  if (published)
    definition.metadata = {
      artifact: { publicationStatus: 'bibo:published' } as ArtifactMetadata,
      language: null,
      annotations: undefined,
      instanceType: null,
      header: null,
      footer: null,
    };
  return { kind: 'element', id: definition.id, definition, placement: { allowMultiple: false } };
}

describe('child locks', () => {
  const draftField = field('Draft');
  const publishedField = field('Published', true);
  const inside = field('Inside');
  const insideElement = element('Inner', false, field('Deeper'));
  const publishedElement = element('Section', true, inside, insideElement);
  const root: ContainerDraft = {
    ...newContainer('template', 'Study'),
    children: [draftField, publishedField, publishedElement],
  };
  const deeper = (insideElement as Extract<ChildNode, { kind: 'element' }>).definition.children[0];

  it('leave a draft child and the root free', () => {
    expect(childLocks(root, draftField.id)).toEqual({ definition: false, placement: false });
    expect(childLocks(root, root.id)).toEqual({ definition: false, placement: false });
  });
  it("lock a published child's definition and leave its placement to its parent", () => {
    expect(childLocks(root, publishedField.id)).toEqual({ definition: true, placement: false });
    expect(childLocks(root, publishedElement.id)).toEqual({ definition: true, placement: false });
  });
  it('lock everything inside a published element, however deep', () => {
    for (const node of [inside, insideElement, deeper])
      expect(childLocks(root, node.id)).toEqual({ definition: true, placement: true });
  });
});
