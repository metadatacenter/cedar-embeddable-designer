import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './build-output.mjs';
import { PROVENANCE, sourceFingerprint, outputFingerprint } from './build-provenance.mjs';
const source = sourceFingerprint();
const result = spawnSync(
  process.execPath,
  [join(ROOT, 'node_modules/@angular/cli/bin/ng.js'), 'build', ...process.argv.slice(2)],
  { cwd: ROOT, stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (source !== sourceFingerprint())
  throw new Error('Build inputs changed while Angular was building. Rebuild before bundling.');
writeFileSync(PROVENANCE, JSON.stringify({ source, output: outputFingerprint() }, null, 2) + '\n');
