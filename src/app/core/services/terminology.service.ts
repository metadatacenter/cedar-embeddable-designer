import { Injectable, signal } from '@angular/core';
import { CedConfig } from '../../ced-public-api';

/**
 * The terminology server's search route, under whatever base a host names.
 *
 * The designer's, in the way CEE's is: it is how the terminology server is
 * addressed, and a host free to move it could only move it somewhere nothing
 * answers.
 */
export const SEARCH_PATH = 'bioportal/search';

/**
 * One result, reduced to what the designer stores about a term.
 *
 * Shaped from what the endpoint actually returns, which is not what the code
 * that preceded this assumed. It read `definition` as an array and looked for
 * `ontologyAcronym` and `ontologyName`, none of which the terminology server
 * sends: a definition is a string and the ontology arrives as `source`, a URI.
 * The mistake was invisible because the hard-coded fallback results were shaped
 * like BioPortal's own API rather than like this one's, so the columns that would
 * have shown empty were filled by the mocks whenever anyone looked.
 */
export interface TerminologyHit {
  iri: string;
  prefLabel: string;
  definition?: string;
  /** The ontology or value set the term came from, as a URI. */
  source?: string;
  /** The last segment of that URI, which is the acronym an author recognises. */
  sourceAcronym?: string;
  /** What kind of thing the term is, as the server classifies it. */
  type?: string;
}

export type SearchScope = 'classes,values' | 'value_sets';

@Injectable({ providedIn: 'root' })
export class TerminologyService {
  private searchUrl: string | null = null;
  private reportedUnconfigured = false;

  /** Whether controlled-term search can run at all, for the panel to say so. */
  readonly configured = signal(false);

  configure(config: CedConfig): void {
    const base = config.terminologyBaseUrl;
    this.searchUrl = base ? `${base.endsWith('/') ? base : `${base}/`}${SEARCH_PATH}` : null;
    this.configured.set(this.searchUrl !== null);
  }

  /**
   * The terms the terminology server offers for what the author typed.
   *
   * Throws on a failure rather than returning something. This used to answer a
   * network failure with hard-coded results carrying real-looking SNOMEDCT and
   * DOID identifiers — and, for a query it had no canned answer to, a term at
   * `http://example.org/term/<query>` invented on the spot. They were selectable,
   * and what an author selected went into the template. A constraint pointing at
   * a term that does not exist is worse than a search that says it failed.
   */
  async search(query: string, scope: SearchScope, sources: string[] = []): Promise<TerminologyHit[]> {
    if (this.searchUrl === null) {
      this.reportUnconfigured();
      throw new Error('Controlled-term search is not configured.');
    }

    const url = new URL(this.searchUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('scope', scope);
    url.searchParams.set('page', '1');
    url.searchParams.set('page_size', '50');
    if (sources.length > 0) {
      /*
       * `sources`, not `ontologies`. The endpoint takes a comma-separated list of
       * target ontologies and value sets under this name; `ontologies` is not a
       * parameter it has, so restricting a search to an ontology silently did
       * nothing and returned the unrestricted result set.
       */
      url.searchParams.set('sources', sources.join(','));
    }

    /*
     * No API key. `GET /bioportal/search` builds an anonymous request context, so
     * the key the designer used to demand before searching was never read — the
     * gate turned a working search off, and the 401 and 403 branches beneath it
     * were unreachable. CEE reaches the same server the same way.
     */
    const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });

    if (!response.ok) {
      throw new Error(`The terminology server answered ${response.status} ${response.statusText}.`);
    }

    const body: unknown = await response.json();
    const collection = (body as { collection?: unknown })?.collection;
    if (!Array.isArray(collection)) {
      throw new Error('The terminology server returned no results collection.');
    }
    return collection.map((item: Record<string, unknown>) => toHit(item));
  }

  /**
   * Say once that controlled-term search is off, and why.
   *
   * Once per editor, not once per keystroke: a panel left open would otherwise
   * report this on every character typed.
   */
  private reportUnconfigured(): void {
    if (this.reportedUnconfigured) {
      return;
    }
    this.reportedUnconfigured = true;
    console.error(
      'CEDAR Embeddable Designer: controlled-term search is off, because "terminologyBaseUrl" is not configured. ' +
        'Set it to the CEDAR terminology server, ending in a slash.',
    );
  }
}

/** The last path segment of a source URI, which is the ontology's acronym. */
function acronymOf(source: string | undefined): string | undefined {
  if (source === undefined) {
    return undefined;
  }
  const segments = source.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : undefined;
}

function toHit(item: Record<string, unknown>): TerminologyHit {
  /*
   * A definition arrives as a string here, but BioPortal sends an array for the
   * same field and the terminology server passes some responses through, so both
   * are accepted and the first entry of an array is taken.
   */
  const rawDefinition = item['definition'];
  const definition = Array.isArray(rawDefinition)
    ? typeof rawDefinition[0] === 'string'
      ? rawDefinition[0]
      : undefined
    : typeof rawDefinition === 'string'
      ? rawDefinition
      : undefined;
  const source = typeof item['source'] === 'string' ? item['source'] : undefined;

  return {
    iri: String(item['@id'] ?? ''),
    prefLabel: String(item['prefLabel'] ?? ''),
    definition,
    source,
    sourceAcronym: acronymOf(source),
    type: typeof item['type'] === 'string' ? item['type'] : undefined,
  };
}
