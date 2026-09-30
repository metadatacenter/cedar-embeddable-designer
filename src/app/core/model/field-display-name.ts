import { Field } from '../models/types';

/** Generated labels repeating the artifact name or key are not authored overrides. */
export function fieldDisplayOverride(field: Field): string | undefined {
  const label = field.displayLabel;
  return label && label !== field.name && label !== field.deploymentName ? label : undefined;
}

export function fieldDisplayName(field: Field): string {
  return fieldDisplayOverride(field) ?? field.preferredLabel ?? field.name;
}
