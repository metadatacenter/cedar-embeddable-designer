import { retainSessionIds } from './retain-session-ids';
import { newContainer, readContainer, buildContainer, templateToJson } from './cedar-template';
import { fieldNode, newNodeId } from './container-draft';

function document(kind: 'template' | 'element' = 'template') {
  const root = newContainer(kind);
  root.name = 'Study';
  root.children = ['First', 'Second'].map((name) =>
    fieldNode({
      id: newNodeId(),
      name,
      type: 'text',
      status: 'optional',
      options: [],
      defaultValue: { kind: 'none' },
      allowMultiple: false,
    }),
  );
  return root;
}
const roundTrip = (root: ReturnType<typeof document>) => readContainer(templateToJson(buildContainer(root)));

for (const kind of ['template', 'element'] as const)
  for (const depth of [0, 3, 6]) {
    it(`retains ${kind} view identities at depth ${depth} while adopting stored metadata`, () => {
      const previous = document(kind);
      let parent = previous;
      for (let i = 0; i < depth; i++) {
        const definition = document('element');
        parent.children.push({ kind: 'element', id: definition.id, definition, placement: { allowMultiple: false } });
        parent = definition;
      }
      const incoming = roundTrip(previous);
      incoming.description = 'Stored description';
      incoming.schemaIdentifier = 'https://example.org/saved';
      const before = structuredClone(incoming);
      const retained = retainSessionIds(previous, incoming);
      expect(retained.id).toBe(previous.id);
      const ids = (root: typeof previous): number[] => [
        root.id,
        ...root.children.flatMap((n): number[] => (n.kind === 'element' ? ids(n.definition) : [n.id])),
      ];
      expect(ids(retained)).toEqual(ids(previous));
      expect(templateToJson(buildContainer(retained))).toEqual(templateToJson(buildContainer(incoming)));
      expect(incoming).toEqual(before);
    });
  }

it('matches deployment keys across reorder rather than shared definition IRIs or positions', () => {
  const previous = document();
  for (const node of previous.children) node.definition.schemaIdentifier = 'https://example.org/shared-field';
  const incoming = roundTrip(previous);
  incoming.children.reverse();
  const retained = retainSessionIds(previous, incoming);
  expect(retained.children.map((n) => n.id)).toEqual(previous.children.map((n) => n.id).reverse());
});

it('does not reuse a renamed or type-changed occurrence identity', () => {
  const previous = document();
  const incoming = roundTrip(previous);
  incoming.children[0].placement.deploymentName = 'Renamed';
  const second = incoming.children[1];
  if (second.kind === 'field') second.definition.type = 'number';
  const retained = retainSessionIds(previous, incoming);
  expect(retained.children.map((n) => n.id)).toEqual(incoming.children.map((n) => n.id));
  expect(retained.children.every((n) => !previous.children.some((old) => old.id === n.id))).toBe(true);
});

it('does not preserve the root when changing artifact kind', () => {
  const previous = document();
  const incoming = document('element');
  expect(retainSessionIds(previous, incoming)).toBe(incoming);
});
