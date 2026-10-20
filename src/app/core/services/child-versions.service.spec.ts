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
      // A link moves only to a newer published version; a copy is offered its origin's newest.
      const candidate = how === 'linked' ? (newestPublished ? iri('v130') : null) : iri('v130');
      expect(lookup.candidate?.id ?? null).toBe(candidate);
      if (!candidate || verdict === 'none') return expect(lookup.verdict).toEqual({ status: 'unchecked' });
      if (verdict === 'fails') return expect(lookup.verdict).toEqual({ status: 'failed' });
      expect(lookup.verdict).toEqual(
        verdict.compatible
          ? { status: 'compatible' }
          : { status: 'breaking', invalidatedInstances: verdict.invalidatedInstances ?? 0 },
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

  it('upgrades every compatible linked child in one step, and leaves the breaking ones', async () => {
    const compatible = repository({
      newestPublished: true,
      readable: true,
      lookupFails: false,
      verdict: { compatible: true },
    });
    const first = holding('linked', compatible.source);
    const [second] = service.importChildren(
      [{ type: 'field', artifact: artifact('v120', '1.2.0', true) }],
      service.session.document().id,
      1,
    );
    versions.refreshAll();
    await settle();
    await settle();
    await versions.upgradeCompatible();
    for (const id of [first, second]) {
      const node = service.session.document().children.find((child) => child.id === id)!;
      expect(childVersion(node)).toBe('1.3.0');
    }
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
