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
   * Still assignable to what the picker publishes, which is the claim that makes
   * narrowing safe rather than merely tidy.
   *
   * `PublishedConfig` is a copy of `ControlledTermConfig` from
   * `cedar-term-picker/src/app/search/constraint-set.ts` — copied rather than imported,
   * because CED loads the picker as a script and does not depend on its package. If the
   * picker narrows its own contract one day this stops compiling, which is the right
   * time to hear about it.
   */
  it('is assignable to the contract the picker publishes', () => {
    interface PublishedConfig {
      sourceType: 'ontology-term' | 'ontology' | 'value-set' | 'ontology-branch';
      uri?: string;
      iri?: string;
      sourceSystem?: string;
      source?: string;
      label?: string;
      termType?: 'OntologyClass' | 'Value';
      numTerms?: number | null;
      sourceId?: string;
      sourceName?: string;
      ontologyId?: string;
      ontologyName?: string;
      branchRootId?: string;
      branchRootName?: string;
      searchDepth?: number;
      version?: { id: string; effectiveDate?: string; declaredVersion?: string };
    }

    const ours: ControlledTermConfig[] = [
      { sourceType: 'ontology', ontologyId: 'DOID', ontologyName: 'Human Disease Ontology' },
      { sourceType: 'ontology-branch', branchRootId: 'urn:disease', sourceId: 'DOID', searchDepth: 2 },
      { sourceType: 'ontology-term', sourceId: 'urn:melanoma', label: 'melanoma' },
      { sourceType: 'value-set', sourceId: 'urn:list', sourceName: 'A list' },
    ];
    const asPublished: PublishedConfig[] = ours;

    expect(asPublished.map((constraint) => constraint.sourceType)).toEqual([
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
