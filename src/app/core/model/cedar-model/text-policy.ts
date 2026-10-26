import { TextPolicy } from 'cedar-model-typescript-library';

/** Keep shared model semantics behind the designer's model adapter. */
export const isBlank = (value: string): boolean => TextPolicy.isBlank(value);
/**
 * The name a draft hands the model's builders. They refuse a name made only of whitespace, so a draft
 * whose name is blank builds with the empty name, which the designer already reports as missing.
 */
export const builderName = (name: string | null): string | null => (name !== null && isBlank(name) ? '' : name);
export const trimInputPadding = (value: string): string => TextPolicy.trimInputPadding(value);
