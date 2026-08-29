/**
 * What `<cedar-term-picker>` emits, and what the designer stores for it.
 *
 * The picker is a sibling web component rather than a dependency: a host page
 * loads both scripts and neither bundles the other. That is what two custom
 * elements are, and it is why the shape below is declared here rather than
 * imported — the picker's package is not installed, and CED reads four fields of
 * a much larger object.
 *
 * Structural, so it is checked against what actually arrives rather than assumed:
 * the mapper narrows on `type` and reads nothing a hit of that type lacks.
 */

/** The tag the host is expected to have registered. */
export const TERM_PICKER_TAG = 'cedar-term-picker';

interface HitBase {
  readonly type: string;
  readonly sourceAcronym: string;
  readonly sourceName?: string;
}

export interface PickedClass extends HitBase {
  readonly type: 'class';
  readonly termIri: string;
  readonly termLabel: string;
}

export interface PickedBranch extends HitBase {
  readonly type: 'branch';
  readonly termBaseIri: string;
  readonly termBaseLabel: string;
}

export interface PickedOntology extends HitBase {
  readonly type: 'ontology';
}

export interface PickedValueSet extends HitBase {
  readonly type: 'valueSet';
  readonly termBaseIri: string;
  readonly termBaseLabel?: string;
}

export type PickedConstraint = PickedClass | PickedBranch | PickedOntology | PickedValueSet;

import { ControlledTermConfig } from '../models/types';

/**
 * The picker's choice, as the constraint the designer stores.
 *
 * The four kinds the picker searches are the four the designer already models,
 * which is not a coincidence: both are the four things a CEDAR field can be
 * constrained to. What changes is where the values come from — an author used to
 * type an ontology acronym and a branch IRI into free-text boxes from memory, and
 * nothing checked either.
 */
export function toControlledTermConfig(picked: PickedConstraint): ControlledTermConfig {
  switch (picked.type) {
    case 'class':
      return {
        sourceType: 'ontology-term',
        sourceId: picked.termIri,
        sourceName: picked.termLabel,
        ontologyId: picked.sourceAcronym,
        ontologyName: picked.sourceName,
      };
    case 'branch':
      return {
        sourceType: 'ontology-branch',
        sourceId: picked.sourceAcronym,
        ontologyName: picked.sourceName,
        branchRootId: picked.termBaseIri,
        branchRootName: picked.termBaseLabel,
        searchDepth: 1,
      };
    case 'ontology':
      return {
        sourceType: 'ontology',
        sourceId: picked.sourceAcronym,
        ontologyId: picked.sourceAcronym,
        ontologyName: picked.sourceName,
      };
    case 'valueSet':
      return {
        sourceType: 'value-set',
        sourceId: picked.termBaseIri,
        sourceName: picked.termBaseLabel,
        ontologyId: picked.sourceAcronym,
        ontologyName: picked.sourceName,
      };
  }
}

/** Whether a host has loaded the picker, which decides whether it can be offered. */
export function termPickerAvailable(registry: Pick<CustomElementRegistry, 'get'> = customElements): boolean {
  return registry.get(TERM_PICKER_TAG) !== undefined;
}
