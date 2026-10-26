/**
 * The Version tab's states and the actions each one offers.
 *
 * The first matrix places every kind of child, published or draft, copied or not, at every depth
 * a document can hold it, and asserts its state. The second crosses every state with every answer
 * a host can give, whether the document can change, and which optional host operations exist, and
 * asserts the tab's actions against the agreed rules, each stated once below rather than read back
 * from the implementation.
 */
import type { CedArtifactVersion } from '../../ced-public-api';
import { ArtifactMetadata, Field } from '../models/types';
import { newContainer, newFieldIdentity } from './cedar-template';
import { ChildNode, ContainerDraft, ElementNode, fieldNode, newNodeId } from './container-draft';
import {
  blockedByInstances,
  candidateVersion,
  compareVersions,
  OriginLookup,
  otherPlaces,
  Verdict,
  VersionAction,
  versionActions,
  VersionState,
  versionState,
} from './version-state';

const ORIGIN = 'https://repo.metadatacenter.org/template-fields/origin';

function metadata(published: boolean, derivedFrom: string | null): ArtifactMetadata {
  return {
    title: null,
    description: null,
    schemaVersion: null,
    version: published ? '1.2.0' : '0.0.1',
    publicationStatus: published ? 'bibo:published' : 'bibo:draft',
    createdOn: null,
    createdBy: null,
    modifiedOn: null,
    modifiedBy: null,
    derivedFrom,
    previousVersion: null,
  } as ArtifactMetadata;
}

function field(name: string, published = false, derivedFrom: string | null = null, atId?: string): ChildNode {
  const value: Field = {
    id: newNodeId(),
    ...newFieldIdentity(),
    ...(atId ? { atId } : {}),
    type: 'text',
    name,
    status: 'optional',
    options: [],
    defaultValue: { kind: 'none' },
    allowMultiple: false,
    artifact: metadata(published, derivedFrom),
    ...(published ? { publishedDefinition: '{}' } : {}),
  };
  return fieldNode(value);
}

function element(name: string, published: boolean, derivedFrom: string | null, ...children: ChildNode[]): ElementNode {
  const definition: ContainerDraft = {
    ...newContainer('element', name),
    version: published ? '1.2.0' : '0.0.1',
    children,
    metadata: {
      artifact: metadata(published, derivedFrom),
      language: null,
      annotations: undefined,
      instanceType: null,
      header: null,
      footer: null,
    },
  };
  return { kind: 'element', id: definition.id, definition, placement: { allowMultiple: false } };
}

function template(...children: ChildNode[]): ContainerDraft {
  return { ...newContainer('template', 'Study'), children };
}

describe('version states', () => {
  type Own = 'a draft made here' | 'a draft copy' | 'a published child';
  const OWN: Own[] = ['a draft made here', 'a draft copy', 'a published child'];
  type Depth = 'the root' | 'a draft element' | 'a published element' | 'a published element inside a draft one';
  const DEPTHS: Depth[] = [
    'the root',
    'a draft element',
    'a published element',
    'a published element inside a draft one',
  ];
  const KINDS = ['field', 'element'] as const;

  const own = (kind: (typeof KINDS)[number], which: Own): ChildNode => {
    const published = which === 'a published child';
    const derivedFrom = which === 'a draft copy' ? ORIGIN : null;
    return kind === 'field' ? field('Child', published, derivedFrom) : element('Child', published, derivedFrom);
  };
  const place = (node: ChildNode, depth: Depth): { root: ContainerDraft; owner?: ElementNode } => {
    switch (depth) {
      case 'the root':
        return { root: template(node) };
      case 'a draft element':
        return { root: template(element('Group', false, null, node)) };
      case 'a published element': {
        const owner = element('Group', true, null, node);
        return { root: template(owner), owner };
      }
      case 'a published element inside a draft one': {
        const owner = element('Group', true, null, node);
        return { root: template(element('Outer', false, null, owner)), owner };
      }
    }
  };

  const cases = KINDS.flatMap((kind) => OWN.flatMap((which) => DEPTHS.map((depth) => [kind, which, depth] as const)));
  it.each(cases)('a %s that is %s, placed in %s', (kind, which, depth) => {
    const node = own(kind, which);
    const { root, owner } = place(node, depth);
    const state = versionState(root, node.id);
    // Anything inside a published element belongs to it, whatever it is itself.
    if (owner) expect(state).toEqual({ kind: 'contained', owner });
    else if (which === 'a published child')
      expect(state).toEqual({
        kind: 'linked',
        identifier: node.kind === 'field' ? node.definition.atId : node.definition.identifier,
      });
    else if (which === 'a draft copy') expect(state).toEqual({ kind: 'forked', origin: ORIGIN });
    else expect(state).toEqual({ kind: 'local' });
  });

  it('names the outermost published element as the owner of a child nested in two', () => {
    const inner = field('Deep');
    const middle = element('Middle', true, null, inner);
    const outer = element('Outer', true, null, middle);
    expect(versionState(template(outer), inner.id)).toEqual({ kind: 'contained', owner: outer });
  });

  it('has no state for the root or a child the document does not hold', () => {
    const root = template(field('Title'));
    expect(versionState(root, root.id)).toBeNull();
    expect(versionState(root, -1)).toBeNull();
  });

  it('finds the other copies of the same stored artifact, of the same kind only', () => {
    const shared = 'https://repo.metadatacenter.org/template-fields/shared';
    const first = field('First', true, null, shared);
    const second = field('Second', true, null, shared);
    const copy = field('Copy', false, shared);
    const unrelated = field('Unrelated', true);
    const group = element('Group', false, shared);
    const root = template(first, element('Holder', false, null, second, copy), unrelated, group);
    expect(otherPlaces(root, first.id).map((node) => node.definition.name)).toEqual(['Second', 'Copy']);
    expect(otherPlaces(root, copy.id).map((node) => node.definition.name)).toEqual(['First', 'Second']);
    expect(otherPlaces(root, unrelated.id)).toEqual([]);
  });
});

describe('version order', () => {
  it.each([
    ['1.10.0', '1.9.0', 1],
    ['1.9.0', '1.10.0', -1],
    ['2.0.0', '1.99.99', 1],
    ['0.0.1', '0.0.1', 0],
    ['0.0.1', null, 1],
    [null, '0.0.1', -1],
  ] as const)('orders %s against %s', (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });
});

function version(id: string, number: string, published: boolean): CedArtifactVersion {
  return { id, name: 'Source', version: number, publicationStatus: published ? 'bibo:published' : 'bibo:draft' };
}

describe('candidate versions', () => {
  const linked: VersionState = { kind: 'linked', identifier: 'v120' };
  const forked: VersionState = { kind: 'forked', origin: 'v110' };
  const newestPublished = [
    version('v130', '1.3.0', true),
    version('v120', '1.2.0', true),
    version('v110', '1.1.0', true),
  ];
  const newestDraft = [version('v140', '1.4.0', false), ...newestPublished];

  it('offers a linked child the newest published version', () => {
    expect(candidateVersion(linked, '1.2.0', newestPublished)?.id).toBe('v130');
    // A draft is never linked, so a newer draft is no upgrade.
    expect(candidateVersion(linked, '1.2.0', newestDraft)?.id).toBe('v130');
  });
  it('offers a linked child nothing when it is the newest, or the newest is not newer', () => {
    expect(candidateVersion(linked, '1.2.0', newestPublished.slice(1))).toBeNull();
    expect(candidateVersion(linked, '1.2.0', [version('v100', '1.0.0', true)])).toBeNull();
    expect(candidateVersion(linked, '1.2.0', [])).toBeNull();
    expect(candidateVersion(linked, '1.2.0', [version('v140', '1.4.0', false)])).toBeNull();
  });
  it("offers a fork its origin's newest published version, even when that is its origin", () => {
    expect(candidateVersion(forked, '0.0.1', newestDraft)?.id).toBe('v130');
    expect(candidateVersion(forked, '0.0.1', [version('v110', '1.1.0', true)])?.id).toBe('v110');
    expect(candidateVersion(forked, '0.0.1', [])).toBeNull();
    expect(candidateVersion(forked, '0.0.1', [version('v140', '1.4.0', false)])).toBeNull();
  });
  it('offers a local or contained child nothing', () => {
    expect(candidateVersion({ kind: 'local' }, '0.0.1', newestPublished)).toBeNull();
    const owner = element('Group', true, null);
    expect(candidateVersion({ kind: 'contained', owner }, '1.2.0', newestPublished)).toBeNull();
  });
});

describe('version actions', () => {
  const CANDIDATE = version('newer', '1.3.0', true);
  const owner = element('Group', true, null);
  const STATES: Record<string, VersionState> = {
    local: { kind: 'local' },
    linked: { kind: 'linked', identifier: 'current' },
    forked: { kind: 'forked', origin: 'current' },
    contained: { kind: 'contained', owner },
  };
  const VERDICTS: Record<string, Verdict> = {
    unchecked: { status: 'unchecked' },
    'verdict pending': { status: 'pending' },
    'verdict failed': { status: 'failed' },
    compatible: { status: 'compatible' },
    'breaking, no instances': { status: 'breaking', invalidatedInstances: 0 },
    'breaking, 3 instances': { status: 'breaking', invalidatedInstances: 3 },
  };
  const LOOKUPS: Record<string, OriginLookup> = {
    unavailable: { status: 'unavailable' },
    pending: { status: 'pending' },
    unreadable: { status: 'unreadable' },
    failed: { status: 'failed' },
    'up to date': { status: 'found', versions: [], candidate: null, verdict: { status: 'unchecked' } },
    ...Object.fromEntries(
      Object.entries(VERDICTS).map(([name, verdict]) => [
        `newer, ${name}`,
        { status: 'found', versions: [CANDIDATE], candidate: CANDIDATE, verdict } as OriginLookup,
      ]),
    ),
  };

  // The agreed rules, one per action.
  // A candidate is offered once the host has judged it, or has said it judges nothing, unless the
  // replacement would invalidate instances of this version of the template.
  const offersCandidate = (lookup: OriginLookup): boolean => {
    if (lookup.status !== 'found' || !lookup.candidate) return false;
    const verdict = lookup.verdict;
    return (
      verdict.status === 'unchecked' ||
      verdict.status === 'compatible' ||
      (verdict.status === 'breaking' && verdict.invalidatedInstances === 0)
    );
  };
  const expected = (state: string, lookup: OriginLookup, editable: boolean, open: boolean, save: boolean) => {
    const actions: VersionAction[] = [];
    if (state === 'linked') {
      if (open && lookup.status !== 'unreadable') actions.push('open');
      if (editable && offersCandidate(lookup)) actions.push('upgrade');
      if (editable) actions.push('detach');
    }
    if (state === 'forked' && editable && offersCandidate(lookup)) actions.push('replace');
    if ((state === 'local' || state === 'forked') && editable && save) actions.push('saveDraft', 'publish');
    return actions;
  };

  const cases = Object.keys(STATES).flatMap((state) =>
    Object.keys(LOOKUPS).flatMap((lookup) =>
      [true, false].flatMap((editable) =>
        [true, false].flatMap((open) => [true, false].map((save) => [state, lookup, editable, open, save] as const)),
      ),
    ),
  );

  it.each(cases)(
    'a %s child, lookup %s, editable %s, host open %s, host save %s',
    (state, lookup, editable, open, save) => {
      const actions = versionActions({ state: STATES[state], lookup: LOOKUPS[lookup], editable, host: { open, save } });
      expect(actions).toEqual(expected(state, LOOKUPS[lookup], editable, open, save));
    },
  );

  it('never offers a replacement whose verdict is pending, failed, or would invalidate instances', () => {
    for (const name of ['verdict pending', 'verdict failed', 'breaking, 3 instances'])
      for (const state of [STATES['linked'], STATES['forked']]) {
        const actions = versionActions({
          state,
          lookup: LOOKUPS[`newer, ${name}`],
          editable: true,
          host: { open: true, save: true },
        });
        expect(actions).not.toContain('upgrade');
        expect(actions).not.toContain('replace');
      }
  });

  it('marks only a breaking candidate with instances as blocked', () => {
    for (const [name, lookup] of Object.entries(LOOKUPS))
      expect(blockedByInstances(lookup)).toBe(name === 'newer, breaking, 3 instances');
  });
});
