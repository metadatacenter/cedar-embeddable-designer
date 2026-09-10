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
export function fieldView(node: FieldNode): Field {
  return { ...node.definition, ...node.placement, id: node.id };
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
  const remaining = fields.map(fieldNode);
  const children: ChildNode[] = [];
  for (const node of container.children) {
    if (node.kind === 'element') children.push(node);
    else if (remaining.length) children.push(remaining.shift()!);
  }
  children.push(...remaining);
  return { ...container, children };
}
