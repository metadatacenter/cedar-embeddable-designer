import { Field } from '../models/types';
import { ElementNode } from './container-draft';

/** Generated labels repeating the artifact name or key are not authored overrides. */
export function fieldDisplayOverride(field: Field): string | undefined {
  const label = field.displayLabel;
  return label && label !== field.name && label !== field.deploymentName ? label : undefined;
}

export function fieldDisplayName(field: Field): string {
  return fieldDisplayOverride(field) ?? field.preferredLabel ?? field.name;
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
