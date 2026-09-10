import type { Field } from '../models/types';
import type { ContainerMetadata, DesignerTemplate } from './cedar-template';

/** Session identity, independent of reusable CEDAR artifact identifiers. */
let nextId = 10000;
export function newNodeId(): number {
  return ++nextId;
}

const placementKeys = [
  'deploymentName',
  'status',
  'allowMultiple',
  'displayLabel',
  'displayDescription',
  'hidden',
  'continuePreviousLine',
  'minItems',
  'maxItems',
  'propertyIri',
  'valueRecommendationEnabled',
] as const;
type PlacementKey = (typeof placementKeys)[number];
export type Placement = Pick<Field, PlacementKey>;
export type FieldDefinition = Omit<Field, PlacementKey | 'id'>;
export interface FieldNode {
  kind: 'field';
  id: number;
  placement: Placement;
  definition: FieldDefinition;
}
export interface ElementNode {
  kind: 'element';
  id: number;
  placement: Placement;
  definition: ContainerDraft;
}
export type ChildNode = FieldNode | ElementNode;
export interface ContainerDraft {
  schemaIdentifier?: string | null;
  id: number;
  kind: 'template' | 'element';
  name: string;
  description: string;
  identifier: string;
  version: string;
  metadata?: ContainerMetadata;
  preferredLabel?: string | null;
  alternateLabels?: string[] | null;
  children: ChildNode[];
}

export function fieldNode(field: Field): FieldNode {
  const { id, ...definition } = field;
  const placement = {} as Placement;
  for (const key of placementKeys) {
    Object.assign(placement, { [key]: field[key] });
    delete (definition as Partial<Field>)[key];
  }
  return { kind: 'field', id, placement, definition };
}
// A field view retains identity while its immutable node is unchanged. Async
// terminology replies use that identity to reject edits for a replaced field.
const fieldViews = new WeakMap<FieldNode, Field>();
export function fieldView(node: FieldNode): Field {
  let field = fieldViews.get(node);
  if (!field) {
    field = { ...node.definition, ...node.placement, id: node.id };
    fieldViews.set(node, field);
  }
  return field;
}

export function containerFromFlat(template: DesignerTemplate): ContainerDraft {
  const { fields, ...metadata } = template;
  return { ...metadata, id: newNodeId(), kind: 'template', children: fields.map(fieldNode) };
}
export function flatView(container: ContainerDraft): DesignerTemplate {
  return {
    name: container.name,
    description: container.description,
    identifier: container.identifier,
    schemaIdentifier: container.schemaIdentifier,
    version: container.version,
    metadata: container.metadata,
    fields: container.children.filter((node): node is FieldNode => node.kind === 'field').map(fieldView),
  };
}
export function findContainer(root: ContainerDraft, id: number): ContainerDraft | undefined {
  if (root.id === id) return root;
  for (const node of root.children) {
    if (node.kind === 'element') {
      const found = findContainer(node.definition, id);
      if (found) return found;
    }
  }
  return undefined;
}
export function updateContainer(
  root: ContainerDraft,
  id: number,
  update: (container: ContainerDraft) => ContainerDraft,
): ContainerDraft {
  if (root.id === id) return update(root);
  return {
    ...root,
    children: root.children.map((node) =>
      node.kind === 'element' ? { ...node, definition: updateContainer(node.definition, id, update) } : node,
    ),
  };
}

/** Replace the active container's field views while keeping element placements. */
export function replaceFields(container: ContainerDraft, fields: Field[]): ContainerDraft {
  const existing = new Map(
    container.children.filter((node): node is FieldNode => node.kind === 'field').map((node) => [node.id, node]),
  );
  const remaining = fields.map((field) => {
    const previous = existing.get(field.id);
    return previous && fieldView(previous) === field ? previous : fieldNode(field);
  });
  const children: ChildNode[] = [];
  for (const node of container.children) {
    if (node.kind === 'element') children.push(node);
    else if (fields.some((field) => field.id === node.id) && remaining.length) children.push(remaining.shift()!);
  }
  children.push(...remaining);
  return { ...container, children };
}

export function containers(
  root: ContainerDraft,
  path = root.name,
): Array<{ id: number; name: string; container: ContainerDraft }> {
  return [
    { id: root.id, name: path, container: root },
    ...root.children.flatMap((node) =>
      node.kind === 'element'
        ? containers(node.definition, `${path} / ${node.placement.deploymentName ?? node.definition.name}`)
        : [],
    ),
  ];
}
export function parentOf(root: ContainerDraft, childId: number): ContainerDraft | undefined {
  if (root.children.some((node) => node.id === childId)) return root;
  for (const node of root.children) {
    if (node.kind === 'element') {
      const parent = parentOf(node.definition, childId);
      if (parent) return parent;
    }
  }
  return undefined;
}
export function childName(node: ChildNode): string {
  return node.placement.deploymentName ?? node.definition.name;
}

/** Page breaks divide a template form into pages; the production palette excludes them from elements. */
export function allowedInContainer(type: string, kind: ContainerDraft['kind']): boolean {
  return kind === 'template' || type !== 'pageBreak';
}
export function moveChild(root: ContainerDraft, childId: number, targetId: number, index: number): ContainerDraft {
  const parent = parentOf(root, childId);
  const target = findContainer(root, targetId);
  const node = parent?.children.find((child) => child.id === childId);
  if (!parent || !target || !node) throw new Error('The child or destination no longer exists.');
  if (node.kind === 'element' && findContainer(node.definition, targetId))
    throw new Error('An element cannot be moved into itself or one of its descendants.');
  if (node.kind === 'field' && !allowedInContainer(node.definition.type, target.kind))
    throw new Error('Page breaks can only be placed in templates.');
  if (target.children.some((child) => child.id !== childId && childName(child) === childName(node)))
    throw new Error('The destination already has a child with that property name. Rename the placement first.');
  const removed = updateContainer(root, parent.id, (container) => ({
    ...container,
    children: container.children.filter((child) => child.id !== childId),
  }));
  return updateContainer(removed, targetId, (container) => {
    const children = [...container.children];
    children.splice(Math.max(0, Math.min(index, children.length)), 0, node);
    return { ...container, children };
  });
}
