import { LocalizedError } from '../../i18n/messages';

/** Editing compares rule identity, never a sentence rendered for the author. */
export interface ValidationRule {
  code: string;
  parameters?: unknown;
}

export function failureRule(error: unknown, context: unknown): ValidationRule {
  if (error instanceof LocalizedError) {
    if (error.text.key === 'errors.namedField' && error.cause) return failureRule(error.cause, context);
    return { code: error.text.key, parameters: error.text.params };
  }
  // The external model does not give every failure a rule code. Identify the probe
  // and its inputs instead of treating its English exception text as an API.
  return { code: `model.${error instanceof Error ? error.name : typeof error}`, parameters: context };
}

export function sameRule(a: ValidationRule, b: ValidationRule): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    return value;
  };
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
