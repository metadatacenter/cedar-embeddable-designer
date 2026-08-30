/**
 * Refuse to test a bundle that is not the code.
 *
 * `test:browser:prebuilt` serves `dist-bundle/`, which `npm run bundle` writes
 * from the build output. Building alone does not update it, and neither does
 * editing a source file. The gap is invisible exactly when it matters: the suite
 * runs, passes, and reports green against the previous bundle — a fix declared
 * broken, or a break declared fixed, on the strength of a run that never saw it.
 *
 * Until now this repository enforced it in prose. The runbook said to rebuild
 * first, which is a check that only works on someone who reads it and then
 * remembers.
 *
 * A checkout that has never built is not the failure this guards against: the
 * bundle is all the suite needs, and testing a distribution someone handed you is
 * a legitimate thing to do. What it refuses is a bundle contradicted by a build
 * sitting next to it.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { MANIFEST, OUT as BUNDLE } from './make-bundle.mjs';
import { ROOT, newestInput, resolveBuildOutput } from './build-output.mjs';

const die = (message) => {
  console.error(`\n  bundle-fresh: ${message}\n`);
  process.exit(1);
};

if (!existsSync(BUNDLE)) {
  die('dist-bundle/cedar-embeddable-designer.js is missing. Run: npm run dist');
}

let output;
try {
  output = resolveBuildOutput();
} catch {
  console.log('  bundle-fresh: no build to compare against; testing the bundle as it stands.');
  process.exit(0);
}

const bundledAt = statSync(BUNDLE).mtimeMs;
const builtAt = newestInput();

if (builtAt > bundledAt) {
  const minutes = Math.max(1, Math.round((builtAt - bundledAt) / 60000));
  die(
    `the build output is ${minutes} minute(s) newer than the bundle.\n` +
      '  The suite serves the bundle, so this run would test the previous build.\n' +
      '  Run: npm run dist',
  );
}

if (!existsSync(MANIFEST)) {
  die('dist-bundle/bundle-manifest.json is missing, so the bundle cannot be attributed to a build. Run: npm run dist');
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

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
