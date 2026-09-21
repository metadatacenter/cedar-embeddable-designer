/** Reject bundles whose source, installed CEDAR libraries, build output or bytes changed. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { MANIFEST, OUT as BUNDLE } from './make-bundle.mjs';
import { ROOT, resolveBuildOutput } from './build-output.mjs';

import { verifyProvenance } from './build-provenance.mjs';

const die = (message) => {
  console.error(`\n  bundle-fresh: ${message}\n`);
  process.exit(1);
};

if (!existsSync(BUNDLE)) {
  die('dist-bundle/cedar-embeddable-designer.js is missing. Run: npm run dist');
}

if (!existsSync(MANIFEST)) die('Bundle provenance is missing. Run: npm run dist');
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
try {
  verifyProvenance(manifest.provenance);
} catch (error) {
  die(error.message);
}
const output = resolveBuildOutput();

/*
 * Timestamps stop being enough once the builder's output can change shape. A
 * renamed or newly split chunk leaves the bundle older than nothing in
 * particular, so it would pass the check above and then be tested for the rest of
 * an upgrade — the same false green, arrived at differently.
 */
const current = output.inputs.map((input) => relative(ROOT, input.path));
if (JSON.stringify(manifest.inputs) !== JSON.stringify(current)) {
  die(
    'the build output no longer matches the files the bundle was made from.\n' +
      `  bundle: ${manifest.inputs.join(', ')}\n` +
      `  build:  ${current.join(', ')}\n` +
      '  Run: npm run dist',
  );
}

const digest = createHash('sha256').update(readFileSync(BUNDLE)).digest('hex');
if (manifest.sha256 !== digest) {
  die('dist-bundle/cedar-embeddable-designer.js has changed since it was built. Run: npm run dist');
}

console.log(`  bundle-fresh: ${manifest.sha256.slice(0, 12)}… matches the build.`);
