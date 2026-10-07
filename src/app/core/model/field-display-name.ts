import { Field } from '../models/types';
import { ElementNode } from './container-draft';

/*
 * A parent says how it shows each child through two maps, `_ui.propertyLabels` and
 * `_ui.propertyDescriptions`: the child's display name and display description. CEDAR's writers fill
 * both for every child, so an entry repeating the child's key or what the child says about itself
 * declares nothing. CEE and the Java library read both shapes as no override, and so does this.
 */

/** Generated labels repeating the artifact name or key are not authored overrides. */
export function fieldDisplayOverride(field: Field): string | undefined {
  const label = field.displayLabel;
  return label && label !== field.name && label !== field.deploymentName ? label : undefined;
}

export function fieldDisplayName(field: Field): string {
  return fieldDisplayOverride(field) ?? field.preferredLabel ?? field.name;
}

/** A parent description repeating the field's own description or its key is not an override. */
function fieldDescriptionOverride(field: Field): string | undefined {
  const description = field.displayDescription;
  return description !== undefined && description !== (field.helpText ?? '') && description !== field.deploymentName
    ? description
    : undefined;
}

/** The description a field shows in its parent: the parent's override, or the field's own. */
export function fieldDisplayDescription(field: Field): string {
  return fieldDescriptionOverride(field) ?? field.helpText ?? '';
}

/** A parent label repeating the element's name or key is CEDAR's filler, not an authored override. */
export function elementDisplayOverride(node: ElementNode): string | undefined {
  const label = node.placement.displayLabel;
  return label && label !== node.definition.name && label !== node.placement.deploymentName ? label : undefined;
}

/** The name an element placement shows: its parent's override, or the element's own name. */
export function elementDisplayName(node: ElementNode): string {
  return elementDisplayOverride(node) ?? node.definition.name;
}

/** The description an element placement shows: its parent's override, or the element's own. */
export function elementDisplayDescription(node: ElementNode): string {
  const description = node.placement.displayDescription;
  return description !== undefined &&
    description !== node.definition.description &&
    description !== node.placement.deploymentName
    ? description
    : node.definition.description;
}
