// SHIM: Serialization logic for CEDAR 1.6.0 Structural Model format.
// This implements the official CEDAR Structural Specification (cedar-ts library model).
// Spec reference: https://metadatacenter.github.io/cedar-structural-spec/grammar.html
// Repo reference: https://github.com/metadatacenter/cedar-ts

import { Field } from '../models/types';

// ─── Constants & Types ──────────────────────────────────────────────────────

const SCHEMA_VERSION = '1.6.0' as const;
const CEDAR_REPO_TEMPLATE = 'https://repo.metadatacenter.org/templates/';
const CEDAR_REPO_FIELD = 'https://repo.metadatacenter.org/template-fields/';
const CEDAR_SCHEMA_PROP = 'https://schema.metadatacenter.org/properties/';

/** Maps editor field types to CEDAR structural model field types */
const EDITOR_TO_CEDAR_MODEL_TYPE: Record<string, string> = {
  text:            'text-field',
  paragraph:       'textarea-field',
  multipleChoice:  'radio-field',
  checkboxes:      'checkbox-field',
  date:            'temporal-field',
  time:            'temporal-field',
  email:           'email-field',
  link:            'link-field',
  phone:           'phone-number-field',
  number:          'numeric-field',
  image:           'image-field',
  orcid:           'orcid-field',
  controlledTerms: 'controlled-term-field',
};

export interface CedarModelFieldOption {
  label: string;
}

export interface CedarModelFieldConfig {
  required?: boolean;
  propertyIri?: string;
  [key: string]: unknown;
}

export interface CedarModelField {
  key: string;
  type: string;
  name: string;
  description?: string;
  id: string;
  modelVersion: string;
  values?: CedarModelFieldOption[];
  datatype?: string;
  granularity?: string;
  inputTimeFormat?: string;
  inputTimeZone?: boolean;
  configuration?: CedarModelFieldConfig;
}

export interface CedarModelTemplate {
  type: string;
  name: string;
  description?: string;
  id: string;
  status: string;
  version: string;
  modelVersion: string;
  createdOn: string;
  createdBy?: string | null;
  modifiedOn: string;
  modifiedBy?: string | null;
  children: CedarModelField[];
}

/** Generates a pseudo-UUID for shim use */
function shimUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ─── CEDAR Structural Model Serializer ───────────────────────────────────────

/**
 * Converts the editor's template state to the official CEDAR 1.6.0 Structural Model object.
 * Matching the specification at https://metadatacenter.github.io/cedar-structural-spec/grammar.html
 */
export function toCedarJson(
  name: string,
  description: string,
  fields: Field[],
  identifier?: string,
  version?: string
): CedarModelTemplate {
  const now = new Date().toISOString();
  const templateId = identifier
    ? (identifier.startsWith('http') ? identifier : `${CEDAR_REPO_TEMPLATE}${identifier}`)
    : `${CEDAR_REPO_TEMPLATE}${shimUuid()}`;

  const children: CedarModelField[] = fields.map((f) => {
    const fieldType = EDITOR_TO_CEDAR_MODEL_TYPE[f.type] ?? 'text-field';
    const fieldId = `${CEDAR_REPO_FIELD}${shimUuid()}`;
    const propertyIri = `${CEDAR_SCHEMA_PROP}${shimUuid()}`;

    const config: CedarModelFieldConfig = {
      ...(f.status === 'required' ? { required: true } : {}),
      propertyIri,
    };

    const item: CedarModelField = {
      key: f.name,
      type: fieldType,
      name: f.name,
      description: f.helpText || 'Help Text',
      id: fieldId,
      modelVersion: SCHEMA_VERSION,
      configuration: config,
    };

    if (f.type === 'multipleChoice' || f.type === 'checkboxes') {
      const optionsList = Array.isArray(f.options) && f.options.length > 0 ? f.options : ['Option 1'];
      item.values = optionsList.map((opt) => ({
        label: opt,
      }));
    }

    if (f.type === 'date') {
      item.datatype = 'xsd:date';
      item.granularity = 'day';
    } else if (f.type === 'time') {
      item.datatype = 'xsd:dateTime';
      item.granularity = 'second';
      item.inputTimeFormat = '12h';
      item.inputTimeZone = true;
    }

    return item;
  });

  return {
    type: 'template',
    name: name || 'Controlled Terms',
    ...(description ? { description } : {}),
    id: templateId,
    status: 'draft',
    version: version || '0.0.1',
    modelVersion: SCHEMA_VERSION,
    createdOn: now,
    createdBy: null,
    modifiedOn: now,
    modifiedBy: null,
    children,
  };
}

export const toCedarModel = toCedarJson;
