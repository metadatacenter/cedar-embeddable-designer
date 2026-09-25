/**
 * The translation key of a publication status's label.
 *
 * Missing stored status has no label, so it yields the empty string; callers supply
 * Draft only for new artifacts.
 */
export function publicationStatusLabel(status: string | null | undefined): string {
  return status === 'bibo:published' ? 'common.status.published' : status === 'bibo:draft' ? 'common.status.draft' : '';
}
