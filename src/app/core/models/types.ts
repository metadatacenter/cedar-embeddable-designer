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
  date: { label: 'Date', preview: 'Date picker' },
  time: { label: 'Time', preview: 'Time picker' },
  email: { label: 'Email', preview: 'Email address' },
  link: { label: 'Link', preview: 'URL' },
  phone: { label: 'Phone', preview: 'Phone number' },
  number: { label: 'Number', preview: 'Numeric value' },
  image: { label: 'Image', preview: 'File upload' },
  orcid: { label: 'ORCID', preview: 'Research identifier' },
  controlledTerms: { label: 'Controlled Terms', preview: 'Controlled vocabulary' },
};
