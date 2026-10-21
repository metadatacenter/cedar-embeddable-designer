/**
 * The identity a child takes when it arrives from the repository or stops being a stored artifact.
 *
 * A published artifact is linked: it keeps the stored `@id`, because its locked definition is the
 * stored artifact. A draft is copied: the copy gets an `@id` of its own and names the version it
 * came from in `pav:derivedFrom`, so every draft that is imported becomes a fork. A fork starts its
 * own version line at 0.0.1, has no previous version, and has not been created or modified as an
 * artifact of its own. Detaching a linked child makes the same kind of copy.
 *
 * Only the child itself changes identity. An element's descendants are part of its content, so a
 * published descendant stays linked and an inline one keeps its identifiers.
 */
import type { ArtifactMetadata } from '../models/types';
import {
  containerArtifactMetadata,
  fieldArtifactMetadata,
  newElementIdentifier,
  newFieldIdentity,
} from './cedar-template';
import { publishedChild } from './child-locks';
import { ChildNode, fieldNode, fieldView } from './container-draft';
import { childIdentifier } from './version-state';

/** The version a fork starts its own version line at. */
export const FORK_VERSION = '0.0.1';

function forkedMetadata(metadata: ArtifactMetadata, origin: string): ArtifactMetadata {
  return {
    ...metadata,
    version: FORK_VERSION,
    publicationStatus: 'bibo:draft',
    derivedFrom: origin,
    previousVersion: null,
    createdOn: null,
    createdBy: null,
    modifiedOn: null,
    modifiedBy: null,
  };
}

/** An editable copy of a stored child, with its own identifier, derived from the child's. */
export function forkedChild(node: ChildNode): ChildNode {
  const origin = childIdentifier(node);
  if (node.kind === 'field') {
    const field = fieldView(node);
    return fieldNode({
      ...field,
      atId: newFieldIdentity().atId,
      publishedDefinition: undefined,
      artifact: forkedMetadata(fieldArtifactMetadata(field), origin),
    });
  }
  const definition = node.definition;
  const metadata = definition.metadata ?? {
    artifact: containerArtifactMetadata(definition),
    language: null,
    annotations: undefined,
    instanceType: null,
    header: null,
    footer: null,
  };
  return {
    ...node,
    definition: {
      ...definition,
      identifier: newElementIdentifier(),
      version: FORK_VERSION,
      metadata: { ...metadata, artifact: forkedMetadata(metadata.artifact, origin) },
    },
  };
}

/** What a child read from the repository becomes in the document: linked when published, else a fork. */
export function importedChild(node: ChildNode): ChildNode {
  return publishedChild(node) || !childIdentifier(node) ? node : forkedChild(node);
}

/**
 * `replacement`'s definition in `existing`'s place. The parent's placement of the child stays as
 * the author left it: its key, labels, requirement, multiplicity and property.
 */
export function replacedChild(existing: ChildNode, replacement: ChildNode): ChildNode | null {
  if (existing.kind === 'field' && replacement.kind === 'field') {
    return { ...replacement, id: existing.id, placement: existing.placement };
  }
  if (existing.kind === 'element' && replacement.kind === 'element') {
    return {
      ...replacement,
      id: existing.id,
      placement: existing.placement,
      definition: { ...replacement.definition, id: existing.id },
    };
  }
  return null;
}
