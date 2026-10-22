import { CedarArtifactType, NumberType } from 'cedar-model-typescript-library';
import type { CedJsonValue, CedSupersededShape } from '../../../ced-public-api';
import { FieldValuePolicy, JsonSourcePolicy } from './value-policy';

/*
 * The stored keys read here. The library reads an artifact into a model that has nowhere to hold these
 * shapes, so they can be seen only in the source. The package does not export its key names, so they
 * are named once, here.
 */
const UI = '_ui';
const CONSTRAINTS = '_valueConstraints';
const ORDER = 'order';
const INPUT_TYPE = 'inputType';
const NUMERIC_INPUT = 'numeric';
const NUMBER_TYPE = 'numberType';
const DEFAULT_VALUE = 'defaultValue';
const TERM_TEXT_CONSTRAINTS = ['minLength', 'maxLength', 'regex'];

const FIELD = CedarArtifactType.TEMPLATE_FIELD.getValue();
const STATIC_FIELD = CedarArtifactType.STATIC_TEMPLATE_FIELD.getValue();
const CONTAINERS: ReadonlySet<unknown> = new Set([
  CedarArtifactType.TEMPLATE.getValue(),
  CedarArtifactType.TEMPLATE_ELEMENT.getValue(),
]);

type JsonObject = { [key: string]: unknown };
const ABSENT = Symbol('absent');
const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const step = (path: string, key: string) => `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;

/** The value a JSON Pointer names, or `ABSENT` when nothing is there. */
function at(node: unknown, location: string): unknown {
  let current = node;
  for (const part of location.split('/').slice(1)) {
    const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!isObject(current) || !Object.hasOwn(current, key)) return ABSENT;
    current = current[key];
  }
  return current;
}

const same = (stored: unknown, projected: unknown) =>
  stored === projected ||
  (stored !== ABSENT &&
    projected !== ABSENT &&
    JsonSourcePolicy.stringify(stored) === JsonSourcePolicy.stringify(projected));

const supported = (value: unknown) => typeof value === 'string' && NumberType.forValue(value) !== NumberType.NULL;

/** Every field definition in a stored artifact, with its pointer, through elements and repeated children. */
function* fieldDefinitions(node: unknown, path: string): Generator<[string, JsonObject]> {
  if (!isObject(node)) return;
  if (isObject(node['items'])) {
    yield* fieldDefinitions(node['items'], step(path, 'items'));
    return;
  }
  if (node['@type'] === FIELD || node['@type'] === STATIC_FIELD) {
    yield [path, node];
    return;
  }
  if (!CONTAINERS.has(node['@type']) || !isObject(node['properties'])) return;
  for (const [key, child] of Object.entries(node['properties']))
    yield* fieldDefinitions(child, step(step(path, 'properties'), key));
}

/**
 * The shapes a stored artifact holds that the designer's projection of it replaced, limited to those the
 * CEDAR validator refuses. A shape is listed only where the projection disagrees with what is stored, so
 * one the designer carries through unchanged is left to the designer's ordinary validation.
 *
 * A source the designer does not read as JSON, such as YAML, supersedes nothing: no host merges it.
 */
export function supersededShapes(stored: unknown, projection: unknown): CedSupersededShape[] {
  const source =
    typeof stored === 'string' ? (stored.trimStart().startsWith('{') ? JsonSourcePolicy.parse(stored) : null) : stored;
  const shapes: CedSupersededShape[] = [];
  const supersede = (location: string, code: CedSupersededShape['code']) => {
    const replacement = at(projection, location);
    if (same(at(source, location), replacement)) return;
    shapes.push(replacement === ABSENT ? { location, code } : { location, code, value: replacement as CedJsonValue });
  };
  for (const [path, field] of fieldDefinitions(source, '')) {
    const ui = isObject(field[UI]) ? field[UI] : {};
    if (Object.hasOwn(ui, ORDER)) supersede(step(step(path, UI), ORDER), 'fieldOrder');
    if (field['@type'] !== FIELD) continue;
    const constraints = isObject(field[CONSTRAINTS]) ? field[CONSTRAINTS] : {};
    const constraint = (key: string) => step(step(path, CONSTRAINTS), key);
    if (ui[INPUT_TYPE] === NUMERIC_INPUT && !supported(constraints[NUMBER_TYPE]))
      supersede(constraint(NUMBER_TYPE), 'numberType');
    if (!FieldValuePolicy.isControlled(field as Parameters<typeof FieldValuePolicy.isControlled>[0])) continue;
    const stated = constraints[DEFAULT_VALUE];
    if (Object.hasOwn(constraints, DEFAULT_VALUE) && stated !== null && !isObject(stated))
      supersede(constraint(DEFAULT_VALUE), 'termDefault');
    for (const key of TERM_TEXT_CONSTRAINTS)
      if (Object.hasOwn(constraints, key)) supersede(constraint(key), 'termTextConstraint');
  }
  return shapes;
}
