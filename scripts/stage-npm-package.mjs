/**
 * Copy the tested bytes into `dist-npm/`, ready for `npm pack` or `npm publish`.
 *
 * Nothing here builds anything. The bundle it stages is the one the size gate
 * measured and, in CI, the one the browser check loaded — staging a freshly built
 * copy instead would publish bytes nothing had exercised.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TARGET, assertSourceBundle, expectedFiles } from './npm-package.mjs';

const { manifest, hosted } = assertSourceBundle();
mkdirSync(TARGET, { recursive: true });
for (const [name, bytes] of Object.entries(expectedFiles())) {
  writeFileSync(join(TARGET, name), bytes);
}

for (const [label, { bytes, sha256 }] of [
  ['standalone', manifest],
  ['host fonts', hosted.manifest],
]) {
  console.log(
    `  staged the ${label} bundle, ${bytes.toLocaleString('en-US')} bytes, to dist-npm/ (${sha256.slice(0, 12)}…)`,
  );
}
