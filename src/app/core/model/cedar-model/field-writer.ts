import { ArtifactMetadata, Field, FieldDefaultValue } from '../../models/types';
import { NUMERIC_TYPES, accepts, allowsOptions, descriptorOf, temporalGranularities } from './capabilities';
import {
  LocalizedError,
  Message,
  Translate,
  countKey,
  describeError,
  english,
  errorParam,
  message,
} from '../../../i18n/messages';
import type { FieldBuilder } from './types';
import {
  AnnotationAtId,
  AnnotationAtValue,
  Annotations,
  BiboStatus,
  CedarReaders,
  CedarWriters,
  CheckboxFieldBuilder,
  ControlledTermDefaultValueBuilder,
  ControlledTermFieldBuilder,
  Iri,
  JsonNode,
  Language,
  MultipleChoiceListFieldBuilder,
  NumberType,
  NumericFieldBuilder,
  RadioFieldBuilder,
  SchemaVersion,
  SingleChoiceListFieldBuilder,
  StaticImageFieldBuilder,
  StaticYoutubeFieldBuilder,
  TemplateField,
  TemporalFieldBuilder,
  TemporalGranularity,
  TemporalType,
  TextAreaBuilder,
  TextFieldBuilder,
  TimeFormat,
} from 'cedar-model-typescript-library';
import { defaultFormatError } from '../field-default';
import { applyArtifactMetadata, artifactMetadataOf, derivedDescription, derivedTitle } from './metadata';
import { buildControlledTermSet } from './terminology';
import { annotationError } from '../annotations';

const INTEGER_RANGES: Record<string, readonly [number, number]> = {
  'xsd:byte': [-128, 127],
  'xsd:short': [-32768, 32767],
  'xsd:int': [-2147483648, 2147483647],
  // The model stores JavaScript numbers, so the full 64-bit range is not lossless.
  'xsd:long': [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
};

function validateNumericSettings(field: Field): void {
  const { type, min, max, decimalPlaces } = field.numeric!;
  if (!NUMERIC_TYPES.some((candidate) => candidate === type))
    throw new LocalizedError(message('errors.numeric.datatype'));
  const typeLabel = type.replace('xsd:', '');
  const range = INTEGER_RANGES[type];
  const values: [Message, number | null][] = [
    [message('errors.numeric.minimumValue'), min],
    [message('errors.numeric.maximumValue'), max],
  ];
  if (field.defaultValue?.kind === 'number')
    values.push([message('errors.numeric.defaultValue'), field.defaultValue.value]);
  for (const [label, value] of values) {
    if (value === null) continue;
    if (!Number.isFinite(value)) throw new LocalizedError(message('errors.numeric.infinite', { label }));
    if (range) {
      if (!Number.isInteger(value))
        throw new LocalizedError(message('errors.numeric.integerOnly', { label, type: typeLabel }));
      if (value < range[0] || value > range[1]) {
        throw new LocalizedError(message('errors.numeric.range', { min: String(range[0]), max: String(range[1]) }));
      }
    }
    if (type === 'xsd:float') {
      const magnitude = Math.abs(value);
      if (magnitude > 3.4028234663852886e38) throw new LocalizedError(message('errors.numeric.floatRange'));
      if (magnitude !== 0 && magnitude < 1.401298464324817e-45)
        throw new LocalizedError(message('errors.numeric.floatTooSmall'));
    }
  }
  if (min !== null && max !== null && min > max) throw new LocalizedError(message('errors.numeric.minAboveMax'));
  if (decimalPlaces !== null && (!Number.isSafeInteger(decimalPlaces) || decimalPlaces < 0))
    throw new LocalizedError(message('errors.numeric.decimalPlacesNegative'));
  if (range && decimalPlaces !== null && decimalPlaces !== 0)
    throw new LocalizedError(message('errors.numeric.decimalPlacesInteger', { type: typeLabel }));
  if (decimalPlaces !== null) {
    for (const [label, value] of values) {
      if (value === null) continue;
      // Count decimal digits without multiplication or rounding, including exponent notation.
      const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e');
      const places = Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent));
      if (places > decimalPlaces)
        throw new LocalizedError(
          message(countKey('errors.numeric.tooManyPlaces', decimalPlaces), {
            label,
            count: String(decimalPlaces),
          }),
        );
    }
  }
  if (field.defaultValue?.kind === 'number') {
    const value = field.defaultValue.value;
    if ((min !== null && value < min) || (max !== null && value > max))
      throw new LocalizedError(message('errors.numeric.defaultOutsideRange'));
  }
}

function buildTemporal(builder: FieldBuilder, field: Field): void {
  const paletteType = field.type;
  const temporal = builder as TemporalFieldBuilder;
  if (field.temporal) {
    if (!temporalGranularities(field.temporal.type).includes(field.temporal.granularity))
      throw new LocalizedError(message('errors.temporal.precisionIncompatible'));
    temporal.withTemporalType(TemporalType.forValue(field.temporal.type));
    temporal.withTemporalGranularity(TemporalGranularity.forValue(field.temporal.granularity));
    temporal.withTimezoneEnabled(field.temporal.timezoneEnabled);
    temporal.withInputTimeFormat(TimeFormat.forValue(field.temporal.inputTimeFormat));
    return;
  }
  if (paletteType === 'time') {
    temporal.withTemporalType(TemporalType.TIME);
    temporal.withTemporalGranularity(TemporalGranularity.MINUTE);
  } else {
    temporal.withTemporalType(TemporalType.DATE);
    temporal.withTemporalGranularity(TemporalGranularity.DAY);
  }
}

function buildOptions(builder: FieldBuilder, field: Field): void {
  const selected =
    field.defaultValue.kind === 'literals'
      ? field.defaultValue.values
      : field.defaultValue.kind === 'literal'
        ? [field.defaultValue.value]
        : [];
  const scalar = field.importedChoiceDefault ?? selected.find((value) => !field.options.includes(value));
  if (scalar !== undefined)
    (
      builder as
        RadioFieldBuilder | CheckboxFieldBuilder | SingleChoiceListFieldBuilder | MultipleChoiceListFieldBuilder
    ).withDefaultValue(scalar);
  for (const option of field.options) {
    /*
     * An option the author has not named yet is not an option. Its label is
     * empty because the card seeds a blank and lets the placeholder show the
     * hint, so writing it would put `{"label": ""}` in the artifact.
     */
    if (option.trim() === '') {
      continue;
    }
    descriptorOf(field.type).options!(builder, option, selected.includes(option));
  }
}

/**
 * The one value a static field carries.
 *
 * Three different setters for what is, to an author, the same box: the markup of
 * a rich text block, the address of an image, the id of a video.
 */
function buildStaticContent(builder: FieldBuilder, kind: 'markup' | 'url' | 'videoId', content: string): void {
  if (!content) {
    return;
  }
  const staticBuilder = builder as unknown as {
    withContent?(content: string): unknown;
    withVideoId?(videoId: string): unknown;
  };
  if (kind === 'videoId') {
    staticBuilder.withVideoId?.(content);
  } else {
    staticBuilder.withContent?.(content);
  }
}

function buildField(field: Field): TemplateField {
  if (field.publishedDefinition)
    return CedarReaders.json().getStrict().getTemplateFieldReader().readFromString(field.publishedDefinition).field;
  const descriptor = descriptorOf(field.type);
  const formatError = defaultFormatError(field, field.defaultValue, (key) => key);
  if (formatError) throw new LocalizedError(message(formatError));
  const builder = descriptor.build();

  builder
    .withTitle(derivedTitle(field.name, 'field'))
    .withDescription(derivedDescription(field.name, 'field'))
    .withPreferredLabel(field.preferredLabel || null)
    .withAlternateLabels(field.alternateLabels?.length ? field.alternateLabels : null)
    .withSchemaIdentifier(field.schemaIdentifier || null)
    .withSchemaName(field.name)
    // Let the installed model supply its canonical default for an absent description.
    .withSchemaDescription(field.helpText || null)
    .withSchemaVersion(SchemaVersion.CURRENT)
    .withStatus(BiboStatus.DRAFT);

  if (field.atId) {
    builder.withAtId(field.atId);
  }

  if (accepts(field.type, 'temporalPrecision')) {
    buildTemporal(builder, field);
  }
  if (accepts(field.type, 'textLength') && field.textConstraints) {
    const { minLength, maxLength, regex } = field.textConstraints;
    if (
      [minLength, maxLength].some((n) => n !== null && (!Number.isInteger(n) || n < 0)) ||
      (minLength !== null && maxLength !== null && minLength > maxLength)
    ) {
      throw new LocalizedError(message('errors.text.lengths'));
    }
    const pattern = accepts(field.type, 'textPattern') && regex ? new RegExp(regex) : null;
    if (field.defaultValue.kind === 'literal') {
      const value = field.defaultValue.value;
      if (minLength !== null && value.length < minLength)
        throw new LocalizedError(
          message(countKey('errors.text.defaultTooShort', minLength), { count: String(minLength) }),
        );
      if (maxLength !== null && value.length > maxLength)
        throw new LocalizedError(
          message(countKey('errors.text.defaultTooLong', maxLength), { count: String(maxLength) }),
        );
      if (pattern && !pattern.test(value)) throw new LocalizedError(message('errors.text.defaultPattern'));
    }
    (builder as TextFieldBuilder | TextAreaBuilder).withMinLength(minLength).withMaxLength(maxLength);
    if (accepts(field.type, 'textPattern')) (builder as TextFieldBuilder).withRegex(regex);
  }
  if (accepts(field.type, 'numericBounds') && field.numeric) {
    validateNumericSettings(field);
    const numeric = builder as NumericFieldBuilder;
    numeric
      .withNumberType(NumberType.forValue(field.numeric.type))
      .withMinValue(field.numeric.min)
      .withMaxValue(field.numeric.max)
      .withDecimalPlaces(field.numeric.decimalPlaces)
      .withUnitOfMeasure(field.numeric.unit);
  }
  if (descriptor.options) {
    buildOptions(builder, field);
  }
  if (accepts(field.type, 'controlledTermConstraints')) {
    buildControlledTermSet(builder, field.controlledTermConstraints);
  }
  if (descriptor.content) {
    buildStaticContent(builder, descriptor.content, field.content ?? '');
  }
  if (accepts(field.type, 'mediaDimensions')) {
    for (const dimension of [field.width, field.height]) {
      if (dimension != null && (!Number.isInteger(dimension) || dimension <= 0))
        throw new LocalizedError(message('errors.media.dimensions'));
    }
    (builder as StaticImageFieldBuilder | StaticYoutubeFieldBuilder)
      .withWidth(field.width ?? null)
      .withHeight(field.height ?? null);
  }
  const value = field.defaultValue;
  if (value.kind !== 'none') {
    if (value.kind !== descriptor.defaultKind)
      throw new LocalizedError(message('errors.default.wrongKind', { type: field.type, kind: value.kind }));
    if (descriptor.options) {
      const values = value.kind === 'literals' ? value.values : value.kind === 'literal' ? [value.value] : [];
      if (values.filter((option) => !field.options.includes(option)).length > 1)
        throw new LocalizedError(message('errors.default.oneScalarChoice'));
    } else {
      switch (value.kind) {
        case 'literal':
        case 'temporal':
          (builder as FieldBuilder & { withDefaultValue(value: string): unknown }).withDefaultValue(value.value);
          break;
        case 'number':
          (builder as NumericFieldBuilder).withDefaultValue(value.value);
          break;
        case 'iri':
          // A term default carries a label beside its IRI, and only a type whose
          // values are drawn from a vocabulary has one to carry.
          if (accepts(field.type, 'controlledTermConstraints')) {
            (builder as ControlledTermFieldBuilder).withDefaultValue(
              new ControlledTermDefaultValueBuilder()
                .withTermUri(new Iri(value.iri))
                .withRdfsLabel(value.label ?? '')
                .build(),
            );
          } else {
            (builder as FieldBuilder & { withDefaultValue(value: Iri): unknown }).withDefaultValue(new Iri(value.iri));
          }
          break;
      }
    }
  }

  const built = builder.build();
  if (field.artifact) applyArtifactMetadata(built, field.artifact);
  built.language = Language.forValue(field.language || null);
  if (field.annotations?.length) {
    const error = annotationError(field.annotations);
    if (error) throw new LocalizedError(error);
    const annotations = new Annotations();
    for (const annotation of field.annotations) {
      annotations.add(
        annotation.kind === 'iri'
          ? new AnnotationAtId(annotation.name, annotation.value)
          : new AnnotationAtValue(annotation.name, annotation.value),
      );
    }
    built.annotations = annotations;
  }
  return built;
}

/**
 * Validate before changing state; model builders may reject intermediate defaults.
 *
 * The message is rendered through `t`, which is English unless the caller supplies the
 * designer's language.
 */
export function defaultValueError(field: Field, value: FieldDefaultValue, t: Translate = english): string | null {
  const failure = defaultValueFailure(field, value);
  return failure === null ? null : describeError(failure, t);
}

/** The diagnostic stays structured until the presentation boundary renders it. */
export function defaultValueFailure(field: Field, value: FieldDefaultValue): unknown | null {
  try {
    const formatError = defaultFormatError(field, value, (key) => key);
    if (formatError) return new LocalizedError(message(formatError));
    if (allowsOptions(field.type)) {
      const values = value.kind === 'literal' ? [value.value] : value.kind === 'literals' ? value.values : [];
      if (values.some((option) => !field.options.includes(option)))
        return new LocalizedError(message('errors.default.notAnOption'));
    }
    buildField({ ...field, defaultValue: value, importedChoiceDefault: undefined });
    return null;
  } catch (error) {
    return error;
  }
}

/**
 * A field, or a failure that says which field.
 *
 * Every validation message `buildField` throws is written for an author looking at
 * one card, where the field is the one in front of them. Saving a whole template
 * raises the same message with nothing to attach it to: "The existing default does
 * not satisfy these text constraints. Edit or clear it first." names no field, and a
 * template holding nineteen of them gives an author nowhere to start. One real
 * artifact in the corpus fails exactly this way.
 *
 * Only the whole-template path wraps. `defaultValueError` deliberately does not, since
 * it reports inline on the card being edited and the name would be noise there.
 */
export function buildFieldNaming(field: Field): TemplateField {
  try {
    return buildField(field);
  } catch (error) {
    const name = field.name.trim() || message('common.anUnnamedField');
    throw new LocalizedError(message('errors.namedField', { name, message: errorParam(error) }), { cause: error });
  }
}

/** A standalone field artifact, written by the same path used for template children. */
export function fieldToJson(field: Field): JsonNode {
  const built = buildField(field);
  return CedarWriters.json().getStrict().getFieldWriterForField(built).getAsJsonNode(built);
}

/**
 * The same artifact with an empty description, for a surface that shows a field's control but not
 * its help text. The description is cleared on the built field, so a published definition loses it
 * too. The designer's own state is untouched, because every build is a fresh copy.
 */
export function undescribedFieldToJson(field: Field): JsonNode {
  const built = buildField(field);
  built.schema_description = '';
  return CedarWriters.json().getStrict().getFieldWriterForField(built).getAsJsonNode(built);
}

export function fieldArtifactMetadata(field: Field): ArtifactMetadata {
  return field.artifact ?? artifactMetadataOf(buildField(field));
}

/** Imported conflicts stay visible even when default editing is hidden in preferences. */
export function choiceDefaultConflict(field: Field, t: Translate = english): string | null {
  if (!allowsOptions(field.type)) return null;
  const values =
    field.defaultValue.kind === 'literal'
      ? [field.defaultValue.value]
      : field.defaultValue.kind === 'literals'
        ? field.defaultValue.values
        : [];
  const all = [
    ...new Set([...values, ...(field.importedChoiceDefault === undefined ? [] : [field.importedChoiceDefault])]),
  ];
  const missing = all.filter((value) => !field.options.includes(value));
  if (missing.length)
    return t('errors.default.missingOptions', {
      values: missing.map((value) => t('common.quoted', { value })).join(', '),
    });
  if (field.importedChoiceDefault !== undefined && values.length && !values.includes(field.importedChoiceDefault))
    return t('errors.default.importedConflict', { value: field.importedChoiceDefault });
  return null;
}
