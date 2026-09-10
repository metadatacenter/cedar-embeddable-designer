/** Missing stored status stays explicit; callers supply Draft only for new artifacts. */
export function publicationStatusLabel(status: string | null | undefined): string {
  return status === 'bibo:published' ? 'Published' : status === 'bibo:draft' ? 'Draft' : 'No publication status';
}
