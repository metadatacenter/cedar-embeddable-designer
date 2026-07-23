// SHIM: Serialization logic for CEDAR 1.6.0 JSON-LD format.
// This belongs in @metadatacenter/cedar-model (cedar-ts repo) once that library
// ships a concrete JSON-LD serializer. To migrate:
//   1. npm install the updated @metadatacenter/cedar-model
//   2. Replace the body of toCedarJson() with calls to the library's serialize API
//   3. Delete this file and cedar-model.types.ts

import { Field } from '../models/types';
import { CedarField, CedarFieldUi, CedarFieldValueConstraints, CedarTemplate } from './cedar-model.types';

// ─── Constants ──────────────────────────────────────────────────────────────

const SCHEMA_VERSION = '1.6.0' as const;
const CEDAR_CORE = 'https://schema.metadatacenter.org/core/';
const CEDAR_REPO_TEMPLATE = 'https://repo.metadatacenter.org/templates/';
const CEDAR_REPO_FIELD = 'https://repo.metadatacenter.org/template-fields/';

const TEMPLATE_CONTEXT: Record<string, string> = {
  'xsd':    'http://www.w3.org/2001/XMLSchema#',
  'pav':    'http://purl.org/pav/',
  'bibo':   'http://purl.org/ontology/bibo/',
  'oslc':   'http://open-services.net/ns/core#',
  'schema': 'http://schema.org/',
  'skos':   'http://www.w3.org/2004/02/skos/core#',
  'rdfs':   'http://www.w3.org/2000/01/rdf-schema#',
  'schema:name':        { '@type': 'xsd:string' } as unknown as string,
  'schema:description': { '@type': 'xsd:string' } as unknown as string,
  'pav:createdOn':      { '@type': 'xsd:dateTime' } as unknown as string,
  'pav:lastUpdatedOn':  { '@type': 'xsd:dateTime' } as unknown as string,
  'pav:version':        { '@type': 'xsd:string' } as unknown as string,
  'bibo:status':        { '@type': 'xsd:string' } as unknown as string,
};

const FIELD_CONTEXT: Record<string, string | object> = {
  'schema:name':        { '@type': 'xsd:string' },
  'schema:description': { '@type': 'xsd:string' },
  'skos:prefLabel':     { '@type': 'xsd:string' },
  'pav:createdOn':      { '@type': 'xsd:dateTime' },
  'pav:lastUpdatedOn':  { '@type': 'xsd:dateTime' },
  'pav:version':        { '@type': 'xsd:string' },
  'bibo:status':        { '@type': 'xsd:string' },
};

// ─── Field Type Mapping ──────────────────────────────────────────────────────

/** Maps editor field types to CEDAR inputType values */
const EDITOR_TO_CEDAR_INPUT_TYPE: Record<string, string> = {
  text:            'textfield',
  paragraph:       'textarea',
  multipleChoice:  'radio',
  checkboxes:      'checkbox',
  date:            'temporal',
  time:            'temporal',
  email:           'email',
  link:            'link',
  phone:           'phone-number',
  number:          'numeric',
  image:           'image',
  orcid:           'orcid',
  controlledTerms: 'controlled-term',
};

// ─── Key Utilities ───────────────────────────────────────────────────────────

/** Converts a field name to a safe JSON property key (snake_case, lowercase) */
function toFieldKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'field';
}

/** Generates a pseudo-UUID for shim use (not cryptographically secure) */
function shimUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ─── Field Serializer ────────────────────────────────────────────────────────

function buildFieldUi(field: Field): CedarFieldUi {
  const inputType = EDITOR_TO_CEDAR_INPUT_TYPE[field.type] ?? 'textfield';
  const ui: CedarFieldUi = { inputType };

  if (field.type === 'date') {
    ui.temporalGranularity = 'day';
  } else if (field.type === 'time') {
    ui.temporalGranularity = 'second';
    ui.timezoneEnabled = false;
    ui.inputTimeFormat = '24h';
  }

  return ui;
}

function buildValueConstraints(field: Field): CedarFieldValueConstraints {
  const vc: CedarFieldValueConstraints = {
    requiredValue: field.status === 'required',
  };

  if (field.allowMultiple) {
    vc.multipleChoice = true;
  }

  if (field.type === 'multipleChoice' || field.type === 'checkboxes') {
    vc.multipleChoice = field.type === 'checkboxes';
    vc.literals = field.options.map((opt, idx) => ({
      label: opt,
      selectedByDefault: field.defaultValue === opt || idx === 0 && !!field.defaultValue,
    }));
  }

  if (field.type === 'number') {
    vc.numberType = 'xsd:decimal';
  }

  if (field.type === 'date') {
    vc.temporalType = 'xsd:date';
  } else if (field.type === 'time') {
    vc.temporalType = 'xsd:time';
  }

  if (field.controlledTermConfig) {
    const cfg = field.controlledTermConfig;
    if (cfg.sourceType === 'ontology' && cfg.ontologyId) {
      vc.ontologies = [{ uri: cfg.ontologyId, acronym: cfg.ontologyId, name: cfg.ontologyName ?? '' }];
    } else if (cfg.sourceType === 'value-set' && cfg.sourceId) {
      vc.valueSets = [{ uri: cfg.sourceId, name: cfg.sourceName ?? '', vsCollection: '' }];
    } else if (cfg.sourceType === 'ontology-branch' && cfg.branchRootId) {
      vc.branches = [{
        source: cfg.ontologyId ?? '',
        acronym: cfg.ontologyId ?? '',
        ontologyName: cfg.ontologyName ?? '',
        uri: cfg.branchRootId,
        maxDepth: cfg.searchDepth ?? 0,
      }];
    }
  }

  if (field.defaultValue) {
    vc.defaultValue = field.defaultValue;
  }

  return vc;
}

function buildCedarField(field: Field): CedarField {
  const isControlledTerm = field.type === 'controlledTerms';

  const properties: CedarField['properties'] = isControlledTerm
    ? {
        '@id':       { type: 'string', format: 'uri' },
        'rdfs:label': { type: ['string', 'null'] },
        '@type': {
          oneOf: [
            { type: 'string', format: 'uri' },
            { type: 'array', items: { type: 'string', format: 'uri' }, uniqueItems: true },
          ],
        },
      }
    : {
        '@type': {
          oneOf: [
            { type: 'string', format: 'uri' },
            { type: 'array', items: { type: 'string', format: 'uri' }, uniqueItems: true },
          ],
        },
        '@value': { type: ['string', 'null'] },
      };

  return {
    '@context':           FIELD_CONTEXT as CedarField['@context'],
    '@type':              `${CEDAR_CORE}TemplateField`,
    '@id':                `${CEDAR_REPO_FIELD}${shimUuid()}`,
    'schema:identifier':  shimUuid(),
    'schema:name':        field.name,
    'schema:description': field.helpText ?? '',
    'skos:prefLabel':     field.name,
    'pav:createdOn':      null,
    'pav:createdBy':      null,
    'pav:lastUpdatedOn':  null,
    'oslc:modifiedBy':    null,
    'schema:schemaVersion': SCHEMA_VERSION,
    'pav:version':        '0.0.1',
    'bibo:status':        'bibo:draft',
    _ui:                  buildFieldUi(field),
    _valueConstraints:    buildValueConstraints(field),
    title:                field.name,
    description:          field.helpText ?? '',
    type:                 'object',
    properties,
    required:             isControlledTerm ? ['@id'] : ['@value'],
    additionalProperties: false,
  };
}

// ─── Template Serializer ─────────────────────────────────────────────────────

/**
 * Converts the editor's template state to a CEDAR 1.6.0 JSON-LD Template object.
 *
 * SHIM: Once @metadatacenter/cedar-model ships serialize.toJsonLd(), replace the body
 * of this function with:
 *   const cedarTpl = template({ id, modelVersion, metadata, members });
 *   return serialize.toJsonLd(cedarTpl);
 */
export function toCedarJson(
  name: string,
  description: string,
  fields: Field[],
  identifier?: string,
  version?: string
): CedarTemplate {
  const templateId = identifier ? (identifier.startsWith('http') ? identifier : `${CEDAR_REPO_TEMPLATE}${identifier}`) : `${CEDAR_REPO_TEMPLATE}${shimUuid()}`;
  const now = new Date().toISOString();

  // Build unique field keys (disambiguate duplicate names)
  const keyCounts: Record<string, number> = {};
  const fieldKeys = fields.map((f) => {
    const base = toFieldKey(f.name);
    keyCounts[base] = (keyCounts[base] ?? 0) + 1;
    return base;
  });
  // Suffix duplicates: first occurrence keeps bare key, subsequent get _2, _3, …
  const seenKeys: Record<string, number> = {};
  const uniqueKeys = fieldKeys.map((k) => {
    if (keyCounts[k] === 1) return k;
    seenKeys[k] = (seenKeys[k] ?? 0) + 1;
    return seenKeys[k] === 1 ? k : `${k}_${seenKeys[k]}`;
  });

  // Build @context mapping for each field key (points to its property IRI — using schema:name for shim)
  const fieldContextEntries: Record<string, string> = {};
  uniqueKeys.forEach((key) => {
    fieldContextEntries[key] = `https://schema.org/${key}`;
  });

  // Template-level @context properties object (for the properties.@context sub-schema)
  const propertiesContextRequired = ['@vocab'];
  const propertiesContextProperties: Record<string, { enum: string[] }> = {
    '@vocab': { enum: ['https://schema.metadatacenter.org/core/'] },
  };
  uniqueKeys.forEach((key, idx) => {
    const iri = `https://schema.org/${key}`;
    propertiesContextProperties[key] = { enum: [iri] };
    propertiesContextRequired.push(key);
  });

  // Build field property entries
  const fieldProperties: Record<string, CedarField> = {};
  fields.forEach((field, idx) => {
    fieldProperties[uniqueKeys[idx]] = buildCedarField(field);
  });

  const required = ['@context', '@id', ...uniqueKeys];

  return {
    '@context': {
      ...TEMPLATE_CONTEXT,
      ...fieldContextEntries,
    },
    '@type':              `${CEDAR_CORE}Template`,
    '@id':                templateId,
    'schema:identifier':  identifier || shimUuid(),
    'schema:name':        name,
    'schema:description': description,
    'pav:createdOn':      now,
    'pav:createdBy':      null,
    'pav:lastUpdatedOn':  now,
    'oslc:modifiedBy':    null,
    'schema:schemaVersion': SCHEMA_VERSION,
    'pav:version':        version || '0.0.1',
    'bibo:status':        'bibo:draft',
    _ui: {
      order:               uniqueKeys,
      propertyLabels:      Object.fromEntries(uniqueKeys.map((k, i) => [k, fields[i].name])),
      propertyDescriptions: Object.fromEntries(uniqueKeys.map((k, i) => [k, fields[i].helpText ?? ''])),
    },
    _valueConstraints: {},
    properties: {
      '@context': {
        type:                 'object',
        properties:           propertiesContextProperties,
        required:             propertiesContextRequired,
        additionalProperties: false,
      },
      '@id': { type: 'string', format: 'uri' },
      ...fieldProperties,
    },
    required,
    title:       name,
    description: description,
    type:        'object',
    additionalProperties: false,
  };
}
