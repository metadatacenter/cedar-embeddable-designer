export interface ValidationRule {
  id: number;
  type: string;
  pattern: string;
  errorMessage: string;
}

export interface CustomField {
  id: number;
  name: string;
  icon: string;
  baseType: string;
  libraryId: number;
  description: string;
  placeholder: string;
  validationRules: ValidationRule[];
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

export interface ControlledTermConfig {
  sourceType: 'ontology-term' | 'ontology' | 'value-set' | 'ontology-branch';
  sourceId?: string;
  sourceName?: string;
  ontologyId?: string;
  ontologyName?: string;
  branchRootId?: string;
  branchRootName?: string;
  allowMultipleOntologies?: boolean;
  searchDepth?: number;
  restrictedOntologies?: string[];
  /**
   * The snapshot the author pinned, where they pinned one. Absent means the
   * latest the terminology server serves, resolved when the template is read.
   */
  version?: ControlledTermVersionRef;
}

export interface Field {
  id: number;
  /**
   * The field's CEDAR identifier and its property IRI, minted when the author
   * adds the field and kept for as long as it exists. Optional because a field
   * read from a template that did not carry them has none.
   */
  atId?: string;
  propertyIri?: string;
  type: string;
  name: string;
  status: string; // 'required' | 'optional' | 'recommended'
  options: string[];
  defaultValue: string;
  allowMultiple: boolean;
  helpText?: string;
  /**
   * The one value a static field shows: the markup of a rich text block, the
   * address of an image, the id of a video. Absent on every other type.
   */
  content?: string;
  customFieldId?: number;
  libraryId?: number;
  controlledTermConfig?: ControlledTermConfig;
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
