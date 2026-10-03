/**
 * What `<cedar-embeddable-term-picker>` emits when an author picks a term.
 *
 * The picker is a sibling web component rather than a dependency: a host page
 * loads both scripts and neither bundles the other. That is what two custom
 * elements are, and it is why the shape below is declared here rather than
 * imported — the picker's package is not installed, and CED reads a few fields of
 * a much larger object.
 *
 * Structural, so it is checked against what actually arrives rather than assumed:
 * a reader narrows on `type` and reads nothing a hit of that type lacks.
 */

/** The tag the host is expected to have registered. */
export const TERM_PICKER_TAG = 'cedar-embeddable-term-picker';

/**
 * The snapshot an author pinned, where they pinned one.
 *
 * `id` is the snapshot's content hash and the only part resolution reads; the
 * other two are labels for people. The picker also reports whether a later
 * extraction of the same source bytes exists, which is a thing to say while
 * choosing rather than a thing to store — a pin written before one was superseded
 * still resolves, because a published template has to keep meaning what it meant.
 */
export interface PickedVersion {
  readonly id?: string;
  readonly effectiveDate?: string;
  readonly declaredVersion?: string;
  readonly superseded?: boolean;
}

interface HitBase {
  readonly type: string;
  readonly sourceAcronym: string;
  readonly sourceSystem?: string;
  readonly sourceIri?: string;
  readonly sourceName?: string;
  readonly version?: PickedVersion;
}

export interface PickedClass extends HitBase {
  readonly type: 'class';
  readonly termType?: string;
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

/** Whether a host has loaded the picker, which decides whether it can be offered. */
export function termPickerAvailable(registry: Pick<CustomElementRegistry, 'get'> = customElements): boolean {
  return registry.get(TERM_PICKER_TAG) !== undefined;
}
