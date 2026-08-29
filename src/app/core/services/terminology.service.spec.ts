import { TestBed } from '@angular/core/testing';
import { SEARCH_PATH, TerminologyService } from './terminology.service';

/**
 * Controlled-term search, and the two things it must never do again.
 *
 * It must not invent results: a network failure used to produce hard-coded terms
 * carrying real-looking SNOMEDCT and DOID identifiers, plus a term minted at
 * `http://example.org/term/<query>` for anything it had no canned answer to. They
 * were selectable, and a selected term went into the template.
 *
 * And it must not name a server of its own: the endpoint was hardcoded to the
 * production terminology server, which an embedder reached without asking.
 */
describe('TerminologyService', () => {
  let service: TerminologyService;
  let calls: string[];

  beforeEach(() => {
    calls = [];
    TestBed.configureTestingModule({});
    service = TestBed.inject(TerminologyService);
  });

  /** A fetch that records the URL it was given and answers with `body`. */
  function respondWith(body: unknown, ok = true, status = 200): void {
    globalThis.fetch = ((input: string | URL) => {
      calls.push(String(input));
      return Promise.resolve({
        ok,
        status,
        statusText: ok ? 'OK' : 'Server Error',
        json: () => Promise.resolve(body),
      } as Response);
    }) as typeof fetch;
  }

  describe('when no terminology server is configured', () => {
    it('refuses to search rather than answering with something', async () => {
      respondWith({ collection: [] });

      await expect(service.search('cancer', 'classes,values')).rejects.toThrow(/not configured/);
      expect(calls).toEqual([]);
    });

    it('reports that search is off', () => {
      expect(service.configured()).toBe(false);
    });
  });

  describe('when a terminology server is configured', () => {
    beforeEach(() => {
      service.configure({ terminologyBaseUrl: 'https://terminology.example.org/' });
    });

    it('reports that search is on', () => {
      expect(service.configured()).toBe(true);
    });

    it('asks the server the host named', async () => {
      respondWith({ collection: [] });
      await service.search('cancer', 'classes,values');

      expect(calls[0].startsWith(`https://terminology.example.org/${SEARCH_PATH}?`)).toBe(true);
    });

    it('supplies a missing trailing slash on the base', async () => {
      service = TestBed.inject(TerminologyService);
      service.configure({ terminologyBaseUrl: 'https://terminology.example.org' });
      respondWith({ collection: [] });
      await service.search('cancer', 'classes,values');

      expect(calls[0].startsWith(`https://terminology.example.org/${SEARCH_PATH}?`)).toBe(true);
    });

    it('restricts to ontologies with the parameter the endpoint has', async () => {
      respondWith({ collection: [] });
      await service.search('cancer', 'classes,values', ['DOID', 'NCIT']);

      // `sources`, not `ontologies`. The endpoint has no `ontologies` parameter,
      // so the restriction was silently dropped and every search was unrestricted.
      const url = new URL(calls[0]);
      expect(url.searchParams.get('sources')).toBe('DOID,NCIT');
      expect(url.searchParams.has('ontologies')).toBe(false);
    });

    it('omits the restriction when no ontologies are named', async () => {
      respondWith({ collection: [] });
      await service.search('cancer', 'classes,values');

      expect(new URL(calls[0]).searchParams.has('sources')).toBe(false);
    });

    it('sends no API key, because the endpoint is anonymous', async () => {
      let headers: Record<string, string> = {};
      globalThis.fetch = ((input: string | URL, init?: RequestInit) => {
        calls.push(String(input));
        headers = (init?.headers ?? {}) as Record<string, string>;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ collection: [] }) } as Response);
      }) as typeof fetch;

      await service.search('cancer', 'classes,values');

      expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain('authorization');
    });

    /*
     * The record below is a real response from the CEDAR terminology server,
     * abbreviated. The shape matters: the code this replaces read `definition` as
     * an array and looked for `ontologyAcronym` and `ontologyName`, which this
     * endpoint does not send, so the ontology column was empty for every genuine
     * result. Nobody noticed, because the hard-coded fallback results were shaped
     * like BioPortal's own API and filled those columns whenever the search failed.
     */
    it('returns the terms the server offered', async () => {
      respondWith({
        collection: [
          {
            '@id': 'http://purl.obolibrary.org/obo/DOID_162',
            prefLabel: 'cancer',
            definition: 'A disease of cellular proliferation that is malignant and primary.',
            source: 'https://data.bioontology.org/ontologies/DOID',
            type: 'OntologyClass',
          },
        ],
      });

      await expect(service.search('cancer', 'classes,values')).resolves.toEqual([
        {
          iri: 'http://purl.obolibrary.org/obo/DOID_162',
          prefLabel: 'cancer',
          definition: 'A disease of cellular proliferation that is malignant and primary.',
          source: 'https://data.bioontology.org/ontologies/DOID',
          sourceAcronym: 'DOID',
          type: 'OntologyClass',
        },
      ]);
    });

    it('takes the first entry when a definition arrives as an array', async () => {
      respondWith({ collection: [{ '@id': 'urn:x', prefLabel: 'x', definition: ['first', 'second'] }] });
      const [hit] = await service.search('x', 'classes,values');

      expect(hit.definition).toBe('first');
    });

    it('leaves the source out when the server names none', async () => {
      respondWith({ collection: [{ '@id': 'urn:x', prefLabel: 'x' }] });
      const [hit] = await service.search('x', 'classes,values');

      expect(hit.source).toBeUndefined();
      expect(hit.sourceAcronym).toBeUndefined();
    });

    it('reports a refused request rather than inventing terms', async () => {
      respondWith({}, false, 503);

      await expect(service.search('cancer', 'classes,values')).rejects.toThrow(/503/);
    });

    it('reports an unreachable server rather than inventing terms', async () => {
      globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;

      await expect(service.search('cancer', 'classes,values')).rejects.toThrow();
    });

    it('reports a response with no collection rather than inventing terms', async () => {
      respondWith({ errors: ['nope'] });

      await expect(service.search('cancer', 'classes,values')).rejects.toThrow(/no results collection/);
    });
  });
});
