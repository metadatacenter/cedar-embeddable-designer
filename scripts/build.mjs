import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DIST, HOST_FONTS_DIST, ROOT } from './build-output.mjs';
import { provenanceFile, sourceFingerprint, outputFingerprint } from './build-provenance.mjs';

// With no arguments both production bundles are built: the self-contained one, and the one for a
// host that registers the fonts itself. Arguments select a single build into the default output.
const builds =
  process.argv.length > 2
    ? [{ args: process.argv.slice(2), dist: DEFAULT_DIST }]
    : [
        { args: [], dist: DEFAULT_DIST },
        { args: ['--configuration=production,host-fonts'], dist: HOST_FONTS_DIST },
      ];

const source = sourceFingerprint();
for (const { args, dist } of builds) {
  const result = spawnSync(process.execPath, [join(ROOT, 'node_modules/@angular/cli/bin/ng.js'), 'build', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (source !== sourceFingerprint())
    throw new Error('Build inputs changed while Angular was building. Rebuild before bundling.');
  writeFileSync(provenanceFile(dist), JSON.stringify({ source, output: outputFingerprint(dist) }, null, 2) + '\n');
}
