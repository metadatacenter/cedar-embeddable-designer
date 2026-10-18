import { TextPolicy } from 'cedar-model-typescript-library';

/** Keep shared model semantics behind the designer's model adapter. */
export const isBlank = (value: string): boolean => TextPolicy.isBlank(value);
export const trimInputPadding = (value: string): string => TextPolicy.trimInputPadding(value);
