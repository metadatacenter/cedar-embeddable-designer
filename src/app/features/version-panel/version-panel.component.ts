import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { CedArtifactVersion } from '../../ced-public-api';
import { containerArtifactMetadata, fieldArtifactMetadata } from '../../core/model/cedar-template';
import { pathTo } from '../../core/model/child-locks';
import { ChildNode, ContainerDraft, fieldView } from '../../core/model/container-draft';
import { elementDisplayName, fieldDisplayName } from '../../core/model/field-display-name';
import {
  blockedByInstances,
  childVersion,
  compatibleUpgrade,
  OriginLookup,
  originVersion,
  otherPlaces,
  reusedChildren,
  VersionAction,
  versionActions,
  VersionState,
  versionState,
} from '../../core/model/version-state';
import { ChildVersionService } from '../../core/services/child-versions.service';
import { TemplateService } from '../../core/services/template.service';
import { countKey } from '../../i18n/messages';
import { publicationStatusLabel } from '../../shared/publication-status';

/** A sentence of the tab, as a translation key and the values it interpolates. */
interface Note {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** What a Version tab's lookups were made for. */
interface LookupContext {
  readonly generation: number;
  readonly document: ContainerDraft;
  readonly id: number;
  readonly ownTab: boolean;
}

/** How long an edit must rest before a child's verdict is asked for again. */
const LOOKUP_AFTER_EDIT_MS = 400;

/** One linked or copied child in the document's own summary. */
interface SummaryRow {
  readonly id: number;
  readonly name: string;
  readonly notes: readonly Note[];
}

function displayName(node: ChildNode): string {
  return node.kind === 'field' ? fieldDisplayName(fieldView(node)) : elementDisplayName(node);
}

/** What the lookup says about the newest version, as the sentences that report it. */
function lookupNotes(state: VersionState, lookup: OriginLookup): Note[] {
  switch (lookup.status) {
    case 'unavailable':
      return [];
    case 'pending':
      return [{ key: 'version.note.pending' }];
    case 'unreadable':
      return [{ key: 'version.note.unreadable' }];
    case 'failed':
      return [{ key: 'version.note.failed' }];
  }
  const candidate = lookup.candidate;
  if (!candidate) return state.kind === 'linked' ? [{ key: 'version.note.newest' }] : [];
  const version = { version: candidate.version ?? '' };
  const newest: Note =
    state.kind !== 'forked'
      ? { key: 'version.note.newer', params: version }
      : candidate.id === state.origin
        ? { key: 'version.note.originNewest' }
        : { key: 'version.note.originNewer', params: version };
  switch (lookup.verdict.status) {
    case 'unchecked':
      return [newest];
    case 'pending':
      return [newest, { key: 'version.note.checking' }];
    case 'failed':
    case 'unknown':
      return [newest, { key: 'version.note.uncheckable' }];
    case 'compatible':
      return [newest, { key: 'version.note.compatible' }];
    case 'breaking':
      return blockedByInstances(lookup)
        ? [
            newest,
            {
              key: countKey('version.note.blocked', lookup.verdict.invalidatedInstances),
              params: { count: lookup.verdict.invalidatedInstances },
            },
          ]
        : [newest, { key: 'version.note.breaking' }];
  }
}

/** The label of an upgrade or replacement, naming its verdict where the host gave one. */
function candidateLabel(action: 'upgrade' | 'replace', lookup: OriginLookup): Note {
  if (lookup.status !== 'found' || !lookup.candidate) return { key: `version.action.${action}` };
  const params = { version: lookup.candidate.version ?? '' };
  const verdict = lookup.verdict.status;
  const suffix = verdict === 'compatible' ? 'Compatible' : verdict === 'breaking' ? 'Breaking' : '';
  return { key: `version.action.${action}${suffix}`, params };
}

/**
 * A Version tab: the version and publication status of a child or of the document, how the child
 * relates to stored artifacts, and the actions that relation allows. Buttons appear only for
 * actions that are possible, so a tab can have none.
 */
@Component({
  selector: 'app-version-panel',
  imports: [TranslatePipe],
  templateUrl: './version-panel.component.html',
  styleUrl: './version-panel.component.scss',
})
export class VersionPanelComponent {
  /** The child, or the document root, whose versions the tab shows. */
  readonly nodeId = input.required<number>();
  /** Whether the tab is showing. Opening it looks the versions up. */
  readonly active = input(false);
  readonly service = inject(TemplateService);
  readonly versions = inject(ChildVersionService);

  private readonly document = computed<ContainerDraft>(() => this.service.session.document());
  /** Whether this is the document's own tab. A standalone field is its own document. */
  readonly ownTab = computed(() => this.nodeId() === this.document().id || this.service.fieldDocumentMode());
  private readonly node = computed<ChildNode | null>(() => pathTo(this.document(), this.nodeId())?.at(-1) ?? null);
  readonly state = computed<VersionState | null>(() =>
    this.ownTab() ? null : versionState(this.document(), this.nodeId()),
  );
  readonly lookup = computed<OriginLookup>(() =>
    this.ownTab() ? this.versions.documentLookup() : this.versions.lookup(this.nodeId()),
  );

  readonly artifact = computed(() => {
    const node = this.node();
    if (node?.kind === 'field') return fieldArtifactMetadata(fieldView(node));
    return containerArtifactMetadata(node?.kind === 'element' ? node.definition : this.document());
  });
  /** The version as stored, or as the writer would write it for an artifact that has none yet. */
  readonly version = computed(() => {
    const node = this.node();
    return (node ? childVersion(node) : this.document().version || null) ?? this.artifact().version ?? null;
  });
  readonly status = computed(() => publicationStatusLabel(this.artifact().publicationStatus));
  readonly origin = computed<CedArtifactVersion | null>(() => {
    const state = this.state();
    return state ? originVersion(state, this.lookup()) : null;
  });
  /** The stored artifact a linked child is, whose owner and folder are the child's own. */
  readonly linkedOrigin = computed(() => (this.state()?.kind === 'linked' ? this.origin() : null));
  readonly documentPublished = computed(
    () => this.document().metadata?.artifact.publicationStatus === 'bibo:published',
  );

  readonly actions = computed<VersionAction[]>(() => {
    const state = this.state();
    if (!state) return [];
    return versionActions({
      state,
      lookup: this.lookup(),
      editable: !this.service.placementLocked(this.nodeId()),
      host: this.versions.capabilities(),
    });
  });
  readonly busy = computed(() => this.versions.busy().has(this.nodeId()));
  readonly failure = computed(() => this.versions.failures().get(this.nodeId()) ?? null);

  /** The sentences under the version and status, in reading order. */
  readonly notes = computed<Note[]>(() => {
    const state = this.state();
    const node = this.node();
    if (!state || !node) return [];
    const lookup = this.lookup();
    const notes: Note[] = [];
    switch (state.kind) {
      case 'local':
        notes.push({ key: 'version.note.local' });
        break;
      case 'contained':
        notes.push({
          key: 'version.note.contained',
          params: { name: elementDisplayName(state.owner), version: state.owner.definition.version },
        });
        break;
      case 'linked':
        notes.push({ key: 'version.note.linked', params: { name: displayName(node), version: this.version() ?? '' } });
        notes.push(...lookupNotes(state, lookup));
        break;
      case 'forked': {
        const origin = this.origin();
        notes.push(
          origin
            ? { key: 'version.note.forked', params: { name: origin.name, version: origin.version ?? '' } }
            : { key: 'version.note.forkedUnlisted', params: { origin: state.origin } },
        );
        notes.push(...lookupNotes(state, lookup));
        break;
      }
    }
    if (
      this.documentPublished() &&
      (state.kind === 'linked' || state.kind === 'forked') &&
      lookup.status === 'found' &&
      lookup.candidate
    ) {
      notes.push({ key: 'version.note.publishedDocument' });
    }
    const places = otherPlaces(this.document(), node.id);
    if (places.length)
      notes.push({ key: 'version.note.alsoUsed', params: { names: places.map(displayName).join(', ') } });
    return notes;
  });

  readonly upgradeLabel = computed(() => candidateLabel('upgrade', this.lookup()));
  readonly replaceLabel = computed(() => candidateLabel('replace', this.lookup()));
  readonly replaceTitle = computed<Note>(() => {
    const lookup = this.lookup();
    return {
      key: 'version.replaceDialog.title',
      params: { version: lookup.status === 'found' ? (lookup.candidate?.version ?? '') : '' },
    };
  });
  readonly replaceDescription = computed<Note>(() => {
    const lookup = this.lookup();
    const node = this.node();
    const candidate = lookup.status === 'found' ? lookup.candidate : null;
    return {
      key: 'version.replaceDialog.description',
      params: { name: node ? displayName(node) : '', origin: candidate?.name ?? '', version: candidate?.version ?? '' },
    };
  });

  /** The document's own tab: every linked and copied child, with what its lookup found. */
  readonly summary = computed<SummaryRow[]>(() => {
    if (!this.ownTab()) return [];
    const root = this.document();
    return reusedChildren(root).flatMap((node): SummaryRow[] => {
      const state = versionState(root, node.id);
      if (!state) return [];
      const lookup = this.versions.lookup(node.id);
      const origin = originVersion(state, lookup);
      const first: Note =
        state.kind === 'linked'
          ? { key: 'version.summary.linked', params: { version: childVersion(node) ?? '' } }
          : origin
            ? { key: 'version.summary.forked', params: { name: origin.name, version: origin.version ?? '' } }
            : {
                key: 'version.summary.forkedUnlisted',
                params: { origin: state.kind === 'forked' ? state.origin : '' },
              };
      return [{ id: node.id, name: displayName(node), notes: [first, ...lookupNotes(state, lookup)] }];
    });
  });
  readonly upgradeAll = computed(() => {
    if (!this.ownTab() || this.service.access.readOnly()) return false;
    const root = this.document();
    return reusedChildren(root).some((node) => {
      const state = versionState(root, node.id);
      return (
        !!state && compatibleUpgrade(state, this.versions.lookup(node.id)) && !this.service.placementLocked(node.id)
      );
    });
  });
  readonly ownNotes = computed<Note[]>(() => {
    if (!this.ownTab()) return [];
    const notes: Note[] = [];
    const lookup = this.lookup();
    if (lookup.status === 'unreadable') notes.push({ key: 'version.note.notStored' });
    if (lookup.status === 'failed') notes.push({ key: 'version.note.failed' });
    if (!this.service.fieldDocumentMode() && !this.summary().length) notes.push({ key: 'version.note.noReused' });
    if (this.documentPublished() && this.summary().some((row) => this.hasCandidate(row.id)))
      notes.push({ key: 'version.note.publishedDocument' });
    return notes;
  });

  private hasCandidate(id: number): boolean {
    const lookup = this.versions.lookup(id);
    return lookup.status === 'found' && !!lookup.candidate;
  }

  /** Bind assessments to the complete document, including parent placement and other children. */
  private readonly lookupContext = computed<LookupContext | null>(() => {
    if (!this.active()) return null;
    return {
      generation: this.versions.generation(),
      document: this.document(),
      id: this.nodeId(),
      ownTab: this.ownTab(),
    };
  });
  private lookedUp: LookupContext | null = null;

  constructor() {
    // The document's own versions belong to the stored artifact it is, so they are looked up when the
    // tab opens and when the document becomes another artifact, and not on every edit.
    effect(() => {
      if (!this.active() || !this.ownTab()) return;
      this.versions.generation();
      this.versions.documentSignature();
      untracked(() => this.versions.refreshDocument());
    });
    // A child's verdict weighs the whole document, so an edit asks again. It waits until typing
    // pauses: asking on every keystroke sent the host a request each time.
    effect((onCleanup) => {
      const context = this.lookupContext();
      const previous = this.lookedUp;
      this.lookedUp = context;
      if (context === null) return;
      const lookUp = () =>
        untracked(() => {
          if (!context.ownTab) this.versions.refresh(context.id);
          else if (!this.service.fieldDocumentMode()) this.versions.refreshAll();
        });
      const edited =
        previous !== null &&
        previous.id === context.id &&
        previous.ownTab === context.ownTab &&
        previous.generation === context.generation &&
        previous.document !== context.document;
      if (!edited) {
        lookUp();
        return;
      }
      const timer = setTimeout(lookUp, LOOKUP_AFTER_EDIT_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  run(action: VersionAction, dialog?: HTMLDialogElement): void {
    const id = this.nodeId();
    switch (action) {
      case 'open':
        this.versions.open(id);
        return;
      case 'upgrade':
        void this.versions.replace([id]);
        return;
      case 'replace':
        dialog?.showModal();
        return;
      case 'detach':
        this.versions.detach(id);
        return;
      case 'saveDraft':
        void this.versions.save(id, false);
        return;
      case 'publish':
        void this.versions.save(id, true);
        return;
    }
  }

  confirmReplace(dialog: HTMLDialogElement): void {
    dialog.close();
    void this.versions.replace([this.nodeId()]);
  }

  upgradeCompatible(): void {
    void this.versions.upgradeCompatible();
  }
}
