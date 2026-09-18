/**
 * A static server for the distribution, and the host pages that embed it.
 *
 * The tests drive what ships rather than what `ng serve` assembles, because the
 * two differ in exactly the ways that have broken this component: a bundle that
 * requests an asset the package does not carry, an element that registers only as
 * a side effect of bootstrapping an application, styles that live in the document
 * head instead of the shadow root. None of those are visible to the dev server.
 *
 * Hand-written rather than a dependency, because thirty lines that serve two
 * directories are cheaper to keep than a package to audit.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUNDLE = fileURLToPath(new URL('../dist-bundle/', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  const file = path === '/' ? 'host.html' : path.replace(/^\/+/, '');

  // Fixtures first, then the distribution, so a host page can sit beside the
  // bundle it loads without either directory being copied into the other.
  for (const root of [FIXTURES, BUNDLE]) {
    try {
      const body = await readFile(join(root, file));
      response.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        // No caching: a run straight after a rebuild must not be served the previous build.
        'Cache-Control': 'no-store',
      });
      response.end(body);
      return;
    } catch {
      /* try the next root */
    }
  }
  response.writeHead(404).end('not found');
}).listen(Number(process.env.PORT ?? 4598));
