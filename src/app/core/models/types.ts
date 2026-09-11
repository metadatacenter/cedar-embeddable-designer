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
 * `<cedar-term-picker>` through its `constraintSet` input, and the picker publishes it
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

export const FIELD_TYPES: Record<string, { label: string; preview: string }> = {
  text: { label: 'Text', preview: 'Short answer text' },
  paragraph: { label: 'Paragraph', preview: 'Long answer text' },
  multipleChoice: { label: 'Multiple Choice', preview: 'Radio buttons' },
  checkboxes: { label: 'Checkboxes', preview: 'Multiple selection' },
  singleChoiceList: { label: 'List', preview: 'Choose one from a list' },
  multipleChoiceList: { label: 'Multi-select List', preview: 'Choose several from a list' },
  date: { label: 'Date', preview: 'Date picker' },
  time: { label: 'Time', preview: 'Time picker' },
  email: { label: 'Email', preview: 'Email address' },
  link: { label: 'Link', preview: 'URL' },
  phone: { label: 'Phone', preview: 'Phone number' },
  number: { label: 'Number', preview: 'Numeric value' },
  controlledTerms: { label: 'Controlled Terms', preview: 'Controlled vocabulary' },
  attributeValue: { label: 'Attribute Value', preview: 'Names the author supplies' },

  // External authorities: an identifier resolved against a register.
  orcid: { label: 'ORCID', preview: 'Researcher identifier' },
  ror: { label: 'ROR', preview: 'Research organization identifier' },
  pfas: { label: 'PFAS', preview: 'PFAS substance identifier' },
  rrid: { label: 'RRID', preview: 'Research resource identifier' },
  pubmed: { label: 'PubMed', preview: 'PubMed identifier' },
  nihGrantId: { label: 'NIH Grant ID', preview: 'NIH grant identifier' },
  doi: { label: 'DOI', preview: 'Digital object identifier' },

  // Static types, which show something rather than collect it.
  image: { label: 'Image', preview: 'An image at a URL' },
  richText: { label: 'Rich Text', preview: 'Formatted text' },
  youtube: { label: 'YouTube', preview: 'An embedded video' },
  sectionBreak: { label: 'Section Break', preview: 'A divider between sections' },
  pageBreak: { label: 'Page Break', preview: 'A break between pages' },
};

/** One authoring choice for the temporal model; date/time remain internal subtype keys. */
export const PALETTE_FIELD_TYPES: typeof FIELD_TYPES = Object.fromEntries(
  Object.entries(FIELD_TYPES)
    .filter(([key]) => key !== 'time')
    .map(([key, value]) => [key, key === 'date' ? { ...value, label: 'Temporal' } : value]),
);
