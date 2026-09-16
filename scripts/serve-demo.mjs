/** Local-only, read-only demo host. Test credentials and tokens never enter the CED bundle. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const port = 4599;
const resource = 'http://127.0.0.1:9007';
const tokenUrl = 'http://127.0.0.1:8080/realms/CEDAR/protocol/openid-connect/token';
const bundle = new URL('../dist-bundle/', import.meta.url);
let login;
let credential;
let expires = 0;
async function token() {
  if (credential && Date.now() < expires) return credential;
  if (!login)
    login = (async () => {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: 'cedar-angular-app',
          username: 'test1@test.com',
          password: 'test1',
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Local test1 login failed (${response.status}).`);
      const body = await response.json();
      credential = body.access_token;
      expires = Date.now() + Math.max(0, body.expires_in - 30) * 1000;
      return credential;
    })().finally(() => {
      login = undefined;
    });
  return login;
}
async function get(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(resource + path, {
      headers: { Authorization: `Bearer ${await token()}` },
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 401 && attempt === 0) {
      credential = undefined;
      continue;
    }
    if (!response.ok) throw new Error(`Local repository request failed (${response.status}).`);
    return response.json();
  }
}
function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}
const files = new Set([
  'index.html',
  'local-child-source.js',
  'cedar-embeddable-designer.js',
  'cedar-embeddable-editor.js',
  'cedar-embeddable-term-picker.js',
]);
createServer(async (request, response) => {
  const allowedHosts = [`localhost:${port}`, `127.0.0.1:${port}`];
  if (
    !allowedHosts.includes(request.headers.host) ||
    (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`)
  ) {
    return json(response, 403, { error: 'This demo accepts same-origin local requests only.' });
  }
  if (request.method !== 'GET') return json(response, 405, { error: 'This demo only reads the repository.' });
  const url = new URL(request.url, `http://localhost:${port}`);
  try {
    if (url.pathname === '/local-repository/search') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0) return json(response, 400, { error: 'Invalid search offset.' });
      const params = new URLSearchParams({
        q: url.searchParams.get('q') ?? '',
        resource_types: 'field,element',
        limit: '25',
        offset: String(offset),
      });
      const body = await get(`/search?${params}`);
      const rows = body.resources ?? [];
      return json(response, 200, {
        results: rows.map((row) => ({
          id: row['@id'],
          name: row['schema:name'],
          type: row.resourceType,
          createdOn: row['pav:createdOn'],
          modifiedOn: row['pav:lastUpdatedOn'],
          version: row['pav:version'],
          status:
            row['bibo:status'] === 'bibo:published'
              ? 'Published'
              : row['bibo:status'] === 'bibo:draft'
                ? 'Draft'
                : null,
        })),
        ...(offset + rows.length < body.totalCount && rows.length ? { nextCursor: String(offset + rows.length) } : {}),
      });
    }
    if (url.pathname === '/local-repository/artifact') {
      const type = url.searchParams.get('type');
      const id = url.searchParams.get('id');
      if (!['field', 'element'].includes(type) || !id)
        return json(response, 400, { error: 'Choose a field or element.' });
      const path = type === 'field' ? 'template-fields' : 'template-elements';
      return json(response, 200, await get(`/${path}/${encodeURIComponent(id)}`));
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!files.has(file)) return json(response, 404, { error: 'Not found.' });
    const body = await readFile(new URL(file, bundle));
    response.writeHead(200, {
      'Content-Type': extname(file) === '.html' ? 'text/html' : 'text/javascript',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    json(response, 502, {
      error: error.message?.startsWith('Local')
        ? error.message
        : 'Local stack is unavailable. Check Keycloak and the resource server.',
    });
  }
}).listen(port, '127.0.0.1', () => console.log(`CED demo as test1: http://localhost:${port}/`));
