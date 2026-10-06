import {
  CedarBuilders,
  CedarFieldType,
  CheckboxFieldBuilder,
  MultipleChoiceListFieldBuilder,
  NumberType,
  RadioFieldBuilder,
  SingleChoiceListFieldBuilder,
  TemporalGranularity,
} from 'cedar-model-typescript-library';
import type { FieldBuilder } from './types';
import { FieldDefaultValue } from '../../models/types';

/**
 * Every field type the designer offers, and what CEDAR makes of it.
 *
 * One descriptor per type, rather than a builder map beside a reverse map that
 * had to be kept in step by hand. `deployment` is the part that is not
 * decoration: a field's deployment builder differs by type, and a static field's
 * does not extend the dynamic one at all, so asking a page break to be required
 * is not a setting that gets ignored — it is a call to a method that is not
 * there. Building an image field threw for exactly that reason.
 *
 * `content` names the one extra value a static field carries: the markup of a
 * rich text block, the URL of an image, the id of a video.
 */
type DeploymentKind = 'plain' | 'alwaysSingle' | 'alwaysMultiple' | 'static';

/**
 * A parameter one kind of field accepts and others do not.
 *
 * Named for what an author sets, not for the method that records it, because the
 * two do not correspond one to one: a numeric field's bounds are two setters and
 * a temporal field's precision is a datatype plus a granularity. The setters each
 * one requires are named by `PARAMETER_SETTERS`, which is what lets a test ask the
 * model library whether a type really accepts what its descriptor claims.
 *
 * The parameters every field carries are not here. A name, a description, an
 * identifier, a status and the provenance stamps belong to the artifact rather
 * than to one kind of field, and the descriptor would say the same thing about
 * every type.
 */
export type FieldParameter =
  | 'textLength'
  | 'textPattern'
  | 'numericBounds'
  | 'numericPrecision'
  | 'numericType'
  | 'numericUnit'
  | 'temporalPrecision'
  | 'temporalTimezone'
  | 'temporalTimeFormat'
  | 'mediaDimensions'
  | 'controlledTermConstraints';

/**
 * The model library setters each parameter is written through, all of which a
 * type's builder must have for the descriptor's claim to hold.
 */
export const PARAMETER_SETTERS: Record<FieldParameter, readonly string[]> = {
  textLength: ['withMinLength', 'withMaxLength'],
  textPattern: ['withRegex'],
  numericBounds: ['withMinValue', 'withMaxValue'],
  numericPrecision: ['withDecimalPlaces'],
  numericType: ['withNumberType'],
  numericUnit: ['withUnitOfMeasure'],
  temporalPrecision: ['withTemporalType', 'withTemporalGranularity'],
  temporalTimezone: ['withTimezoneEnabled'],
  temporalTimeFormat: ['withInputTimeFormat'],
  mediaDimensions: ['withWidth', 'withHeight'],
  controlledTermConstraints: ['addOntology', 'addBranch', 'addClass', 'addValueSet'],
};

interface FieldDescriptor {
  readonly cedarType: CedarFieldType;
  readonly build: () => FieldBuilder;
  readonly deployment: DeploymentKind;
  /** Whether the type takes the author's list of options. */
  readonly options?: (builder: FieldBuilder, label: string, selected: boolean) => unknown;
  readonly defaultKind?: FieldDefaultValue['kind'];
  /** The parameters this type accepts beyond those every field carries. */
  readonly parameters?: readonly FieldParameter[];
  /**
   * Set where the type carries no `_valueConstraints` and `deployment` does not
   * already say so.
   *
   * A static field has none, which `deployment: 'static'` states. An
   * attribute-value field is the one dynamic type with none: CEDAR's meta-schema
   * gives `attributeValueTemplateField.json` no `_valueConstraints` property at
   * all, so the field has nowhere to record a requirement.
   */
  readonly valueConstraints?: false;
  /** What the type's single static value is for, where it has one. */
  readonly content?: 'markup' | 'url' | 'videoId';
}

export const FIELD_DESCRIPTORS: Record<string, FieldDescriptor> = {
  text: {
    defaultKind: 'literal',
    cedarType: CedarFieldType.TEXT,
    build: () => CedarBuilders.textFieldBuilder(),
    deployment: 'plain',
    parameters: ['textLength', 'textPattern'],
  },
  paragraph: {
    defaultKind: 'literal',
    cedarType: CedarFieldType.TEXTAREA,
    build: () => CedarBuilders.textAreaBuilder(),
    deployment: 'plain',
    parameters: ['textLength'],
  },
  multipleChoice: {
    defaultKind: 'literal',
    cedarType: CedarFieldType.RADIO,
    build: () => CedarBuilders.radioFieldBuilder(),
    deployment: 'alwaysSingle',
    options: (builder, label, selected) => (builder as RadioFieldBuilder).addRadioOption(label, selected),
  },
  checkboxes: {
    defaultKind: 'literals',
    cedarType: CedarFieldType.CHECKBOX,
    build: () => CedarBuilders.checkboxFieldBuilder(),
    deployment: 'alwaysMultiple',
    options: (builder, label, selected) => (builder as CheckboxFieldBuilder).addCheckboxOption(label, selected),
  },
  singleChoiceList: {
    defaultKind: 'literal',
    cedarType: CedarFieldType.SINGLE_SELECT_LIST,
    build: () => CedarBuilders.singleChoiceListFieldBuilder(),
    deployment: 'plain',
    options: (builder, label, selected) => (builder as SingleChoiceListFieldBuilder).addListOption(label, selected),
  },
  multipleChoiceList: {
    defaultKind: 'literals',
    cedarType: CedarFieldType.MULTIPLE_SELECT_LIST,
    build: () => CedarBuilders.multipleChoiceListFieldBuilder(),
    deployment: 'alwaysMultiple',
    options: (builder, label, selected) => (builder as MultipleChoiceListFieldBuilder).addListOption(label, selected),
  },
  date: {
    defaultKind: 'temporal',
    cedarType: CedarFieldType.TEMPORAL,
    build: () => CedarBuilders.temporalFieldBuilder(),
    deployment: 'plain',
    parameters: ['temporalPrecision', 'temporalTimezone', 'temporalTimeFormat'],
  },
  time: {
    defaultKind: 'temporal',
    cedarType: CedarFieldType.TEMPORAL,
    build: () => CedarBuilders.temporalFieldBuilder(),
    deployment: 'plain',
    parameters: ['temporalPrecision', 'temporalTimezone', 'temporalTimeFormat'],
  },
  email: {
    defaultKind: 'literal',
    cedarType: CedarFieldType.EMAIL,
    build: () => CedarBuilders.emailFieldBuilder(),
    deployment: 'plain',
  },
  link: {
    defaultKind: 'iri',
    cedarType: CedarFieldType.LINK,
    build: () => CedarBuilders.linkFieldBuilder(),
    deployment: 'plain',
  },
  phone: {
    defaultKind: 'literal',
    cedarType: CedarFieldType.PHONE_NUMBER,
    build: () => CedarBuilders.phoneNumberFieldBuilder(),
    deployment: 'plain',
  },
  number: {
    defaultKind: 'number',
    cedarType: CedarFieldType.NUMERIC,
    build: () => CedarBuilders.numericFieldBuilder(),
    deployment: 'plain',
    parameters: ['numericBounds', 'numericPrecision', 'numericType', 'numericUnit'],
  },
  controlledTerms: {
    defaultKind: 'iri',
    cedarType: CedarFieldType.CONTROLLED_TERM,
    build: () => CedarBuilders.controlledTermFieldBuilder(),
    deployment: 'plain',
    parameters: ['controlledTermConstraints'],
  },
  attributeValue: {
    cedarType: CedarFieldType.ATTRIBUTE_VALUE,
    build: () => CedarBuilders.attributeValueFieldBuilder(),
    deployment: 'alwaysMultiple',
    valueConstraints: false,
  },

  // The external authorities, which differ from one another only in which
  // register they resolve an identifier against.
  orcid: {
    defaultKind: 'iri',
    cedarType: CedarFieldType.EXT_ORCID,
    build: () => CedarBuilders.extOrcidFieldBuilder(),
    deployment: 'plain',
  },
  ror: {
    defaultKind: 'iri',
    cedarType: CedarFieldType.EXT_ROR,
    build: () => CedarBuilders.extRorFieldBuilder(),
    deployment: 'plain',
  },
  pfas: {
    defaultKind: 'iri',
    cedarType: CedarFieldType.EXT_PFAS,
    build: () => CedarBuilders.extPfasFieldBuilder(),
    deployment: 'plain',
  },
  rrid: {
    defaultKind: 'iri',
    cedarType: CedarFieldType.EXT_RRID,
    build: () => CedarBuilders.extRridFieldBuilder(),
    deployment: 'plain',
  },
  pubmed: {
    defaultKind: 'iri',
    cedarType: CedarFieldType.EXT_PUBMED,
    build: () => CedarBuilders.extPubmedFieldBuilder(),
    deployment: 'plain',
  },
  nihGrantId: {
    defaultKind: 'iri',
    cedarType: CedarFieldType.EXT_NIH_GRANT_ID,
    build: () => CedarBuilders.extNihGrantIdFieldBuilder(),
    deployment: 'plain',
  },
  doi: {
    defaultKind: 'iri',
    cedarType: CedarFieldType.EXT_DOI,
    build: () => CedarBuilders.extDoiFieldBuilder(),
    deployment: 'plain',
  },

  // The static types, which show something rather than collect it.
  image: {
    cedarType: CedarFieldType.STATIC_IMAGE,
    build: () => CedarBuilders.imageFieldBuilder(),
    deployment: 'static',
    content: 'url',
    parameters: ['mediaDimensions'],
  },
  richText: {
    cedarType: CedarFieldType.STATIC_RICH_TEXT,
    build: () => CedarBuilders.richTextFieldBuilder(),
    deployment: 'static',
    content: 'markup',
  },
  youtube: {
    cedarType: CedarFieldType.STATIC_YOUTUBE,
    build: () => CedarBuilders.youtubeFieldBuilder(),
    deployment: 'static',
    content: 'videoId',
    parameters: ['mediaDimensions'],
  },
  sectionBreak: {
    cedarType: CedarFieldType.STATIC_SECTION_BREAK,
    build: () => CedarBuilders.sectionBreakFieldBuilder(),
    deployment: 'static',
  },
  pageBreak: {
    cedarType: CedarFieldType.STATIC_PAGE_BREAK,
    build: () => CedarBuilders.pageBreakFieldBuilder(),
    deployment: 'static',
  },
};

/** The descriptor for a palette type, falling back to text for one we do not know. */
export function descriptorOf(paletteType: string): FieldDescriptor {
  return FIELD_DESCRIPTORS[paletteType] ?? FIELD_DESCRIPTORS['text'];
}

/** Static blocks and attribute-value fields have no default in the model. */
export function allowsDefault(paletteType: string): boolean {
  return descriptorOf(paletteType).defaultKind !== undefined;
}

/**
 * Whether a type accepts a parameter, asked of the descriptor rather than of the
 * type's name.
 *
 * The settings panel and the writer both used to test the name — `type === 'text'`
 * for length and pattern, `'date' || 'time'` for precision, `'image' || 'youtube'`
 * for dimensions. Each such chain is a second place to remember a decision the
 * descriptor already records, and they diverge in the direction that is hardest to
 * notice: a control offered for a type whose builder has no setter behind it
 * writes nothing, and the author is told nothing.
 */
export function accepts(paletteType: string, parameter: FieldParameter): boolean {
  return descriptorOf(paletteType).parameters?.includes(parameter) ?? false;
}

export function temporalGranularities(type: string) {
  const time = TemporalGranularity.valuesWithTimes();
  const choices =
    type === 'xsd:date'
      ? [TemporalGranularity.YEAR, TemporalGranularity.MONTH, TemporalGranularity.DAY]
      : type === 'xsd:time'
        ? time
        : [TemporalGranularity.DAY, ...time];
  return choices.map((choice) => choice.getValue()!);
}

export const NUMERIC_TYPES = NumberType.values().map((type) => type.getValue()!);

/**
 * Whether a type's author can mark it required or recommended.
 *
 * CEDAR records a requirement in the field's own `_valueConstraints`, so a type
 * that has none cannot carry one. Static fields are one such kind and an
 * attribute-value field is the other, which is why this asks the descriptor
 * rather than asking whether the field is static — the production designer's own
 * table draws the same two distinctions separately, and declares
 * `allowsRequired: false` for `attribute-value` while calling it non-static.
 *
 * The requirement offered on an attribute-value field was not simply ignored,
 * which is what made it worth removing rather than leaving. The JSON writer omitted
 * the whole constraints node for that type, so a requirement set in the card
 * vanished. The YAML writer recorded `required: true` under the child, so it
 * survived, and the same template said different things depending on which format
 * it was saved in. Both model libraries now decline the requirement in either
 * format, so the control would set nothing at all.
 *
 * This decides what an author may set, not what the designer preserves: a status
 * read from a template is still written back.
 */
export function allowsStatus(paletteType: string): boolean {
  const descriptor = descriptorOf(paletteType);
  return descriptor.deployment !== 'static' && descriptor.valueConstraints !== false;
}

/**
 * Whether a type's author chooses how many values it takes.
 *
 * A radio is single by its type and a checkbox multiple by its, so for those the
 * question is already answered and the control would be a lie.
 */
export function allowsMultiple(paletteType: string): boolean {
  return descriptorOf(paletteType).deployment === 'plain';
}

/** Whether a type carries a list of options its author writes. */
export function allowsOptions(paletteType: string): boolean {
  return descriptorOf(paletteType).options !== undefined;
}

/** What a type's static content is, where it has any. */
export function contentKindOf(paletteType: string): 'markup' | 'url' | 'videoId' | undefined {
  return descriptorOf(paletteType).content;
}
