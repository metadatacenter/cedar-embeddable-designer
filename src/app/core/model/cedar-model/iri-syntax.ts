import { IriSyntax } from 'cedar-model-typescript-library';

/**
 * Syntax only: identifier resolution and vocabulary membership belong to the host.
 *
 * An author's IRI has to be absolute, and it has to be one the model library's readers take. A
 * check of the designer's own accepted some the readers refuse, a second fragment delimiter among
 * them, so an author could save a template that nothing could then open.
 */
export function validAbsoluteIri(value: string): boolean {
  if (
    !/^[a-z][a-z0-9+.-]*:.+$/i.test(value) ||
    /[\s<>"{}|\\^`\p{Cc}\p{Cs}]/u.test(value) ||
    /%(?![\da-f]{2})/i.test(value) ||
    !IriSyntax.isValid(value)
  )
    return false;
  try {
    const parsed = new URL(value);
    return !/^https?:/i.test(value) || (/^https?:\/\//i.test(value) && !!parsed.hostname);
  } catch {
    return false;
  }
}
