import {
  AbstractDynamicChildDeploymentInfo,
  AbstractFieldChildDeploymentInfo,
  AnnotationAtId,
  AnnotationAtValue,
  BiboStatus,
  CedarArtifactType,
  CedarBuilders,
  CedarFieldType,
  CedarReaders,
  CedarWriters,
  ChildDeploymentInfo,
  ControlledTermField,
  Iri,
  JsonNode,
  JsonPath,
  Language,
  NumericField,
  StaticImageField,
  StaticYoutubeField,
  Template,
  TemplateElement,
  TemplateField,
  TemporalField,
  TemporalType,
  TextArea,
  TextField,
} from 'cedar-model-typescript-library';
import { LocalizedError, message } from '../../../i18n/messages';
import { FIELD_DESCRIPTORS, allowsOptions, descriptorOf } from './capabilities';
import { Field, FieldDefaultValue } from '../../models/types';
import type { DesignerTemplate } from './types';
import { artifactMetadataOf } from './metadata';
import { controlledTermConstraintsOf } from './terminology';
import { childKeys } from '../child-key-policy';
import { templateToJson } from './container-writer';
import { ContainerDraft, containerFromFlat, fieldNode, newNodeId } from '../container-draft';

/**
 * Whether a YAML document is the compact form, which is the form to refuse.
 *
 * Compact YAML omits everything that has a default — `status`, `version` and
 * `modelVersion` among them — so it is an incomplete serialisation and a write-only
 * one. Reading it does not recover a template; it invents the parts that were left
 * out, and a template whose model version was guessed is worse than a file that would
 * not open.
 *
 * The absence of `modelVersion` is the marker, which is what the model library keys
 * on too. Its own message says a compact reader "has to be asked for", and that is
 * exactly the invitation to decline: the library can be asked, and CED should not ask.
 */
function isCompactYaml(document: string): boolean {
  return !/^modelVersion\s*:/m.test(document);
}

/**
 * A template from JSON or YAML, in either case as the same model.
 *
 * Throws on a source that is not a template. The designer used to swallow that:
 * `loadTemplate` caught the parse failure, logged it and returned, leaving the
 * author looking at their previous template with no indication that the file they
 * opened had not been read.
 *
 * Compact YAML is refused rather than read, in words meant for whoever opened the
 * file rather than for whoever wrote the reader.
 */
export function readTemplate(source: string | object): Template {
  const trimmed = typeof source === 'string' ? source.trim() : null;
  if (trimmed === null || trimmed.startsWith('{')) {
    const json = (trimmed === null ? source : JSON.parse(trimmed)) as JsonNode;
    const template = CedarReaders.json()
      .getStrict()
      .getTemplateReader()
      .readFromObject(withoutCheckedDefaults(json)).template;
    restoreDeclaredDefaults(template, json);
    // The model writer places container language in the instance context; its
    // current JSON reader only consults the top-level context.
    const context = (json['properties'] as JsonNode | undefined)?.['@context'] as JsonNode | undefined;
    if (typeof context?.['@language'] === 'string') {
      template.language = Language.forValue(context['@language']);
    }
    return template;
  }

  if (isCompactYaml(trimmed)) {
    throw new LocalizedError(message('errors.yaml.compactTemplate'));
  }

  const template = CedarReaders.yaml().getStrict().getTemplateReader().readFromString(trimmed).template;
  if (template.getChildrenInfo().children.length === 0 && !template.schema_name) {
    throw new LocalizedError(message('errors.open.notTemplate'));
  }
  return template;
}

function paletteTypeOf(field: TemplateField): string {
  /*
   * Temporal first, because two palette types share one CEDAR type and only the
   * value constraints tell them apart. Reading the table would give whichever of
   * the two it lists, which is how a time field came back as a date.
   */
  if (field.cedarFieldType === CedarFieldType.TEMPORAL) {
    return (field as TemporalField).valueConstraints.temporalType === TemporalType.TIME ? 'time' : 'date';
  }
  const match = Object.entries(FIELD_DESCRIPTORS).find(
    ([, descriptor]) => descriptor.cedarType === field.cedarFieldType,
  );
  return match ? match[0] : 'text';
}

/** The static content a field carries, for reading one back into the designer's state. */
function contentOf(field: TemplateField): string | undefined {
  const staticField = field as unknown as { content?: unknown; videoId?: unknown; value?: unknown };
  const value = staticField.videoId ?? staticField.content ?? staticField.value;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionsOf(field: TemplateField): string[] {
  const literals = (field as unknown as { valueConstraints?: { literals?: Array<{ label: string }> } }).valueConstraints
    ?.literals;
  return literals ? literals.map((literal) => literal.label) : [];
}

function defaultOf(field: TemplateField): FieldDefaultValue {
  const descriptor = descriptorOf(paletteTypeOf(field));
  const constraints = (
    field as TemplateField & {
      valueConstraints?: { defaultValue?: unknown; literals?: { label: string; selectedByDefault: boolean }[] };
    }
  ).valueConstraints;
  const value = constraints?.defaultValue;
  if (descriptor.options) {
    const selected =
      constraints?.literals?.filter((option) => option.selectedByDefault).map((option) => option.label) ?? [];
    if (selected.length === 0 && typeof value === 'string' && value !== '') selected.push(value);
    if (selected.length === 0) return { kind: 'none' };
    return descriptor.defaultKind === 'literals'
      ? { kind: 'literals', values: selected }
      : { kind: 'literal', value: selected[0] };
  }
  if (value === null || value === undefined || value === '') return { kind: 'none' };
  if (field.cedarFieldType === CedarFieldType.CONTROLLED_TERM) {
    const term = (field as ControlledTermField).valueConstraints.defaultValue;
    if (term) return { kind: 'iri', iri: term.termUri.getValue() ?? '', label: term.rdfsLabel };
  }
  if (value instanceof Iri) return { kind: 'iri', iri: value.getValue() ?? '', label: null };
  if (typeof value === 'number') return { kind: 'number', value };
  if (typeof value === 'string')
    return descriptor.defaultKind === 'temporal' ? { kind: 'temporal', value } : { kind: 'literal', value };
  return { kind: 'none' };
}

/** A parsed template, as the flat state the designer works in. */
export function toDesignerTemplate(template: Template): DesignerTemplate {
  const elements = template
    .getChildrenInfo()
    .children.filter((info) => template.getChild(info.name)?.cedarArtifactType === CedarArtifactType.TEMPLATE_ELEMENT);
  if (elements.length) {
    throw new LocalizedError(
      message('errors.open.containsElements', { names: elements.map((info) => info.name).join(', ') }),
    );
  }
  return projectContainerFields(template);
}

/** Internal field projection: the recursive reader assembles element nodes separately. */
function projectContainerFields(template: Template | TemplateElement): DesignerTemplate {
  const fields: Field[] = [];

  template.getChildrenInfo().children.forEach((info, index) => {
    /*
     * `getChild`, not `getField`. A static field's artifact type is
     * `StaticTemplateField` rather than `TemplateField`, and `getField` narrows
     * on that — so it answered null for every page break, section break, rich
     * text block, image and video, and reading a template silently dropped them.
     */
    const child = template.getChild(info.name);
    if (child === null || child.cedarArtifactType === CedarArtifactType.TEMPLATE_ELEMENT) {
      return;
    }
    const field = child as TemplateField;
    const dynamic = info as AbstractDynamicChildDeploymentInfo;

    fields.push({
      id: index + 1,
      artifact: artifactMetadataOf(field),
      valueRecommendationEnabled:
        info instanceof AbstractFieldChildDeploymentInfo ? info.valueRecommendationEnabled : false,
      publishedDefinition:
        field.bibo_status === BiboStatus.PUBLISHED
          ? JSON.stringify(CedarWriters.json().getStrict().getFieldWriterForField(field).getAsJsonNode(field))
          : undefined,
      type: paletteTypeOf(field),
      name: field.schema_name ?? info.name,
      deploymentName: info.name,
      status: dynamic.requiredValue ? 'required' : dynamic.recommendedValue ? 'recommended' : 'optional',
      options: optionsOf(field),
      preferredLabel: field.skos_prefLabel ?? undefined,
      alternateLabels: field.skos_altLabel ?? undefined,
      schemaIdentifier: field.schema_identifier ?? undefined,
      language: field.language.getValue() ?? undefined,
      annotations: field.annotations?.getAnnotationNames().map((name) => {
        const annotation = field.annotations!.get(name)!;
        return annotation instanceof AnnotationAtId
          ? { name, kind: 'iri' as const, value: annotation.getAtId() }
          : { name, kind: 'literal' as const, value: (annotation as AnnotationAtValue).getAtValue() };
      }),
      defaultValue: defaultOf(field),
      importedChoiceDefault: allowsOptions(paletteTypeOf(field))
        ? ((field as unknown as { valueConstraints: { defaultValue: string | null } }).valueConstraints.defaultValue ??
          undefined)
        : undefined,
      temporal:
        field.cedarFieldType === CedarFieldType.TEMPORAL
          ? {
              type: (field as TemporalField).valueConstraints.temporalType.getValue() ?? 'xsd:date',
              granularity: (field as TemporalField).temporalGranularity.getValue() ?? 'day',
              timezoneEnabled: (field as TemporalField).timezoneEnabled,
              inputTimeFormat: (field as TemporalField).inputTimeFormat.getValue(),
            }
          : undefined,
      textConstraints:
        field.cedarFieldType === CedarFieldType.TEXT || field.cedarFieldType === CedarFieldType.TEXTAREA
          ? {
              minLength: (field as TextField | TextArea).valueConstraints.minLength,
              maxLength: (field as TextField | TextArea).valueConstraints.maxLength,
              regex: field.cedarFieldType === CedarFieldType.TEXT ? (field as TextField).valueConstraints.regex : null,
            }
          : undefined,
      numeric:
        field.cedarFieldType === CedarFieldType.NUMERIC
          ? {
              type: (field as NumericField).valueConstraints.numberType.getValue() ?? 'xsd:decimal',
              min: (field as NumericField).valueConstraints.minValue,
              max: (field as NumericField).valueConstraints.maxValue,
              decimalPlaces: (field as NumericField).valueConstraints.decimalPlaces,
              unit: (field as NumericField).valueConstraints.unitOfMeasure,
            }
          : undefined,
      allowMultiple: info instanceof ChildDeploymentInfo ? info.multiInstance : info.isMultiInAnyWay(),
      displayLabel: info.label ?? undefined,
      displayDescription: info.description ?? undefined,
      hidden: info.hidden,
      continuePreviousLine: info instanceof AbstractFieldChildDeploymentInfo ? info.continuePreviousLine : false,
      minItems: info.isMultiInAnyWay() ? dynamic.minItems : null,
      maxItems: info.isMultiInAnyWay() ? dynamic.maxItems : null,
      helpText: descriptionText(field.schema_description),
      content: contentOf(field),
      ...(paletteTypeOf(field) === 'image' || paletteTypeOf(field) === 'youtube'
        ? {
            width: (field as StaticImageField | StaticYoutubeField).width,
            height: (field as StaticImageField | StaticYoutubeField).height,
          }
        : {}),
      atId: field.at_id?.getValue() ?? undefined,
      propertyIri: dynamic.iri ?? undefined,
      controlledTermConstraints: controlledTermConstraintsOf(field),
    });
  });

  return {
    name: template.schema_name ?? '',
    description: descriptionText(template.schema_description),
    identifier: template.at_id?.getValue() ?? '',
    schemaIdentifier: template.schema_identifier,
    version: template.pav_version?.getValue() ?? '',
    metadata: {
      artifact: artifactMetadataOf(template),
      language: template.language.getValue(),
      instanceType: template.instanceTypeSpecification,
      instanceTypes: [...template.instanceTypeSpecifications],
      header: template instanceof Template ? template.header : null,
      footer: template instanceof Template ? template.footer : null,
      annotations: template.annotations?.getAnnotationNames().map((name) => {
        const annotation = template.annotations!.get(name)!;
        return annotation instanceof AnnotationAtId
          ? { name, kind: 'iri' as const, value: annotation.getAtId() }
          : { name, kind: 'literal' as const, value: (annotation as AnnotationAtValue).getAtValue() };
      }),
    },
    fields,
  };
}

/** Read a first-class field through the model, then reuse the template field mapping. */
/**
 * The key a field is filed under while it is read through a template.
 *
 * A field's name need not be a key the model accepts. An author may name a field "@id", or an
 * attribute-value field "name", and the designer files such a field under a key derived from the
 * name instead. Reading it files it the same way, so a field the designer can write is one it can
 * read back.
 */
function readingKey(field: TemplateField): string {
  const attributeValue = field.cedarFieldType === CedarFieldType.ATTRIBUTE_VALUE;
  return childKeys([{ name: field.schema_name ?? '', kind: 'field', attributeValue }], 'template')[0];
}

export function readField(source: string): Field {
  const text = source.trim();
  if (text.startsWith('{')) {
    const sourceNode = JSON.parse(text);
    const field = CedarReaders.json()
      .getStrict()
      .getTemplateFieldReader()
      .readFromObject(withoutCheckedDefaults(sourceNode)).field;
    if (!field.schema_name) throw new LocalizedError(message('errors.open.fieldNeedsName'));
    const key = readingKey(field);
    const container = CedarBuilders.templateBuilder().withSchemaName('Field import').build();
    container.addChild(field, field.createDeploymentBuilder(key).build());
    const document = JSON.parse(JSON.stringify(templateToJson(container)));
    const property = document.properties[key];
    // Attribute-value standalone artifacts already carry the deployment array
    // envelope. Reuse its definition rather than nesting one array inside another.
    if (property.items) property.items = sourceNode.type === 'array' ? sourceNode.items : sourceNode;
    else document.properties[key] = sourceNode;
    return toDesignerTemplate(readTemplate(JSON.stringify(document))).fields[0];
  }
  // A field document carries the same marker as a template, and the same reason applies.
  if (isCompactYaml(text)) {
    throw new LocalizedError(message('errors.yaml.compactField'));
  }
  const reader = CedarReaders.yaml().getStrict().getTemplateFieldReader();
  const parsed = reader.readFromString(text);
  const deployment = new ChildDeploymentInfo(readingKey(parsed.field));
  const field = reader.readFromObject(parsed.fieldSourceObject, deployment, new JsonPath()).field;
  if (!field.schema_name) throw new LocalizedError(message('errors.open.fieldNeedsName'));
  const container = CedarBuilders.templateBuilder().withSchemaName('Field import').build();
  container.addChild(field, deployment);
  return toDesignerTemplate(container).fields[0];
}

/** Preserve every child and its placement in model order, recursively. */
export function toContainerDraft(container: Template | TemplateElement): ContainerDraft {
  const flat = projectContainerFields(container);
  const draft = containerFromFlat(flat);
  draft.kind = container instanceof TemplateElement ? 'element' : 'template';
  if (container instanceof TemplateElement) {
    draft.preferredLabel = container.skos_prefLabel;
    draft.alternateLabels = container.skos_altLabel;
  }
  const fields = new Map(flat.fields.map((field) => [field.deploymentName, field]));
  draft.children = container.getChildrenInfo().children.map((info) => {
    const child = container.getChild(info.name);
    if (!child) throw new LocalizedError(message('errors.open.missingChild', { name: info.name }));
    if (!(child instanceof TemplateElement)) {
      const field = fields.get(info.name);
      if (!field) throw new LocalizedError(message('errors.open.unsupportedChild', { name: info.name }));
      return fieldNode({ ...field, id: newNodeId() });
    }
    const definition = toContainerDraft(child);
    const dynamic = info as AbstractDynamicChildDeploymentInfo;
    return {
      kind: 'element',
      id: definition.id,
      definition,
      placement: {
        deploymentName: info.name,
        displayLabel: info.label ?? undefined,
        displayDescription: info.description ?? undefined,
        allowMultiple: info instanceof ChildDeploymentInfo ? info.multiInstance : info.isMultiInAnyWay(),
        minItems: dynamic.minItems,
        maxItems: dynamic.maxItems,
        propertyIri: dynamic.iri ?? undefined,
      },
    };
  });
  return draft;
}

export function readContainer(source: string | object): ContainerDraft {
  const text = typeof source === 'string' ? source.trim() : null;
  if (text === null || text.startsWith('{')) {
    const json = (text === null ? source : JSON.parse(text)) as JsonNode;
    const type = json['@type'];
    if (
      type !== 'https://schema.metadatacenter.org/core/Template' &&
      type !== 'https://schema.metadatacenter.org/core/TemplateElement'
    )
      throw new LocalizedError(message('errors.open.notContainer'));
    const model =
      type === 'https://schema.metadatacenter.org/core/TemplateElement'
        ? CedarReaders.json().getStrict().getTemplateElementReader().readFromObject(withoutCheckedDefaults(json))
            .element
        : readTemplate(json);
    restoreDeclaredDefaults(model, json);
    restoreContainerLanguages(model, json);
    return toContainerDraft(model);
  }
  if (isCompactYaml(text)) throw new LocalizedError(message('errors.yaml.compactReopen'));
  const parsed = CedarReaders.yaml().getStrict().getTemplateReader().readFromString(text);
  const kind = parsed.templateSourceObject['type'];
  if (kind !== 'template' && kind !== 'element') throw new LocalizedError(message('errors.open.notContainer'));
  const model =
    kind === 'element'
      ? CedarReaders.yaml().getStrict().getTemplateElementReader().readFromString(text).element
      : parsed.template;
  if (!model.schema_name) throw new LocalizedError(message('errors.open.notContainer'));
  return toContainerDraft(model);
}

/**
 * Numeric/temporal readers validate defaults against their constraints while
 * reading. Authoring must retain a well-shaped but invalid supplied value so it
 * can be repaired. Read the schema without those values, then restore them on
 * the model before projection; never change the caller's object or its rules.
 */
function deferredDefault(source: JsonNode): number | string | undefined {
  const type = (source['_ui'] as JsonNode | undefined)?.['inputType'];
  const value = (source['_valueConstraints'] as JsonNode | undefined)?.['defaultValue'];
  if (type === 'temporal' && typeof value === 'string') return value;
  if (
    type === 'numeric' &&
    (typeof value === 'number' ||
      (typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))) &&
    Number.isFinite(Number(value))
  )
    return Number(value);
  return undefined;
}

function withoutCheckedDefaults(source: JsonNode): JsonNode {
  const copy = structuredClone(source);
  const visit = (node: JsonNode) => {
    if (deferredDefault(node) !== undefined) delete (node['_valueConstraints'] as JsonNode)['defaultValue'];
    const properties = node['properties'] as JsonNode | undefined;
    for (const value of Object.values(properties ?? {}))
      if (value && typeof value === 'object' && !Array.isArray(value)) visit(value as JsonNode);
    if (node['items'] && typeof node['items'] === 'object') visit(node['items'] as JsonNode);
  };
  visit(copy);
  return copy;
}

function restoreDeclaredDefaults(model: Template | TemplateElement | TemplateField, source: JsonNode): void {
  const definition = (source['items'] ?? source) as JsonNode;
  if (model instanceof Template || model instanceof TemplateElement) {
    const properties = definition['properties'] as JsonNode | undefined;
    for (const child of model.getChildrenInfo().children) {
      const artifact = model.getChild(child.name);
      const original = properties?.[child.name];
      if (artifact && original)
        restoreDeclaredDefaults(artifact as TemplateElement | TemplateField, original as JsonNode);
    }
  } else {
    const value = deferredDefault(definition);
    if (model.cedarFieldType === CedarFieldType.NUMERIC && typeof value === 'number')
      (model as NumericField).valueConstraints.defaultValue = value;
    if (model.cedarFieldType === CedarFieldType.TEMPORAL && typeof value === 'string')
      (model as TemporalField).valueConstraints.defaultValue = value;
  }
}

function restoreContainerLanguages(model: Template | TemplateElement, source: JsonNode): void {
  const properties = source['properties'] as JsonNode | undefined;
  const context = properties?.['@context'] as JsonNode | undefined;
  if (typeof context?.['@language'] === 'string') model.language = Language.forValue(context['@language']);
  for (const info of model.getChildrenInfo().children) {
    const child = model.getChild(info.name);
    if (child instanceof TemplateElement) {
      const property = properties?.[info.name] as JsonNode | undefined;
      if (property) restoreContainerLanguages(child, (property['items'] ?? property) as JsonNode);
    }
  }
}

/** Older Workbench versions persisted this untranslated empty-description fallback. */
function descriptionText(value: string | null | undefined): string {
  return value === 'VALIDATION.noDescriptionField' ? '' : (value ?? '');
}
