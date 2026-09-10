/**
 * What the constraint union forbids.
 *
 * A type change needs proving like any other, and the proof of a type is that the
 * wrong code no longer compiles. `@ts-expect-error` is what makes that checkable: each
 * one fails the build if the error it claims does not happen, so this file goes red
 * both if the union is loosened back into a bag and if someone quietly deletes a
 * variant's required field.
 *
 * The runtime assertions beside them are the other half. The shape crosses to
 * `<cedar-term-picker>` through its `constraintSet` input, so narrowing the type must
 * not have changed what is actually sent: the same keys, on the same variants, with the
 * same values.
 */
import { describe, expect, it } from 'vitest';
import {
  BranchConstraint,
  ClassConstraint,
  ControlledTermConfig,
  OntologyConstraint,
  ValueSetConstraint,
} from './types';

describe('the constraint union', () => {
  it('will not let a branch be built without its root', () => {
    // @ts-expect-error a branch is its root term and its descendants, so the root is not optional
    const missing: BranchConstraint = { sourceType: 'ontology-branch', sourceId: 'DOID' };
    expect(missing.sourceType).toBe('ontology-branch');
  });

  it('will not let an ontology be built without its acronym', () => {
    // @ts-expect-error the acronym is the ontology's identity in a CEDAR constraint
    const missing: OntologyConstraint = { sourceType: 'ontology', ontologyName: 'Human Disease Ontology' };
    expect(missing.sourceType).toBe('ontology');
  });

  it('will not let a term or a value set be built without its IRI', () => {
    // @ts-expect-error a term constraint is the term's IRI
    const term: ClassConstraint = { sourceType: 'ontology-term', label: 'melanoma' };
    // @ts-expect-error a value-set constraint is the value set's IRI
    const set: ValueSetConstraint = { sourceType: 'value-set', sourceName: 'A list' };
    expect([term.sourceType, set.sourceType]).toEqual(['ontology-term', 'value-set']);
  });

  /**
   * The mistake this union exists to catch. Reading a branch's depth off a term used to
   * compile and return undefined, which is how a fixture came to put a branch IRI where
   * an ontology acronym belonged and a round trip looked like it was losing data.
   */
  it('will not let one kind be read as another', () => {
    const term: ControlledTermConfig = { sourceType: 'ontology-term', sourceId: 'urn:melanoma' };
    // @ts-expect-error a term has no branch root
    expect(term.branchRootId).toBeUndefined();
    // @ts-expect-error a term has no search depth
    expect(term.searchDepth).toBeUndefined();
  });

  it('reads the fields of whichever variant it has been narrowed to', () => {
    const constraints: ControlledTermConfig[] = [
      { sourceType: 'ontology', ontologyId: 'DOID' },
      { sourceType: 'ontology-branch', branchRootId: 'urn:disease', sourceId: 'DOID', searchDepth: 3 },
    ];
    const depths = constraints.flatMap((constraint) =>
      constraint.sourceType === 'ontology-branch' ? [constraint.searchDepth] : [],
    );

    expect(depths).toEqual([3]);
  });

  /**
   * The same four variants the picker now publishes.
   *
   * `PublishedConfig` mirrors `ControlledTermConfig` from
   * `cedar-term-picker/src/app/search/constraint-set.ts` — mirrored rather than
   * imported, because CED loads the picker as a script and does not depend on its
   * package. The two were narrowed together, so this is what would catch them drifting
   * apart: a variant the picker tightens further, or a key it drops, stops compiling
   * here.
   */
  it('matches the contract the picker publishes', () => {
    type PublishedConfig =
      | {
          sourceType: 'ontology';
          ontologyId: string;
          ontologyName?: string;
          uri?: string;
          sourceId?: string;
          numTerms?: number | null;
        }
      | {
          sourceType: 'ontology-branch';
          branchRootId: string;
          branchRootName?: string;
          sourceId?: string;
          source?: string;
          ontologyName?: string;
          searchDepth?: number;
        }
      | {
          sourceType: 'ontology-term';
          sourceId: string;
          label?: string;
          sourceName?: string;
          ontologyId?: string;
          ontologyName?: string;
          source?: string;
          termType?: 'OntologyClass' | 'Value';
        }
      | {
          sourceType: 'value-set';
          sourceId: string;
          sourceName?: string;
          ontologyId?: string;
          ontologyName?: string;
          numTerms?: number | null;
        };

    const ours: ControlledTermConfig[] = [
      { sourceType: 'ontology', ontologyId: 'DOID', ontologyName: 'Human Disease Ontology' },
      { sourceType: 'ontology-branch', branchRootId: 'urn:disease', sourceId: 'DOID', searchDepth: 2 },
      { sourceType: 'ontology-term', sourceId: 'urn:melanoma', label: 'melanoma' },
      { sourceType: 'value-set', sourceId: 'urn:list', sourceName: 'A list' },
    ];
    // Assignable both ways: neither side accepts a constraint the other would refuse.
    const asPublished: PublishedConfig[] = ours;
    const asOurs: ControlledTermConfig[] = asPublished;

    expect(asOurs.map((constraint) => constraint.sourceType)).toEqual([
      'ontology',
      'ontology-branch',
      'ontology-term',
      'value-set',
    ]);
  });

  /** The wire shape is the picker's, so narrowing must not have added or renamed a key. */
  it('sends the keys the picker publishes, and no others', () => {
    const branch: BranchConstraint = {
      sourceType: 'ontology-branch',
      branchRootId: 'urn:disease',
      branchRootName: 'disease',
      sourceId: 'DOID',
      source: 'DOID',
      ontologyName: 'Human Disease Ontology',
      searchDepth: 3,
      iri: 'urn:doid',
      sourceSystem: 'bioportal',
      version: { id: 'hash' },
    };
    const published = new Set([
      'sourceType',
      'uri',
      'iri',
      'sourceSystem',
      'source',
      'label',
      'termType',
      'numTerms',
      'sourceId',
      'sourceName',
      'ontologyId',
      'ontologyName',
      'branchRootId',
      'branchRootName',
      'searchDepth',
      'version',
    ]);

    expect(Object.keys(branch).filter((key) => !published.has(key))).toEqual([]);
  });
});
