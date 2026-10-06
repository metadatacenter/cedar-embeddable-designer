import { AttributeValueFieldParent, ReservedNames } from './cedar-model/reserved-names';
import type { ChildNode } from './container-draft';
import { LocalizedError, Translate, english, message } from '../../i18n/messages';

/**
 * Why a child's key is unusable, rendered through `t`, or null for a usable key.
 *
 * The model library's `ReservedNames` decides which names are reserved. `parent` is the kind of
 * container the child sits in, and matters only for an attribute-value field: the YAML form writes
 * that field beside its parent's metadata, and a template carries more metadata keys than an element.
 */
export function childKeyError(
  value: string,
  attributeValue = false,
  t: Translate = english,
  parent: AttributeValueFieldParent = 'template',
): string | null {
  const key = value.trim();
  if (!key) return t('validation.key.required');
  if (['__proto__', 'prototype', 'constructor'].includes(key)) return t('validation.key.objectInternals');
  if (ReservedNames.isReservedName(key)) return t('validation.key.cedarMetadata');
  if ([...key].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    return t('validation.key.controlCharacters');
  if (attributeValue && ReservedNames.isReservedAttributeValueFieldName(key, parent))
    return t('validation.key.yamlMetadata');
  return null;
}

/**
 * A child as the key policy sees it: its name, the key it is stored under when it has one, and the
 * two facts the policy depends on, its kind and whether it is an attribute-value field.
 */
export interface KeyedChild {
  readonly name: string;
  readonly deploymentName?: string;
  readonly kind: 'field' | 'element';
  readonly attributeValue: boolean;
}

export function keyedChild(node: ChildNode): KeyedChild {
  return {
    name: node.definition.name,
    deploymentName: node.placement.deploymentName,
    kind: node.kind,
    attributeValue: node.kind === 'field' && node.definition.type === 'attributeValue',
  };
}

/** The first of `base`, `base_2`, `base_3` and so on that `usable` accepts. */
function suffixed(base: string, usable: (key: string) => boolean): string {
  let key = base;
  for (let suffix = 2; !usable(key); suffix++) key = `${base}_${suffix}`;
  return key;
}

const controlCharacter = (value: string) =>
  [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

/**
 * The key the designer chooses for a child from its name, as it does for a new, renamed or imported
 * child: lower case, spaces as underscores, and a numeric suffix past any key a sibling holds or the
 * policy refuses. Suffixing cannot repair a name that starts with @ or holds a control character, so
 * such a name falls back to the child's kind, "field" or "element". `taken` names the keys the
 * child's siblings hold; the policy is applied here, for the parent the child sits in.
 */
export function freshChildKey(
  name: string,
  child: Pick<KeyedChild, 'kind' | 'attributeValue'>,
  parent: AttributeValueFieldParent,
  taken: (key: string) => boolean,
): string {
  const candidate = name.trim().toLowerCase().replace(/\s+/g, '_');
  const base = candidate.startsWith('@') || controlCharacter(candidate) ? child.kind : candidate || child.kind;
  return suffixed(base, (key) => !taken(key) && !childKeyError(key, child.attributeValue, english, parent));
}

/**
 * The key a child holds when it has none of its own: its name as written, which is what a CEDAR
 * author sees in the artifact and what the corpus uses, when the policy accepts the name as a key,
 * and otherwise the key the designer would choose for it. Names are not unique, so a repeated name
 * takes a numeric suffix; without one, two fields called "Title" silently became one. A child read
 * from an artifact always has a key of its own; this keys a child the designer has not keyed yet,
 * and a field read on its own through a template that has to hold it.
 */
function keptChildKey(
  name: string,
  child: Pick<KeyedChild, 'kind' | 'attributeValue'>,
  parent: AttributeValueFieldParent,
  taken: (key: string) => boolean,
): string {
  const written = name.trim();
  if (!written || childKeyError(written, child.attributeValue, english, parent))
    return freshChildKey(name, child, parent, taken);
  return suffixed(written, (key) => !taken(key) && !childKeyError(key, child.attributeValue, english, parent));
}

/**
 * The key each child of a parent is stored under, in order: its own key where it has one, and
 * otherwise the key `keptChildKey` gives it, clear of every other key in the parent. A key of the
 * child's own is returned as it is, so a parent holding an unusable one still has a key for each
 * child; reporting such a key is the validator's job. `deploymentKeys` is the strict form.
 */
export function childKeys(children: readonly KeyedChild[], parent: AttributeValueFieldParent): string[] {
  const used = new Set(children.flatMap((child) => (child.deploymentName === undefined ? [] : [child.deploymentName])));
  return children.map((child) => {
    if (child.deploymentName !== undefined) return child.deploymentName;
    const key = keptChildKey(child.name, child, parent, (candidate) => used.has(candidate));
    used.add(key);
    return key;
  });
}

/** The keys `childKeys` gives, refusing a parent whose own keys are blank or repeated. */
export function deploymentKeys(children: readonly KeyedChild[], parent: AttributeValueFieldParent): string[] {
  const seen = new Set<string>();
  for (const { deploymentName } of children) {
    if (deploymentName === undefined) continue;
    if (!deploymentName.trim()) throw new LocalizedError(message('validation.key.required'));
    if (seen.has(deploymentName)) throw new LocalizedError(message('validation.key.duplicate'));
    seen.add(deploymentName);
  }
  return childKeys(children, parent);
}
