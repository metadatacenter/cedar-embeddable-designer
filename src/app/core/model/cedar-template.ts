/** Public facade for the CEDAR model adapter. Implementations depend on focused
 * modules below, never on this facade; components keep the same model boundary. */
export {
  fieldArtifactMetadata,
  defaultValueError,
  defaultValueFailure,
  fieldToJson,
  undescribedFieldToJson,
  choiceDefaultConflict,
} from './cedar-model/field-writer';
export type { DesignerTemplate, ContainerMetadata } from './cedar-model/types';
export { newFieldIdentity, newTemplateIdentifier } from './cedar-model/metadata';
export type { FieldParameter } from './cedar-model/capabilities';
export {
  PARAMETER_SETTERS,
  descriptorOf,
  allowsDefault,
  accepts,
  temporalGranularities,
  NUMERIC_TYPES,
  allowsStatus,
  allowsMultiple,
  allowsOptions,
  contentKindOf,
} from './cedar-model/capabilities';
export {
  buildTemplate,
  templateToJson,
  templateToYaml,
  validateFieldSpecification,
  elementView,
  newContainer,
  containerArtifactMetadata,
  buildContainer,
  containerPreview,
} from './cedar-model/container-writer';
export { readTemplate, toDesignerTemplate, readField, toContainerDraft, readContainer } from './cedar-model/reader';
export { ReservedNames } from './cedar-model/reserved-names';
export type { AttributeValueFieldParent } from './cedar-model/reserved-names';
