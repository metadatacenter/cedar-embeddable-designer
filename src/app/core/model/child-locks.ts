import type { ChildNode, ContainerDraft } from './container-draft';

/** Whether an element's definition is published, so its own content can no longer change. */
export function publishedContainer(container: ContainerDraft): boolean {
  return container.kind === 'element' && container.metadata?.artifact.publicationStatus === 'bibo:published';
}

/** Whether a child's own definition is published. */
export function publishedChild(node: ChildNode): boolean {
  return node.kind === 'field' ? !!node.definition.publishedDefinition : publishedContainer(node.definition);
}

/**
 * What of a child can no longer change: its own definition, and its placement in its parent.
 *
 * A published child keeps its definition, but its parent still decides how to place it: its key,
 * its display name and description, its requirement and multiplicity. A child inside a published
 * element is part of that element's content, so neither changes, and nor does anything below it.
 */
export interface ChildLocks {
  readonly definition: boolean;
  readonly placement: boolean;
}

const UNLOCKED: ChildLocks = { definition: false, placement: false };

/** The children from the root's own down to the one identified, or null when it is not there. */
function pathTo(container: ContainerDraft, id: number): ChildNode[] | null {
  for (const child of container.children) {
    if (child.id === id) return [child];
    if (child.kind === 'element') {
      const below = pathTo(child.definition, id);
      if (below) return [child, ...below];
    }
  }
  return null;
}

/** The locks on a child, or on the element whose definition `id` identifies. The root has none. */
export function childLocks(root: ContainerDraft, id: number): ChildLocks {
  const path = pathTo(root, id);
  if (!path) return UNLOCKED;
  const node = path[path.length - 1];
  const placement = path.slice(0, -1).some(publishedChild);
  return { placement, definition: placement || publishedChild(node) };
}
