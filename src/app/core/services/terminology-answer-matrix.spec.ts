import { TestBed } from '@angular/core/testing';
import { CeeTemplateObject } from '../model/cee-preview';
import { CedLanguage, describeError, translateIn } from '../../i18n/messages';
import { TerminologyService } from './terminology.service';

/**
 * Both of the designer's terminology requests, against every way the server can fail to answer
 * them, in both languages. What the author reads is the designer's own text in the language it
 * speaks, never the browser's "Failed to fetch" or the parser's complaint about a token.
 */
type Call = 'membership check' | 'search';
const CALLS: Record<Call, (service: TerminologyService) => Promise<unknown>> = {
  'membership check': (service) =>
    service.allowsDefault(
      { _valueConstraints: { ontologies: [] } } as unknown as CeeTemplateObject,
      'https://example.org/term',
      'term',
    ),
  search: (service) => service.search('term', 'classes,values'),
};

type Answer = () => Promise<Response>;
const ANSWERS: Record<string, { answer: Answer; key: (call: Call) => [string, Record<string, string>?] }> = {
  'no answer': {
    answer: () => Promise.reject(new TypeError('Failed to fetch')),
    key: () => ['terminology.unreachable'],
  },
  'a 400': {
    answer: () => Promise.resolve(new Response('{}', { status: 400, statusText: 'Bad Request' })),
    key: (call) =>
      call === 'search'
        ? ['terminology.answered', { status: '400', statusText: 'Bad Request' }]
        : ['terminology.checkFailed', { status: '400' }],
  },
  'a 503': {
    answer: () => Promise.resolve(new Response('', { status: 503, statusText: 'Service Unavailable' })),
    key: (call) =>
      call === 'search'
        ? ['terminology.answered', { status: '503', statusText: 'Service Unavailable' }]
        : ['terminology.checkFailed', { status: '503' }],
  },
  'a 200 that is not JSON': {
    answer: () => Promise.resolve(new Response('<html>Sign in</html>', { status: 200 })),
    key: () => ['terminology.unreadable'],
  },
  'JSON without a collection': {
    answer: () => Promise.resolve(new Response('{"page":1}', { status: 200 })),
    key: (call) => [call === 'search' ? 'terminology.noResultsCollection' : 'terminology.noResultCollection'],
  },
};

describe('The terminology server failing a designer request', () => {
  const original = globalThis.fetch;
  afterEach(() => (globalThis.fetch = original));

  for (const language of ['en', 'hu'] as CedLanguage[])
    for (const [call, run] of Object.entries(CALLS) as [Call, (typeof CALLS)[Call]][])
      for (const [name, { answer, key }] of Object.entries(ANSWERS))
        it(`${call} meets ${name}, in ${language}`, async () => {
          TestBed.configureTestingModule({});
          const service = TestBed.inject(TerminologyService);
          service.configure({ terminologyBaseUrl: 'https://terminology.example/' });
          globalThis.fetch = (() => answer()) as typeof fetch;
          const failure = await run(service).then(
            () => null,
            (error: unknown) => error,
          );
          expect(failure).not.toBeNull();
          const [expectedKey, params] = key(call);
          const shown = describeError(failure, (k, p) => translateIn(language, k, p));
          expect(shown).toBe(translateIn(language, expectedKey, params));
          expect(shown).not.toMatch(/Failed to fetch|Unexpected token|JSON/);
        });
});
