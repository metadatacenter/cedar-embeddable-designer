import { IdentifierPolicy, TextPolicy } from 'cedar-model-typescript-library';

export const trimIriInputPadding = (value: string): string => TextPolicy.trimInputPadding(value);

/** Identifier syntax shared with the model; resolution and membership belong to the host. */
export function validAbsoluteIri(value: string): boolean {
  return IdentifierPolicy.isValidAuthoringIri(value);
}
