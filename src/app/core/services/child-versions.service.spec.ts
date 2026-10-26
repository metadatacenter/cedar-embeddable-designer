/**
 * The Version tab's exchanges with a host, against a host that answers from a small repository.
 *
 * The repository holds a field's version line, 1.1.0 and 1.2.0 published and 1.3.0 either
 * published or not, and a judge that calls each replacement compatible or breaking. The matrix
 * crosses how the child arrived (linked at 1.2.0, or copied from 1.1.0) with what the host can
 * answer, and asserts what the lookup reports; the remaining cases cover the changes the tab can
 * make and the answers that arrive too late to apply.
 */
import { TestBed } from '@angular/core/testing';
import type { CedArtifactVersion, CedChildSource, CedCompatibility, CedJsonObject } from '../../ced-public-api';
import { fieldToJson, newFieldIdentity } from '../model/cedar-template';
import { newNodeId } from '../model/container-draft';
import { Field } from '../models/types';
import { childDerivedFrom, childIdentifier, childVersion, versionState } from '../model/version-state';
import { ChildVersionService } from './child-versions.service';
import { TemplateService } from './template.service';

const LINE = ['v110', 'v120', 'v130'] as const;
type Id = (typeof LINE)[number];

function artifact(id: Id, number: string, published: boolean): CedJsonObject {
  const field: Field = {
    id: newNodeId(),
    ...newFieldIdentity(),
    atId: `https://repo.metadatacenter.org/template-fields/${id}`,
    type: 'text',
    name: 'Sample',
    status: 'optional',
    options: [],
    defaultValue: { kind: 'none' },
    allowMultiple: false,
  };
  const json = fieldToJson(field) as CedJsonObject;
  return { ...json, 'pav:version': number, 'bibo:status': published ? 'bibo:published' : 'bibo:draft' };
}

const iri = (id: Id) => `https://repo.metadatacenter.org/template-fields/${id}`;

interface Repository {
  readonly newestPublished: boolean;
  readonly readable: boolean;
  readonly lookupFails: boolean;
  readonly verdict: CedCompatibility | 'fails' | 'none';
}

function repository({ newestPublished, readable, lookupFails, verdict }: Repository) {
  const artifacts: Record<string, CedJsonObject> = {
    [iri('v110')]: artifact('v110', '1.1.0', true),
    [iri('v120')]: artifact('v120', '1.2.0', true),
    [iri('v130')]: artifact('v130', '1.3.0', newestPublished),
  };
  const listing: CedArtifactVersion[] = [...LINE].reverse().map((id) => ({
    id: iri(id),
    name: 'Sample',
    version: artifacts[iri(id)]['pav:version'] as string,
    publicationStatus: artifacts[iri(id)]['bibo:status'] as 'bibo:draft' | 'bibo:published',
    owner: 'test1',
    folder: 'Shared',
  }));
  const stored: CedJsonObject[] = [];
  const opened: string[] = [];
  const source: CedChildSource = {
    search: async () => ({ results: [] }),
    load: async (result) => artifacts[result.id],
    versions: async () => {
      if (lookupFails) throw new Error('offline');
      return readable ? listing : null;
    },
    ...(verdict === 'none'
      ? {}
      : {
          compatibility: async () => {
            if (verdict === 'fails') throw new Error('offline');
            return verdict;
          },
        }),
    save: async (child, { publish }) => {
      const id = `https://repo.metadatacenter.org/template-fields/stored-${stored.length}`;
      const result = { ...child, '@id': id, 'bibo:status': publish ? 'bibo:published' : 'bibo:draft' };
      stored.push(result);
      return result;
    },
    open: (reference) => opened.push(reference.id),
  };
  return { source, artifacts, stored, opened };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('ChildVersionService', () => {
  let service: TemplateService;
  let versions: ChildVersionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateService);
    versions = TestBed.inject(ChildVersionService);
  });

  /** A template holding one child imported from the repository, as a link or as a copy. */
  function holding(how: 'linked' | 'copied', source: CedChildSource): number {
    service.childSource.set(source);
    TestBed.tick();
    const json =
      how === 'linked' ? artifact('v120', '1.2.0', true) : { ...artifact('v110', '1.1.0', false), '@id': iri('v110') };
    const [id] = service.importChildren([{ type: 'field', artifact: json }], service.session.document().id, 0);
    return id;
  }

  const HOWS = ['linked', 'copied'] as const;
  const VERDICTS: Repository['verdict'][] = [
    'none',
    'fails',
    { compatible: true },
    { compatible: false },
    { compatible: false, invalidatedInstances: 0 },
    { compatible: false, invalidatedInstances: 4 },
  ];
  const cases = HOWS.flatMap((how) =>
    [true, false].flatMap((newestPublished) =>
      [true, false].flatMap((readable) =>
        [true, false].flatMap((lookupFails) =>
          VERDICTS.map((verdict) => [how, newestPublished, readable, lookupFails, verdict] as const),
        ),
      ),
    ),
  );

  it.each(cases)(
    'a %s child; newest published %s; readable %s; lookup fails %s; verdict %j',
    async (how, newestPublished, readable, lookupFails, verdict) => {
      const { source } = repository({ newestPublished, readable, lookupFails, verdict });
      const id = holding(how, source);
      versions.refresh(id);
      expect(versions.lookup(id)).toEqual({ status: 'pending' });
      await settle();
      await settle();
      const lookup = versions.lookup(id);
      if (lookupFails) return expect(lookup).toEqual({ status: 'failed' });
      if (!readable) return expect(lookup).toEqual({ status: 'unreadable' });
      if (lookup.status !== 'found') throw new Error(`expected a found lookup, not ${lookup.status}`);
      expect(lookup.versions.map((entry) => entry.version)).toEqual(['1.3.0', '1.2.0', '1.1.0']);
      // Both use published releases. A copy may return to an older release in its origin's line.
      const candidate =
        how === 'linked' ? (newestPublished ? iri('v130') : null) : iri(newestPublished ? 'v130' : 'v120');
      expect(lookup.candidate?.id ?? null).toBe(candidate);
      if (!candidate || verdict === 'none') return expect(lookup.verdict).toEqual({ status: 'unchecked' });
      if (verdict === 'fails') return expect(lookup.verdict).toEqual({ status: 'failed' });
      expect(lookup.verdict).toEqual(
        verdict.compatible
          ? { status: 'compatible' }
          : verdict.invalidatedInstances === undefined
            ? { status: 'failed' }
            : { status: 'breaking', invalidatedInstances: verdict.invalidatedInstances },
      );
    },
  );

  it('reports a host that cannot list versions as unavailable, at once', () => {
    const { source } = repository({ newestPublished: true, readable: true, lookupFails: false, verdict: 'none' });
    const id = holding('linked', { search: source.search, load: source.load });
    versions.refresh(id);
    expect(versions.lookup(id)).toEqual({ status: 'unavailable' });
    expect(versions.capabilities()).toEqual({ open: false, save: false });
  });

  it('drops an answer for a document that was replaced while it was on its way', async () => {
    const { source } = repository({ newestPublished: true, readable: true, lookupFails: false, verdict: 'none' });
    const id = holding('linked', source);
    versions.refresh(id);
    service.resetTemplate('template', false);
    TestBed.tick();
    await settle();
    expect(versions.lookup(id)).toEqual({ status: 'pending' });
  });

  it('drops an answer for a child that changed while it was on its way', async () => {
    const { source } = repository({ newestPublished: true, readable: true, lookupFails: false, verdict: 'none' });
    const id = holding('linked', source);
    versions.refresh(id);
    expect(service.detachChild(id)).toBe(true);
    await settle();
    expect(versions.lookup(id)).toEqual({ status: 'pending' });
  });

  it('upgrades a linked child to the newer version and keeps its key', async () => {
    const { source } = repository({
      newestPublished: true,
      readable: true,
      lookupFails: false,
      verdict: { compatible: true },
    });
    const id = holding('linked', source);
    const key = service.childKey(id);
    versions.refresh(id);
    await settle();
    await settle();
    await versions.replace([id]);
    const node = service.session.document().children.find((child) => child.id === id)!;
    expect(childIdentifier(node)).toBe(iri('v130'));
    expect(childVersion(node)).toBe('1.3.0');
    expect(service.childKey(id)).toBe(key);
    expect(versionState(service.session.document(), id)?.kind).toBe('linked');
  });

  it('replaces a copy with its origin, which is then linked', async () => {
    const { source } = repository({
      newestPublished: true,
      readable: true,
      lookupFails: false,
      verdict: { compatible: true },
    });
    const id = holding('copied', source);
    versions.refresh(id);
    await settle();
    await settle();
    await versions.replace([id]);
    expect(versionState(service.session.document(), id)).toEqual({ kind: 'linked', identifier: iri('v130') });
  });

  it.each([
    null,
    {},
    { compatible: 'false' },
    { compatible: false },
    { compatible: false, invalidatedInstances: null },
    { compatible: false, invalidatedInstances: -1 },
    { compatible: false, invalidatedInstances: 0.5 },
    { compatible: false, invalidatedInstances: Number.NaN },
    { compatible: false, invalidatedInstances: Number.POSITIVE_INFINITY },
    { compatible: false, invalidatedInstances: Number.MAX_SAFE_INTEGER + 1 },
    { compatible: true, invalidatedInstances: 1 },
  ])('does not authorize replacement from an incomplete or inconsistent assessment: %j', async (answer) => {
    const { source } = repository({ newestPublished: true, readable: true, lookupFails: false, verdict: 'none' });
    const id = holding('copied', { ...source, compatibility: async () => answer as CedCompatibility });
    versions.refresh(id);
    await settle();
    const before = service.session.document();
    expect(versions.lookup(id)).toMatchObject({ verdict: { status: 'failed' } });
    await versions.replace([id]);
    expect(service.session.document()).toBe(before);
  });

  it('allows a breaking replacement only when the host explicitly reports no affected instances', async () => {
    const { source } = repository({
      newestPublished: true,
      readable: true,
      lookupFails: false,
      verdict: { compatible: false, invalidatedInstances: 0 },
    });
    const id = holding('copied', source);
    versions.refresh(id);
    await settle();
    expect(versions.lookup(id)).toMatchObject({ verdict: { status: 'breaking', invalidatedInstances: 0 } });
    await versions.replace([id]);
    expect(childIdentifier(service.session.document().children[0])).toBe(iri('v130'));
  });

  it.each(['child', 'sibling'] as const)(
    'retires a verdict after a %s edit, even when all version identifiers stay the same',
    async (target) => {
      const { source } = repository({
        newestPublished: true,
        readable: true,
        lookupFails: false,
        verdict: { compatible: true },
      });
      const id = holding('copied', source);
      versions.refresh(id);
      await settle();
      expect(versions.lookup(id)).toMatchObject({ verdict: { status: 'compatible' } });
      const edited = target === 'child' ? id : service.fields().find((field) => field.id !== id)!.id;
      service.updateFieldName(edited, 'Changed definition');
      const before = service.session.document();
      // The versions found stay shown; the verdict is pending until it is asked for again.
      expect(versions.lookup(id)).toMatchObject({ status: 'found', verdict: { status: 'pending' } });
      await versions.replace([id]);
      expect(service.session.document()).toBe(before);
    },
  );

  it('ignores a late compatibility answer after the copy was edited', async () => {
    const { source } = repository({ newestPublished: true, readable: true, lookupFails: false, verdict: 'none' });
    const reply = deferred<CedCompatibility>();
    const id = holding('copied', { ...source, compatibility: () => reply.promise });
    versions.refresh(id);
    await settle();
    service.updateFieldName(id, 'Local changes');
    reply.resolve({ compatible: true });
    await settle();
    expect(versions.lookup(id)).toMatchObject({ status: 'found', verdict: { status: 'pending' } });
    const before = service.session.document();
    await versions.replace([id]);
    expect(service.session.document()).toBe(before);
  });

  it('reloads a candidate on refresh and applies the exact snapshot assessed, isolated from host mutation', async () => {
    const { source, artifacts } = repository({
      newestPublished: true,
      readable: true,
      lookupFails: false,
      verdict: 'none',
    });
    const load = vi.fn(source.load);
    const names: unknown[] = [];
    const id = holding('linked', {
      ...source,
      load,
      compatibility: async (_current, candidate) => {
        names.push(candidate['schema:name']);
        candidate['schema:name'] = 'Mutated by the host';
        return { compatible: true };
      },
    });
    versions.refresh(id);
    await settle();
    artifacts[iri('v130')] = { ...artifacts[iri('v130')], 'schema:name': 'Refreshed candidate' };
    versions.refresh(id);
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(names).toEqual(['Sample', 'Refreshed candidate']);
    artifacts[iri('v130')]['schema:name'] = 'Changed after assessment';
    await versions.replace([id]);
    expect(service.session.document().children[0].definition.name).toBe('Refreshed candidate');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not apply a late candidate after its source is replaced, even if the host ignores cancellation', async () => {
    const { source } = repository({ newestPublished: true, readable: true, lookupFails: false, verdict: 'none' });
    const reply = deferred<CedJsonObject>();
    const id = holding('linked', { ...source, load: () => reply.promise });
    versions.refresh(id);
    await settle();
    const replacing = versions.replace([id]);
    service.childSource.set({ ...source });
    TestBed.tick();
    const before = service.session.document();
    reply.resolve(artifact('v130', '1.3.0', true));
    await replacing;
    expect(service.session.document()).toBe(before);
  });

  it('never replaces a copy with an unpublished candidate', async () => {
    const { source } = repository({
      newestPublished: false,
      readable: true,
      lookupFails: false,
      verdict: { compatible: true },
    });
    const id = holding('copied', source);
    versions.refresh(id);
    await settle();
    expect(versions.lookup(id)).toMatchObject({ candidate: { id: iri('v120'), publicationStatus: 'bibo:published' } });
    await versions.replace([id]);
    expect(versionState(service.session.document(), id)).toEqual({ kind: 'linked', identifier: iri('v120') });
  });

  it.each([false, true])(
    'stores a local child, published %s, and puts the stored artifact in its place',
    async (publish) => {
      const { source, stored } = repository({
        newestPublished: true,
        readable: true,
        lookupFails: false,
        verdict: 'none',
      });
      service.childSource.set(source);
      TestBed.tick();
      const id = service.fields()[0].id;
      expect(versionState(service.session.document(), id)).toEqual({ kind: 'local' });
      await versions.save(id, publish);
      expect(stored).toHaveLength(1);
      const node = service.session.document().children.find((child) => child.id === id)!;
      if (publish) {
        expect(versionState(service.session.document(), id)).toEqual({ kind: 'linked', identifier: stored[0]['@id'] });
      } else {
        // A stored draft is copied, never linked, so the child becomes a copy of the stored draft.
        expect(childDerivedFrom(node)).toBe(stored[0]['@id']);
        expect(childIdentifier(node)).not.toBe(stored[0]['@id']);
      }
    },
  );

  it('reports a failed save on the child and leaves it as it was', async () => {
    const { source } = repository({ newestPublished: true, readable: true, lookupFails: false, verdict: 'none' });
    service.childSource.set({
      ...source,
      save: async () => {
        throw new Error('The repository refused the field.');
      },
    });
    TestBed.tick();
    const id = service.fields()[0].id;
    const before = service.session.document();
    await versions.save(id, true);
    expect(service.session.document()).toBe(before);
    expect(versions.failures().get(id)).toContain('The repository refused the field.');
    expect(versions.busy().has(id)).toBe(false);
  });

  it('refuses a host answer that is not an artifact', async () => {
    const { source } = repository({ newestPublished: true, readable: true, lookupFails: false, verdict: 'none' });
    service.childSource.set({ ...source, save: async () => null as unknown as CedJsonObject });
    TestBed.tick();
    const id = service.fields()[0].id;
    await versions.save(id, false);
    expect(versions.failures().get(id)).toBe('The host returned something other than an artifact.');
  });

  it('asks the host to open the stored artifact a linked child is', () => {
    const { source, opened } = repository({
      newestPublished: true,
      readable: true,
      lookupFails: false,
      verdict: 'none',
    });
    const id = holding('linked', source);
    versions.open(id);
    expect(opened).toEqual([iri('v120')]);
  });

  it('looks for no versions of a document that was never stored', () => {
    const { source } = repository({ newestPublished: true, readable: true, lookupFails: false, verdict: 'none' });
    service.childSource.set(source);
    TestBed.tick();
    versions.refreshDocument();
    expect(versions.documentLookup()).toEqual({ status: 'unavailable' });
  });

  it('looks up the versions of the document itself', async () => {
    const { source } = repository({ newestPublished: true, readable: true, lookupFails: false, verdict: 'none' });
    service.childSource.set(source);
    service.session.document.update((root) => ({
      ...root,
      identifier: 'https://repo.metadatacenter.org/templates/t1',
    }));
    TestBed.tick();
    versions.refreshDocument();
    expect(versions.documentLookup()).toEqual({ status: 'pending' });
    await settle();
    expect(versions.documentLookup()).toMatchObject({ status: 'found', candidate: null });
  });
});
