/**
 * The Version tab's exchanges with the host: looking up a child's stored origin, asking whether a
 * newer version is compatible, and storing a child as a reusable artifact.
 *
 * A lookup starts when a Version tab opens, so what the tab shows is as fresh as the moment it was
 * opened, and nothing polls. Each child has at most one lookup in flight. An answer is kept only
 * while the child is still the one it was asked about, and replacing the child source or the
 * document abandons every lookup, so a late answer never reaches another child.
 */
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { CedArtifactReference, CedArtifactVersion, CedChildSource, CedJsonObject } from '../../ced-public-api';
import { CedLanguageService } from '../../i18n/ced-language.service';
import { LocalizedError, message } from '../../i18n/messages';
import { buildContainer, fieldToJson, JsonSourcePolicy, templateToJson } from '../model/cedar-template';
import { pathTo } from '../model/child-locks';
import { ChildNode, fieldView } from '../model/container-draft';
import {
  candidateVersion,
  childIdentifier,
  childVersion,
  compatibleUpgrade,
  OriginLookup,
  reusedChildren,
  Verdict,
  versionSignature,
  versionState,
} from '../model/version-state';
import { TemplateService } from './template.service';

interface Entry {
  readonly signature: string;
  readonly lookup: OriginLookup;
}

const PENDING: OriginLookup = { status: 'pending' };

function isJsonObject(value: unknown): value is CedJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The child as the complete artifact the host would store or compare. */
export function childArtifact(node: ChildNode): CedJsonObject {
  const json = node.kind === 'field' ? fieldToJson(fieldView(node)) : templateToJson(buildContainer(node.definition));
  const artifact: unknown = JsonSourcePolicy.clone(json);
  if (!isJsonObject(artifact)) throw new Error();
  return artifact;
}

function verdictOf(compatible: boolean, invalidated: unknown): Verdict {
  if (compatible) return { status: 'compatible' };
  const count =
    typeof invalidated === 'number' && Number.isFinite(invalidated) ? Math.max(0, Math.floor(invalidated)) : 0;
  return { status: 'breaking', invalidatedInstances: count };
}

@Injectable({ providedIn: 'root' })
export class ChildVersionService {
  private readonly service = inject(TemplateService);
  private readonly language = inject(CedLanguageService);
  private readonly entries = signal<ReadonlyMap<number, Entry>>(new Map());
  private readonly documentEntry = signal<Entry | null>(null);
  private readonly controllers = new Map<number, AbortController>();
  /** Candidate artifacts already loaded for a verdict, so an upgrade need not load them again. */
  private readonly loaded = new Map<string, CedJsonObject>();
  /** The children with a save or replacement in progress. */
  readonly busy = signal<ReadonlySet<number>>(new Set());
  /** The last failed save or replacement, by child, as the message to show. */
  readonly failures = signal<ReadonlyMap<number, string>>(new Map());

  /** Counts the resets, so a tab that is open when one happens knows to look again. */
  readonly generation = signal(0);
  private readonly documentId = computed(() => this.service.session.document().id);

  constructor() {
    effect(() => {
      this.service.childSource();
      this.documentId();
      untracked(() => this.reset());
    });
  }

  private reset(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    this.loaded.clear();
    this.entries.set(new Map());
    this.documentEntry.set(null);
    this.busy.set(new Set());
    this.failures.set(new Map());
    this.generation.update((generation) => generation + 1);
  }

  private node(id: number): ChildNode | null {
    return pathTo(this.service.session.document(), id)?.at(-1) ?? null;
  }

  /** The lookup for the child, while the child is still the one it was made for. */
  lookup(id: number): OriginLookup {
    const entry = this.entries().get(id);
    const node = this.node(id);
    return entry && node && entry.signature === versionSignature(node) ? entry.lookup : PENDING;
  }

  /** What the host supplies beyond search and load. */
  capabilities(): { readonly open: boolean; readonly save: boolean } {
    const source = this.service.childSource();
    return { open: !!source?.open, save: !!source?.save };
  }

  private set(id: number, signature: string, lookup: OriginLookup): void {
    this.entries.update((entries) => new Map(entries).set(id, { signature, lookup }));
  }

  /** Look up the origin of one child, abandoning any lookup for it still in flight. */
  refresh(id: number): void {
    const node = this.node(id);
    const state = versionState(this.service.session.document(), id);
    if (!node || !state || (state.kind !== 'linked' && state.kind !== 'forked')) return;
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    const signature = versionSignature(node);
    const source = this.service.childSource();
    if (!source?.versions) {
      this.set(id, signature, { status: 'unavailable' });
      return;
    }
    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.set(id, signature, PENDING);
    const reference: CedArtifactReference = {
      id: state.kind === 'linked' ? state.identifier : state.origin,
      type: node.kind,
    };
    void this.find(id, node, signature, source, reference, controller.signal);
  }

  /** Look up every linked and forked child the document's own tab summarizes. */
  refreshAll(): void {
    for (const node of reusedChildren(this.service.session.document())) this.refresh(node.id);
  }

  /** The stored artifact the document is: a standalone field is its own document. */
  private documentReference(): { readonly reference: CedArtifactReference; readonly signature: string } | null {
    const root = this.service.session.document();
    const field = this.service.fieldDocumentMode() ? root.children[0] : undefined;
    const id = field ? childIdentifier(field) : root.identifier;
    if (!id) return null;
    const reference: CedArtifactReference = { id, type: field ? 'field' : root.kind };
    return { reference, signature: JSON.stringify([reference, field ? childVersion(field) : root.version]) };
  }

  /** The versions of the document itself, while it is still the artifact they were looked up for. */
  documentLookup(): OriginLookup {
    const entry = this.documentEntry();
    const current = this.documentReference();
    // A document that was never stored has no versions to look for.
    if (!current) return { status: 'unavailable' };
    return entry && entry.signature === current.signature ? entry.lookup : PENDING;
  }

  /** Look up the versions of the document itself. */
  refreshDocument(): void {
    this.controllers.get(0)?.abort();
    this.controllers.delete(0);
    const current = this.documentReference();
    const source = this.service.childSource();
    if (!current) return;
    const { reference, signature } = current;
    if (!source?.versions) {
      this.documentEntry.set({ signature, lookup: { status: 'unavailable' } });
      return;
    }
    const controller = new AbortController();
    this.controllers.set(0, controller);
    this.documentEntry.set({ signature, lookup: PENDING });
    const done = (lookup: OriginLookup) => {
      if (!controller.signal.aborted) this.documentEntry.set({ signature, lookup });
    };
    source.versions(reference, { signal: controller.signal }).then(
      (versions) =>
        done(
          Array.isArray(versions)
            ? { status: 'found', versions: [...versions], candidate: null, verdict: { status: 'unchecked' } }
            : { status: 'unreadable' },
        ),
      () => done({ status: 'failed' }),
    );
  }

  private async find(
    id: number,
    node: ChildNode,
    signature: string,
    source: CedChildSource,
    reference: CedArtifactReference,
    signal: AbortSignal,
  ): Promise<void> {
    const state = versionState(this.service.session.document(), id);
    if (!state) return;
    let versions: CedArtifactVersion[] | null;
    try {
      versions = await source.versions!(reference, { signal });
    } catch {
      if (!signal.aborted) this.set(id, signature, { status: 'failed' });
      return;
    }
    if (signal.aborted) return;
    if (!Array.isArray(versions)) {
      this.set(id, signature, { status: 'unreadable' });
      return;
    }
    const listed = [...versions];
    const candidate = candidateVersion(state, childVersion(node), listed);
    const found = (verdict: Verdict): OriginLookup => ({ status: 'found', versions: listed, candidate, verdict });
    if (!candidate || !source.compatibility) {
      this.set(id, signature, found({ status: 'unchecked' }));
      return;
    }
    this.set(id, signature, found({ status: 'pending' }));
    try {
      const artifact = await this.candidateArtifact(source, candidate, node.kind, signal);
      const result = await source.compatibility(childArtifact(node), artifact, { type: node.kind, signal });
      if (!signal.aborted)
        this.set(id, signature, found(verdictOf(!!result?.compatible, result?.invalidatedInstances)));
    } catch {
      if (!signal.aborted) this.set(id, signature, found({ status: 'failed' }));
    }
  }

  private async candidateArtifact(
    source: CedChildSource,
    candidate: CedArtifactVersion,
    type: ChildNode['kind'],
    signal: AbortSignal,
  ): Promise<CedJsonObject> {
    const cached = this.loaded.get(candidate.id);
    if (cached) return cached;
    const artifact = await source.load(
      { id: candidate.id, name: candidate.name, type, version: candidate.version },
      { signal },
    );
    if (!isJsonObject(artifact)) throw new LocalizedError(message('version.hostArtifact'));
    this.loaded.set(candidate.id, artifact);
    return artifact;
  }

  /** Show the stored artifact a linked child is, where the host can. */
  open(id: number): void {
    const node = this.node(id);
    const source = this.service.childSource();
    if (node && source?.open) source.open({ id: childIdentifier(node), type: node.kind });
  }

  /** Replace each child with the candidate its lookup found, in one change to the document. */
  async replace(ids: readonly number[]): Promise<void> {
    const source = this.service.childSource();
    const targets = ids.flatMap((id) => {
      const lookup = this.lookup(id);
      const node = this.node(id);
      return node && lookup.status === 'found' && lookup.candidate ? [{ id, node, candidate: lookup.candidate }] : [];
    });
    if (!source || !targets.length) return;
    await this.attempt(
      targets.map(({ id }) => id),
      async (signal) => {
        const replacements = await Promise.all(
          targets.map(async ({ id, node, candidate }) => ({
            id,
            type: node.kind,
            artifact: await this.candidateArtifact(source, candidate, node.kind, signal),
          })),
        );
        if (targets.some(({ id, node }) => this.node(id) !== node)) return;
        this.service.replaceChildren(replacements);
      },
    );
  }

  /** Upgrade every linked child whose newer version the host judged compatible. */
  upgradeCompatible(): Promise<void> {
    const root = this.service.session.document();
    return this.replace(
      reusedChildren(root)
        .filter((node) => {
          const state = versionState(root, node.id);
          return !!state && compatibleUpgrade(state, this.lookup(node.id));
        })
        .map((node) => node.id),
    );
  }

  /** Store the child as a reusable artifact and put the stored artifact in its place. */
  async save(id: number, publish: boolean): Promise<void> {
    const node = this.node(id);
    const source = this.service.childSource();
    if (!node || !source?.save) return;
    await this.attempt([id], async (signal) => {
      const stored: unknown = await source.save!(childArtifact(node), { type: node.kind, publish, signal });
      if (!isJsonObject(stored)) throw new LocalizedError(message('version.hostArtifact'));
      if (this.node(id) !== node) return;
      this.service.replaceChildren([{ id, type: node.kind, artifact: stored }]);
    });
  }

  detach(id: number): boolean {
    return this.service.detachChild(id);
  }

  private async attempt(ids: readonly number[], work: (signal: AbortSignal) => Promise<void>): Promise<void> {
    const controller = new AbortController();
    const document = this.service.session.document().id;
    for (const id of ids) this.controllers.set(-id, controller);
    this.busy.update((busy) => new Set([...busy, ...ids]));
    this.failures.update((failures) => {
      const next = new Map(failures);
      for (const id of ids) next.delete(id);
      return next;
    });
    try {
      await work(controller.signal);
    } catch (error) {
      if (controller.signal.aborted || this.service.session.document().id !== document) return;
      const text = this.language.describe(error);
      this.failures.update((failures) => {
        const next = new Map(failures);
        for (const id of ids) next.set(id, text);
        return next;
      });
    } finally {
      if (!controller.signal.aborted) {
        for (const id of ids) this.controllers.delete(-id);
        this.busy.update((busy) => new Set([...busy].filter((id) => !ids.includes(id))));
      }
    }
  }
}
