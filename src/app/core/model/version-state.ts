/**
 * How a child relates to the reusable artifacts stored in the repository, and what its Version
 * tab can offer to do about that.
 *
 * A child is in one of four states. A local child was made in this document, and no stored
 * artifact is its origin. A linked child is a published artifact embedded as itself: it keeps the
 * stored identifier, and its definition cannot change here. A forked child is an editable copy of
 * a stored version, which its `pav:derivedFrom` identifies, and it has an identifier of its own. A
 * contained child sits inside a linked element, so it belongs to that element's content and
 * changes only when that element does.
 *
 * Which versions exist, and whether one can replace another without invalidating instances, are
 * questions only the host can answer. Their answers arrive here as a lookup, and the tab's actions
 * follow from the state, the lookup, whether the document can change, and what the host can do.
 * Nothing in this module calls the host.
 */
import type { CedArtifactVersion } from '../../ced-public-api';
import type { ChildNode, ContainerDraft, ElementNode } from './container-draft';
import { pathTo, publishedChild } from './child-locks';

export type VersionState =
  | { readonly kind: 'local' }
  | { readonly kind: 'linked'; readonly identifier: string }
  | { readonly kind: 'forked'; readonly origin: string }
  | { readonly kind: 'contained'; readonly owner: ElementNode };

/** The child's own `@id`. */
export function childIdentifier(node: ChildNode): string {
  return (node.kind === 'field' ? node.definition.atId : node.definition.identifier) ?? '';
}

/** The stored version the child was copied from, or null. */
export function childDerivedFrom(node: ChildNode): string | null {
  return (
    (node.kind === 'field' ? node.definition.artifact?.derivedFrom : node.definition.metadata?.artifact.derivedFrom) ??
    null
  );
}

/** The child's `pav:version`, or null when it has none. */
export function childVersion(node: ChildNode): string | null {
  return (node.kind === 'field' ? node.definition.artifact?.version : node.definition.version) || null;
}

/**
 * What a lookup about the child depends on: its kind, identity, origin and version. An answer
 * given for one signature does not describe a child whose signature has since changed.
 */
export function versionSignature(node: ChildNode): string {
  return JSON.stringify([node.kind, childIdentifier(node), childDerivedFrom(node), childVersion(node)]);
}

/** The state of the child `id` identifies, or null when the document holds no such child. */
export function versionState(root: ContainerDraft, id: number): VersionState | null {
  const path = pathTo(root, id);
  if (!path) return null;
  const owner = path
    .slice(0, -1)
    .find((ancestor): ancestor is ElementNode => ancestor.kind === 'element' && publishedChild(ancestor));
  if (owner) return { kind: 'contained', owner };
  const node = path[path.length - 1];
  if (publishedChild(node)) return { kind: 'linked', identifier: childIdentifier(node) };
  const origin = childDerivedFrom(node);
  return origin ? { kind: 'forked', origin } : { kind: 'local' };
}

function everyChild(container: ContainerDraft): ChildNode[] {
  return container.children.flatMap((node) =>
    node.kind === 'element' ? [node, ...everyChild(node.definition)] : [node],
  );
}

/**
 * The other children that come from the same stored artifact: a second copy of a linked child, a
 * fork of the same version, or a linked copy of the version a fork came from.
 */
export function otherPlaces(root: ContainerDraft, id: number): ChildNode[] {
  const node = pathTo(root, id)?.at(-1);
  if (!node) return [];
  const origin = childDerivedFrom(node) ?? childIdentifier(node);
  return everyChild(root).filter(
    (other) =>
      other.id !== id &&
      other.kind === node.kind &&
      (childIdentifier(other) === origin || (childDerivedFrom(other) ?? childIdentifier(other)) === origin),
  );
}

/**
 * Orders two version strings. CEDAR writes versions as dotted numbers, so each run of digits
 * compares as a number: 1.10.0 follows 1.9.0. A missing version precedes every other.
 */
export function compareVersions(a: string | null, b: string | null): number {
  return (a ?? '').localeCompare(b ?? '', 'en', { numeric: true });
}

/** The host's verdict on replacing a child with a candidate version. */
export type Verdict =
  | { readonly status: 'unchecked' }
  | { readonly status: 'pending' }
  | { readonly status: 'failed' }
  | { readonly status: 'compatible' }
  | { readonly status: 'unknown'; readonly invalidatedInstances: 0 }
  | { readonly status: 'breaking'; readonly invalidatedInstances: number };

/**
 * What the host said about a child's stored origin. `unavailable` means the host cannot list
 * versions, and `unreadable` that the origin was deleted or the user cannot read it: the host does
 * not distinguish the two, and nor does the tab.
 */
export type OriginLookup =
  | { readonly status: 'unavailable' }
  | { readonly status: 'pending' }
  | { readonly status: 'unreadable' }
  | { readonly status: 'failed' }
  | {
      readonly status: 'found';
      readonly versions: readonly CedArtifactVersion[];
      readonly candidate: CedArtifactVersion | null;
      readonly verdict: Verdict;
    };

/**
 * The version that could replace the child, from its origin's versions listed newest first.
 *
 * A linked child can move only to a newer published version, since only published artifacts are
 * linked. A fork can be replaced with its origin's newest published version, which discards its
 * local changes; that version may be the one it was copied from. Drafts are never replacement targets.
 */
export function candidateVersion(
  state: VersionState,
  current: string | null,
  versions: readonly CedArtifactVersion[],
): CedArtifactVersion | null {
  const newest = versions.find((version) => version.publicationStatus === 'bibo:published');
  if (state.kind === 'linked') {
    return newest && newest.id !== state.identifier && compareVersions(newest.version, current) > 0 ? newest : null;
  }
  return state.kind === 'forked' ? (newest ?? null) : null;
}

/** The version the child's origin identifier names, where the lookup listed it. */
export function originVersion(state: VersionState, lookup: OriginLookup): CedArtifactVersion | null {
  if (lookup.status !== 'found') return null;
  const id = state.kind === 'linked' ? state.identifier : state.kind === 'forked' ? state.origin : null;
  return lookup.versions.find((version) => version.id === id) ?? null;
}

export type VersionAction = 'open' | 'upgrade' | 'detach' | 'replace' | 'saveDraft' | 'publish';

export interface VersionContext {
  readonly state: VersionState;
  readonly lookup: OriginLookup;
  /**
   * Whether the child can be replaced where it stands: the document can change, and the child's
   * placement in its parent is not locked.
   */
  readonly editable: boolean;
  /** Which of the optional host operations the host supplies. */
  readonly host: { readonly open: boolean; readonly save: boolean };
}

/**
 * Whether the replacement would invalidate instances of this version of the template, which is
 * refused until the template is a new version.
 */
export function blockedByInstances(lookup: OriginLookup): boolean {
  return (
    lookup.status === 'found' &&
    !!lookup.candidate &&
    lookup.verdict.status === 'breaking' &&
    lookup.verdict.invalidatedInstances > 0
  );
}

/**
 * Whether the lookup offers a candidate the host allows. A pending or failed verdict offers none,
 * because a breaking replacement must never be presented as an unlabelled one. A host that gives no
 * verdicts at all has chosen not to check, and its candidates carry no label.
 */
export function replaceable(lookup: OriginLookup): boolean {
  if (lookup.status !== 'found' || !lookup.candidate) return false;
  const status = lookup.verdict.status;
  return (
    status === 'unchecked' ||
    status === 'compatible' ||
    status === 'unknown' ||
    (status === 'breaking' && !blockedByInstances(lookup))
  );
}

/** The actions a child's Version tab offers, in the order it shows them. */
export function versionActions({ state, lookup, editable, host }: VersionContext): VersionAction[] {
  const save: VersionAction[] = editable && host.save ? ['saveDraft', 'publish'] : [];
  switch (state.kind) {
    case 'contained':
      return [];
    case 'local':
      return save;
    case 'linked':
      return [
        ...(host.open && lookup.status !== 'unreadable' ? (['open'] as const) : []),
        ...(editable && replaceable(lookup) ? (['upgrade'] as const) : []),
        ...(editable ? (['detach'] as const) : []),
      ];
    case 'forked':
      return [...(editable && replaceable(lookup) ? (['replace'] as const) : []), ...save];
  }
}
