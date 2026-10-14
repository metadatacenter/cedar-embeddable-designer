import { computed, signal, Signal } from '@angular/core';
import { childLocks } from '../model/child-locks';
import { ContainerDraft, isPlacementKey, parentOf } from '../model/container-draft';

/**
 * One session's editing policy. Inspection (selection, expansion, tabs and preview)
 * does not require write access. Definition edits and parent-owned placement edits
 * do: publication may lock the former without locking the latter.
 *
 * Host document replacement is a separate operation and never grants editing access.
 * Unknown node identities fail closed. The synthetic parent of a standalone field
 * is not an editable placement surface.
 */
export class EditorAccess {
  private readonly requestedReadOnly = signal(false);
  readonly hostReadOnly = this.requestedReadOnly.asReadonly();
  readonly fieldDocument = signal(false);
  readonly readOnly = computed(() => this.documentReadOnly(this.document()));

  constructor(private readonly document: Signal<ContainerDraft>) {}

  /** Called by the coordinator, which synchronously cancels outstanding editing intents. */
  setHostReadOnly(value: boolean): boolean {
    if (this.hostReadOnly() === !!value) return false;
    this.requestedReadOnly.set(!!value);
    return true;
  }

  private documentReadOnly(document: ContainerDraft): boolean {
    return (
      this.hostReadOnly() ||
      document.metadata?.artifact.publicationStatus === 'bibo:published' ||
      (this.fieldDocument() &&
        document.children.some((child) => child.kind === 'field' && !!child.definition.publishedDefinition))
    );
  }

  canEditDefinition(id: number, document = this.document()): boolean {
    const exists = document.id === id || !!parentOf(document, id);
    return exists && !this.documentReadOnly(document) && !childLocks(document, id).definition;
  }

  canEditPlacement(id: number, document = this.document()): boolean {
    return (
      !this.fieldDocument() &&
      !!parentOf(document, id) &&
      !this.documentReadOnly(document) &&
      !childLocks(document, id).placement
    );
  }

  /** Root headers edit the definition; child headers edit their parent's placement. */
  canEditHeader(id: number): boolean {
    return id === this.document().id || this.fieldDocument() ? this.canEditDefinition(id) : this.canEditPlacement(id);
  }

  canChange(id: number, keys: readonly string[], document = this.document()): boolean {
    if (!this.canEditDefinition(id, document) && !this.canEditPlacement(id, document)) return false;
    return keys.every((key) =>
      isPlacementKey(key) && !this.fieldDocument()
        ? this.canEditPlacement(id, document)
        : this.canEditDefinition(id, document),
    );
  }
}
