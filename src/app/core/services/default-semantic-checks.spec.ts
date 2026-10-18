import { DefaultSemanticChecks } from './default-semantic-checks';
import { containerFromFlat } from '../model/container-draft';
import { Field } from '../models/types';

const field = (type: string, iri: string): Field => ({
  id: 8,
  type,
  name: 'Identifier',
  status: 'optional',
  options: [],
  allowMultiple: false,
  defaultValue: { kind: 'iri', iri, label: 'Stored label' },
});
const document = (value: Field) =>
  containerFromFlat({
    name: 'Template',
    description: '',
    identifier: 'urn:template',
    version: '0.0.1',
    fields: [value],
  });
const config = { bridgeBaseUrl: 'https://bridge.example.org/' };

describe('all-document default semantic verification', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ['unavailable', 30_000],
    ['notChecked', 30_000],
    ['passed', 300_000],
    ['failed', 300_000],
  ] as const)(
    'revalidates %s evidence on inspection after its lifetime, without restarting pending work',
    async (status, lifetime) => {
      let now = 1_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const iri = 'https://ror.org/03yrm5c26';
      const code = {
        unavailable: 'semanticUnavailable',
        notChecked: 'semanticNotChecked',
        passed: 'authorityVerified',
        failed: 'authorityMembership',
      }[status];
      const fetcher = vi.fn(async () => new Response(JSON.stringify({ iri, status, code, message: 'Checked.' })));
      vi.stubGlobal('fetch', fetcher);
      const checks = new DefaultSemanticChecks();
      const draft = document(field('ror', iri));
      checks.inspect(draft, config);
      await checks.settled();
      now += lifetime - 1;
      expect(checks.inspect(draft, config).pendingValidation).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(1);
      now++;
      expect(checks.inspect(draft, config).pendingValidation).toBe(true);
      checks.refreshExpired();
      checks.inspect(draft, config);
      expect(fetcher).toHaveBeenCalledTimes(2);
      await checks.settled();
      expect(checks.inspect(draft, config).pendingValidation).toBe(false);
      checks.dispose();
    },
  );

  it('reports imported authority defaults even when no default editor is mounted', async () => {
    const fetcher = vi.fn(
      async (_input: string | URL | Request) =>
        new Response(
          JSON.stringify({
            iri: 'https://example.org/wrong',
            status: 'failed',
            code: 'authorityIdentifier',
            message: 'Wrong authority.',
          }),
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    const checks = new DefaultSemanticChecks();
    const draft = document(field('orcid', 'https://example.org/wrong'));
    expect(checks.inspect(draft, config).pendingValidation).toBe(true);
    await checks.settled();
    expect(fetcher.mock.calls[0][0]).toBe('https://bridge.example.org/ext-auth/orcid/verify');
    expect(checks.inspect(draft, config)).toMatchObject({
      pendingValidation: false,
      issues: [{ nodeId: 8, code: 'authorityIdentifier', severity: 'error' }],
      semanticChecks: [{ status: 'failed' }],
    });
    checks.dispose();
  });

  it.each(['controlledTerms', 'orcid', 'ror', 'pfas', 'rrid', 'pubmed', 'nihGrantId', 'doi'])(
    'does not request semantic verification for a malformed %s default or duplicate its structural issue',
    async (type) => {
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      const checks = new DefaultSemanticChecks();
      const result = checks.inspect(document(field(type, 'relative/path')), {
        ...config,
        terminologyBaseUrl: 'https://terminology.example.org/',
      });
      await checks.settled();
      expect(result).toMatchObject({
        issues: [],
        pendingValidation: false,
        semanticChecks: [{ iri: 'relative/path', status: 'notChecked', code: 'semanticNotChecked', nodeId: 8 }],
      });
      expect(result.semanticChecks[0].message).toContain('well-formed absolute IRI');
      expect(fetcher).not.toHaveBeenCalled();
      checks.dispose();
    },
  );

  it('does not turn absent configuration or transport failure into success or invalid membership', async () => {
    const checks = new DefaultSemanticChecks();
    const draft = document(field('ror', 'https://ror.org/03yrm5c26'));
    expect(checks.inspect(draft, {}).semanticChecks[0].status).toBe('notChecked');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    checks.inspect(draft, config);
    await checks.settled();
    const result = checks.inspect(draft, config);
    expect(result.semanticChecks[0].status).toBe('unavailable');
    expect(result.issues[0].severity).toBe('warning');
    checks.dispose();
  });

  it('distinguishes a configured omitted membership check from an absent service configuration', async () => {
    const iri = 'https://example.org/term';
    const checks = new DefaultSemanticChecks();
    const draft = document(field('controlledTerms', iri));
    expect(checks.inspect(draft, {}).issues[0].message).toBe('Terminology server is not configured.');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              iri,
              status: 'notChecked',
              code: 'semanticNotChecked',
              message: 'No membership constraint was declared; existence was not checked.',
            }),
          ),
      ),
    );
    const terminologyConfig = { terminologyBaseUrl: 'https://terminology.example.org/' };
    checks.inspect(draft, terminologyConfig);
    await checks.settled();
    const result = checks.inspect(draft, terminologyConfig);
    expect(result.issues[0]).toMatchObject({
      code: 'semanticNotChecked',
      severity: 'warning',
      message: 'The default could not be verified with the terminology or authority service.',
    });
    expect(result.semanticChecks[0]).toMatchObject({
      status: 'notChecked',
      message: 'No membership constraint was declared; existence was not checked.',
    });
    checks.dispose();
  });

  it('discards late verification for replaced defaults', async () => {
    let complete!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      ),
    );
    const checks = new DefaultSemanticChecks();
    checks.inspect(document(field('orcid', 'https://orcid.org/0000-0001-2345-6789')), config);
    const empty = document({ ...field('orcid', 'unused'), defaultValue: { kind: 'none' } });
    expect(checks.inspect(empty, config).semanticChecks).toEqual([]);
    complete(
      new Response(
        JSON.stringify({
          iri: 'https://orcid.org/0000-0001-2345-6789',
          status: 'failed',
          code: 'authorityMembership',
          message: 'Missing.',
        }),
      ),
    );
    await Promise.resolve();
    expect(checks.inspect(empty, config).issues).toEqual([]);
    checks.dispose();
  });
});
