import { english } from '../../i18n/messages';
/** A reusable field carries the same complete specification as a template field. */
export interface CustomField {
  id: number;
  libraryId: number;
  definition: Field;
}

export interface Library {
  id: number;
  name: string;
  description: string;
  icon: string;
}

/**
 * The vocabulary snapshot a constraint names.
 *
 * `id` is the snapshot's content hash and the only part resolution reads. The
 * other two are labels: when the snapshot entered circulation, and whatever
 * version string the source declared for itself.
 */
export interface ControlledTermVersionRef {
  id: string;
  effectiveDate?: string;
  declaredVersion?: string;
}

/**
 * A vocabulary constraint, as one of the four things it can actually be.
 *
 * The field names are not ours to choose: this shape crosses to
 * `<cedar-embeddable-term-picker>` through its `constraintSet` input, and the picker publishes it
 * as `ControlledTermConfig` in its own contract. What was ours to fix is that the
 * contract is one interface with fifteen optional fields, so every field appeared to
 * be readable on every kind of constraint and the compiler had nothing to say about
 * it. Splitting it into four variants over `sourceType` keeps the wire shape exactly
 * and makes reading a branch's depth off a term a compile error.
 *
 * The names being shared is why this matters more than it looks. `sourceId` is the
 * term's IRI on a term, the value set's IRI on a value set, and the *ontology's
 * acronym* on a branch — three meanings on one key, and nothing distinguished them.
 * That cost real time: a branch fixture built with the branch IRI in `sourceId` looked
 * like a round trip losing the ontology, when it was the fixture that was wrong.
 *
 * Required means the writer cannot build the entry without it. The writers still check
 * those fields for emptiness, because a required `string` can be `''` and the model
 * library refuses that.
 */
interface ControlledTermCommon {
  /** The source's own IRI, as distinct from the acronym an author recognises. */
  iri?: string;
  sourceSystem?: string;
  /**
   * The snapshot the author pinned, where they pinned one. Absent means the latest the
   * terminology server serves, resolved when the template is read.
   */
  version?: ControlledTermVersionRef;
}

/** Every term in one ontology. */
export interface OntologyConstraint extends ControlledTermCommon {
  sourceType: 'ontology';
  /** The ontology's acronym, which is its identity here. */
  ontologyId: string;
  ontologyName?: string;
  /** The ontology's URI, derived from the acronym when a source does not give one. */
  uri?: string;
  /** The acronym again, as the picker's own hits carry it. */
  sourceId?: string;
  numTerms?: number | null;
}

/** Every term under one root, to a chosen depth. */
export interface BranchConstraint extends ControlledTermCommon {
  sourceType: 'ontology-branch';
  /** The branch root's IRI. The branch is this term and its descendants. */
  branchRootId: string;
  branchRootName?: string;
  /** The acronym of the ontology the branch is drawn from — not the branch's own IRI. */
  sourceId?: string;
  source?: string;
  ontologyName?: string;
  searchDepth?: number;
}

/** One term, named exactly. */
export interface ClassConstraint extends ControlledTermCommon {
  sourceType: 'ontology-term';
  /** The term's IRI. */
  sourceId: string;
  /** The term's label, and the preferred label the source gives it. */
  label?: string;
  sourceName?: string;
  /** The ontology the term is drawn from. */
  ontologyId?: string;
  ontologyName?: string;
  source?: string;
  termType?: 'OntologyClass' | 'Value';
}

/** A curated list of values, which CEDAR treats as its own kind of source. */
export interface ValueSetConstraint extends ControlledTermCommon {
  sourceType: 'value-set';
  /** The value set's IRI. */
  sourceId: string;
  sourceName?: string;
  /** The collection the value set belongs to. */
  ontologyId?: string;
  ontologyName?: string;
  numTerms?: number | null;
}

export type ControlledTermConfig = OntologyConstraint | BranchConstraint | ClassConstraint | ValueSetConstraint;

export interface ControlledTermAction {
  action: string;
  termUri: string;
  sourceUri: string;
  source: string;
  type: 'OntologyClass' | 'Value';
  to?: number;
}

export interface ControlledTermSet {
  constraints: ControlledTermConfig[];
  actions: ControlledTermAction[];
}

/** Values shared with CEF; absence is explicit and zero is a real default. */
export type FieldDefaultValue =
  | { kind: 'none' }
  | { kind: 'literal'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'temporal'; value: string }
  | { kind: 'iri'; iri: string; label: string | null }
  | { kind: 'literals'; values: string[] };

export interface TemporalSettings {
  type: 'xsd:date' | 'xsd:time' | 'xsd:dateTime';
  granularity: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'decimalSecond';
  timezoneEnabled: boolean;
  inputTimeFormat: '12h' | '24h' | null;
}

export interface NumericSettings {
  type: string;
  min: number | null;
  max: number | null;
  decimalPlaces: number | null;
  unit: string | null;
}

export interface ArtifactMetadata {
  title: string | null;
  description: string | null;
  schemaVersion: string | null;
  version: string | null;
  publicationStatus: 'bibo:draft' | 'bibo:published' | null;
  createdOn: string | null;
  createdBy: string | null;
  modifiedOn: string | null;
  modifiedBy: string | null;
  derivedFrom: string | null;
  previousVersion: string | null;
}

export interface Field {
  id: number;
  /**
   * The field's CEDAR identifier and its property IRI, minted when the author
   * adds the field and kept for as long as it exists. Optional because a field
   * read from a template that did not carry them has none.
   */
  atId?: string;
  /** Model-written definition retained intact while published fields are read-only. */
  publishedDefinition?: string;
  artifact?: ArtifactMetadata;
  /** Retained for legacy artifacts; value recommendation is retired. */
  valueRecommendationEnabled?: boolean;
  deploymentName?: string;
  propertyIri?: string;
  preferredLabel?: string;
  alternateLabels?: string[];
  schemaIdentifier?: string;
  language?: string;
  annotations?: { name: string; kind: 'literal' | 'iri'; value: string }[];
  type: string;
  name: string;
  status: string; // 'required' | 'optional' | 'recommended'
  options: string[];
  defaultValue: FieldDefaultValue;
  /** Preserve the scalar form of an imported choice default until explicitly changed. */
  importedChoiceDefault?: string;
  temporal?: TemporalSettings;
  numeric?: NumericSettings;
  textConstraints?: { minLength: number | null; maxLength: number | null; regex: string | null };
  displayLabel?: string;
  displayDescription?: string;
  hidden?: boolean;
  continuePreviousLine?: boolean;
  minItems?: number | null;
  maxItems?: number | null;
  allowMultiple: boolean;
  helpText?: string;
  /**
   * The one value a static field shows: the markup of a rich text block, the
   * address of an image, the id of a video. Absent on every other type.
   */
  content?: string;
  width?: number | null;
  height?: number | null;
  customFieldId?: number;
  libraryId?: number;
  controlledTermConstraints?: ControlledTermSet;
}

export interface UserPreferences {
  showRequired: boolean;
  showAllowMultiple: boolean;
  showHelpText: boolean;
  showDefaultValue: boolean;
  showFieldDesigner: boolean;
  showElements: boolean;
  fieldSelectionStyle: 'modal' | 'sidebar';
  visibleFieldTypes: Record<string, boolean>;
}

export interface PresetDefinition {
  showRequired: boolean;
  showAllowMultiple: boolean;
  showHelpText: boolean;
  showDefaultValue: boolean;
  showFieldDesigner: boolean;
  showElements: boolean;
  hiddenFieldTypes: string[];
}

export interface PresetDefinitions {
  basic: PresetDefinition;
  semantic: PresetDefinition;
  modular: PresetDefinition;
}

/**
 * How a field type is named and described.
 *
 * The designer renders the two keys in its active language. `label` and `preview` are
 * the English renderings of the same keys, for code that needs a type's English name
 * without a designer around it, such as the browser suite. A type with no description
 * has empty `previewKey` and `preview`.
 */
export interface FieldTypeText {
  readonly labelKey: string;
  readonly previewKey: string;
  readonly label: string;
  readonly preview: string;
}

function fieldType(labelKey: string, previewKey = ''): FieldTypeText {
  return { labelKey, previewKey, label: english(labelKey), preview: previewKey ? english(previewKey) : '' };
}

export const FIELD_TYPES: Record<string, FieldTypeText> = {
  text: fieldType('fieldTypes.text.label', 'fieldTypes.text.preview'),
  paragraph: fieldType('fieldTypes.paragraph.label', 'fieldTypes.paragraph.preview'),
  multipleChoice: fieldType('fieldTypes.multipleChoice.label', 'fieldTypes.multipleChoice.preview'),
  checkboxes: fieldType('fieldTypes.checkboxes.label', 'fieldTypes.checkboxes.preview'),
  singleChoiceList: fieldType('fieldTypes.singleChoiceList.label', 'fieldTypes.singleChoiceList.preview'),
  multipleChoiceList: fieldType('fieldTypes.multipleChoiceList.label', 'fieldTypes.multipleChoiceList.preview'),
  date: fieldType('fieldTypes.date.label', 'fieldTypes.date.preview'),
  time: fieldType('fieldTypes.time.label', 'fieldTypes.time.preview'),
  email: fieldType('fieldTypes.email.label', 'fieldTypes.email.preview'),
  link: fieldType('fieldTypes.link.label', 'fieldTypes.link.preview'),
  phone: fieldType('fieldTypes.phone.label', 'fieldTypes.phone.preview'),
  number: fieldType('fieldTypes.number.label', 'fieldTypes.number.preview'),
  controlledTerms: fieldType('fieldTypes.controlledTerms.label', 'fieldTypes.controlledTerms.preview'),
  attributeValue: fieldType('fieldTypes.attributeValue.label'),

  // External authorities: an identifier resolved against a register.
  orcid: fieldType('fieldTypes.orcid.label', 'fieldTypes.orcid.preview'),
  ror: fieldType('fieldTypes.ror.label', 'fieldTypes.ror.preview'),
  pfas: fieldType('fieldTypes.pfas.label', 'fieldTypes.pfas.preview'),
  rrid: fieldType('fieldTypes.rrid.label', 'fieldTypes.rrid.preview'),
  pubmed: fieldType('fieldTypes.pubmed.label', 'fieldTypes.pubmed.preview'),
  nihGrantId: fieldType('fieldTypes.nihGrantId.label', 'fieldTypes.nihGrantId.preview'),
  doi: fieldType('fieldTypes.doi.label', 'fieldTypes.doi.preview'),

  // Static types, which show something rather than collect it.
  image: fieldType('fieldTypes.image.label', 'fieldTypes.image.preview'),
  richText: fieldType('fieldTypes.richText.label', 'fieldTypes.richText.preview'),
  youtube: fieldType('fieldTypes.youtube.label', 'fieldTypes.youtube.preview'),
  sectionBreak: fieldType('fieldTypes.sectionBreak.label', 'fieldTypes.sectionBreak.preview'),
  pageBreak: fieldType('fieldTypes.pageBreak.label', 'fieldTypes.pageBreak.preview'),
};

/** One authoring choice for the temporal model; date/time remain internal subtype keys. */
export const PALETTE_FIELD_TYPES: typeof FIELD_TYPES = Object.fromEntries(
  Object.entries(FIELD_TYPES)
    .filter(([key]) => key !== 'time')
    .map(([key, value]) => [
      key,
      key === 'date'
        ? { ...fieldType('fieldTypes.temporal.label'), previewKey: value.previewKey, preview: value.preview }
        : value,
    ]),
);
