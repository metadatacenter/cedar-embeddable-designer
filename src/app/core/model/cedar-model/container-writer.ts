import type { DesignerTemplate } from './types';
import {
  AbstractDynamicChildDeploymentInfoBuilder,
  AbstractFieldChildDeploymentInfoBuilder,
  AnnotationAtId,
  AnnotationAtValue,
  Annotations,
  BiboStatus,
  CedarBuilders,
  CedarReaders,
  CedarWriters,
  ChildDeploymentInfoAlwaysMultipleBuilder,
  ChildDeploymentInfoBuilder,
  ChildDeploymentInfoElementBuilder,
  ChildDeploymentInfoStaticBuilder,
  JsonNode,
  Language,
  PavVersion,
  SchemaVersion,
  Template,
  TemplateElement,
} from 'cedar-model-typescript-library';
import { ChildNode, ContainerDraft, ElementNode, fieldNode, fieldView, flatView, newNodeId } from '../container-draft';
import {
  applyArtifactMetadata,
  artifactMetadataOf,
  derivedDescription,
  derivedTitle,
  newTemplateIdentifier,
} from './metadata';
import { deploymentKeys, keyedChild } from '../child-key-policy';
import { buildFieldNaming } from './field-writer';
import { LocalizedError, message } from '../../../i18n/messages';
import { annotationError } from '../annotations';
import { ArtifactMetadata, Field } from '../../models/types';

/** The designer's state, as a CEDAR template. */
export function buildTemplate(state: DesignerTemplate): Template {
  return buildContainerArtifact(state, 'template') as Template;
}

function buildContainerArtifact(
  state: DesignerTemplate,
  kind: 'template' | 'element',
  children?: ChildNode[],
): Template | TemplateElement {
  const builder = (kind === 'template' ? CedarBuilders.templateBuilder() : CedarBuilders.templateElementBuilder())
    .withAtId(state.identifier || newTemplateIdentifier())
    .withTitle(derivedTitle(state.name, kind))
    .withDescription(derivedDescription(state.name, kind))
    .withSchemaName(state.name)
    .withSchemaDescription(state.description || null)
    .withSchemaVersion(SchemaVersion.CURRENT)
    .withVersion(state.version || '0.0.1')
    .withStatus(BiboStatus.DRAFT);

  const members = children ?? state.fields.map(fieldNode);
  const views = members.map((node) => (node.kind === 'field' ? fieldView(node) : elementView(node)));
  const keys = deploymentKeys(members.map(keyedChild), kind);
  members.forEach((node, index) => {
    const field = views[index];
    const built =
      node.kind === 'field' ? buildFieldNaming(field) : (buildContainer(node.definition) as TemplateElement);
    // YAML restores effective labels/descriptions for new child entries. State
    // those defaults explicitly, while preserving absent imported overrides.
    const deployment = built
      .createDeploymentBuilder(keys[index])
      .withLabel(field.displayLabel ?? (field.artifact ? null : field.name))
      .withDescription(field.displayDescription ?? (field.artifact ? null : built.schema_description));

    /*
     * A static field's deployment builder does not extend the dynamic one, so it has no property
     * IRI — not a setting it ignores, a method it does not have. Building an image field threw
     * here until this branch existed.
     */
    if (deployment instanceof AbstractDynamicChildDeploymentInfoBuilder && field.propertyIri) {
      deployment.withIri(field.propertyIri);
    }

    /*
     * Everything a field's own `_ui` and `_valueConstraints` hold: an element's deployment builder
     * has none of these setters, because an element's `_ui` admits an order, property labels and
     * property descriptions and an element has no `_valueConstraints` at all, so the validation
     * library refuses a template that states any of them there. A static field keeps only the
     * hidden flag, through its own builder.
     */
    if (deployment instanceof AbstractFieldChildDeploymentInfoBuilder) {
      deployment
        .withHidden(field.hidden ?? false)
        .withRequiredValue(field.status === 'required')
        .withRecommendedValue(field.status === 'recommended')
        .withContinuePreviousLine(field.continuePreviousLine ?? false)
        .withValueRecommendationEnabled(field.valueRecommendationEnabled ?? false);
    } else if (deployment instanceof ChildDeploymentInfoStaticBuilder) {
      deployment.withHidden(field.hidden ?? false);
    }

    /*
     * Only where the type leaves the choice open. A checkbox, an attribute-value
     * field and a multiple-choice list are multiple by their type and a radio is
     * single by its, so their deployment builders have no flag to set — the
     * library models that by giving them a different builder rather than by
     * ignoring the call. An element states its multiplicity the same way a field
     * whose type leaves it open does, through a builder of its own.
     */
    const statesMultiplicity =
      deployment instanceof ChildDeploymentInfoBuilder || deployment instanceof ChildDeploymentInfoElementBuilder;
    if (statesMultiplicity) {
      deployment.withMultiInstance(field.allowMultiple);
    }
    if (deployment instanceof ChildDeploymentInfoAlwaysMultipleBuilder || (statesMultiplicity && field.allowMultiple)) {
      const min = field.minItems ?? null;
      const max = field.maxItems ?? null;
      if (
        [min, max].some((value) => value !== null && (!Number.isInteger(value) || value < 0)) ||
        (min !== null && max !== null && min > max)
      ) {
        throw new LocalizedError(message('errors.occurrences.range'));
      }
      deployment.withMinItems(min).withMaxItems(max);
    }
    builder.addChild(built, deployment.build());
  });

  const template = builder.build();
  if (state.metadata) {
    const metadata = state.metadata;
    applyArtifactMetadata(template, metadata.artifact);
    // The model library reads a title as the name gives it, so a renamed artifact's stored title
    // would come back changed. Write the one its name gives now.
    template.title = derivedTitle(state.name, kind);
    // Preserve an absent imported version until the author actually changes it.
    if (state.version !== (metadata.artifact.version ?? '')) {
      template.pav_version = PavVersion.forValue(state.version);
    }
    template.language = Language.forValue(metadata.language);
    template.instanceTypeSpecifications =
      metadata.instanceTypes ?? (metadata.instanceType ? [metadata.instanceType] : []);
    if (template instanceof Template) {
      template.header = metadata.header;
      template.footer = metadata.footer;
    }
    if (metadata.annotations) {
      const error = annotationError(metadata.annotations);
      if (error) throw new LocalizedError(error);
      template.annotations = new Annotations();
      for (const annotation of metadata.annotations) {
        template.annotations.add(
          annotation.kind === 'iri'
            ? new AnnotationAtId(annotation.name, annotation.value)
            : new AnnotationAtValue(annotation.name, annotation.value),
        );
      }
    }
  }
  template.schema_identifier = state.schemaIdentifier || null;
  return template;
}

export function templateToJson(template: Template | TemplateElement): JsonNode {
  if (template instanceof TemplateElement)
    return CedarWriters.json().getStrict().getTemplateElementWriter().getAsJsonNode(template);
  return CedarWriters.json().getStrict().getTemplateWriter().getAsJsonNode(template);
}

/**
 * The template as YAML, or a refusal.
 *
 * The written YAML is read back and compared with the JSON, and a difference throws
 * rather than returning the string. An export that quietly drops a field's version or
 * its provenance is worse than one that fails: the file looks complete.
 *
 * The model library also writes a compact form, and this does not offer it. Compact
 * YAML omits everything with a default, so it is an incomplete serialisation and a
 * write-only one: the ecosystem produces it and does not consume it, and CED refuses
 * it on input for that reason. The check below could not have covered it either, since
 * verifying an export means reading it back.
 *
 * So a compact writer is not waiting on a compact reader — no reader is coming. If CED
 * ever offers a compact export it will be a deliberate feature for something that only
 * needs to read the values, and it will still not be a form the designer can reopen.
 */
export function templateToYaml(template: Template | TemplateElement): string {
  const yaml =
    template instanceof Template
      ? CedarWriters.yaml().getStrict().getTemplateWriter().getAsYamlString(template, false)
      : CedarWriters.yaml().getStrict().getTemplateElementWriter().getAsYamlString(template, false);
  {
    const restored =
      template instanceof Template
        ? CedarReaders.yaml().getStrict().getTemplateReader().readFromString(yaml).template
        : CedarReaders.yaml().getStrict().getTemplateElementReader().readFromString(yaml).element;
    const canonical = (value: unknown): string => {
      if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
      if (value !== null && typeof value === 'object')
        return (
          '{' +
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
            .join(',') +
          '}'
        );
      return JSON.stringify(value);
    };
    if (canonical(templateToJson(template)) !== canonical(templateToJson(restored))) {
      throw new LocalizedError(message('errors.yaml.lossy'));
    }
  }
  return yaml;
}

/** Validate a reusable specification, including its deployment settings. */
export function validateFieldSpecification(field: Field): void {
  buildTemplate({ name: 'Field validation', description: '', identifier: '', version: '0.0.1', fields: [field] });
}

/** A compatibility view for the existing placement controls; elements never reach buildField. */
export function elementView(node: ElementNode): Field {
  return {
    id: node.id,
    type: 'element',
    name: node.definition.name,
    helpText: node.definition.description,
    options: [],
    defaultValue: { kind: 'none' },
    // An element records no requirement, so the view says what the model would answer.
    status: 'optional',
    ...node.placement,
  };
}

export function newContainer(kind: 'template' | 'element', name = ''): ContainerDraft {
  return {
    id: newNodeId(),
    kind,
    name,
    description: '',
    identifier: `https://repo.metadatacenter.org/${kind === 'template' ? 'templates' : 'template-elements'}/${crypto.randomUUID()}`,
    version: '0.0.1',
    children: [],
  };
}

/** Read lifecycle defaults without rebuilding an element's descendants. */
export function containerArtifactMetadata(draft: ContainerDraft): ArtifactMetadata {
  return (
    draft.metadata?.artifact ??
    artifactMetadataOf(buildContainerArtifact({ ...flatView(draft), fields: [] }, draft.kind, []))
  );
}

export function buildContainer(draft: ContainerDraft): Template | TemplateElement {
  const result = buildContainerArtifact(flatView(draft), draft.kind, draft.children);
  if (result instanceof TemplateElement) {
    result.skos_prefLabel = draft.preferredLabel ?? null;
    result.skos_altLabel = draft.alternateLabels ?? null;
  }
  return result;
}

/** CEE always takes a template, including when the authored document is an element. */
export function containerPreview(draft: ContainerDraft): Template {
  const model = buildContainer(draft);
  if (model instanceof Template) return model;
  return CedarBuilders.templateBuilder()
    .withAtId(draft.identifier + '/preview')
    .withSchemaName(draft.name)
    .withSchemaVersion(SchemaVersion.CURRENT)
    .withStatus(BiboStatus.DRAFT)
    .addChild(model, model.createDeploymentBuilder(draft.name || 'Element').build())
    .build();
}
