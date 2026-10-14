import { ContainerDraft } from './container-draft';
import { deploymentKeys, keyedChild } from './child-key-policy';

/** Keep view identity by deployment path when adopting the artifact returned after a save.
 * Reusable artifact IRIs are not occurrence identities: two placements can share one.
 * Removed, renamed or type-changed children deliberately receive fresh view identities.
 */
export function retainSessionIds(previous: ContainerDraft, incoming: ContainerDraft): ContainerDraft {
  if (previous.kind !== incoming.kind) return incoming;
  const oldKeys = deploymentKeys(previous.children.map(keyedChild), previous.kind);
  const newKeys = deploymentKeys(incoming.children.map(keyedChild), incoming.kind);
  const oldChildren = new Map(oldKeys.map((key, index) => [key, previous.children[index]]));
  return {
    ...incoming,
    id: previous.id,
    children: incoming.children.map((node, index) => {
      const old = oldChildren.get(newKeys[index]);
      if (!old || old.kind !== node.kind) return node;
      if (old.kind === 'element' && node.kind === 'element')
        return { ...node, id: old.id, definition: retainSessionIds(old.definition, node.definition) };
      if (old.kind === 'field' && node.kind === 'field' && old.definition.type === node.definition.type)
        return { ...node, id: old.id };
      return node;
    }),
  };
}
