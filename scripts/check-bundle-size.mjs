/**
 * A ceiling on what an embedder downloads.
 *
 * The gate is on the shipped file rather than on Angular's intermediate output,
 * because the shipped file is what the limit is actually about. Both a raw and a
 * gzip figure, because a CDN serves the compressed one and a file: URL serves the
 * raw one, and the two do not move together.
 *
 * Baseline on 2026-08-29: 1,160,981 raw and 378,266 gzip-9 bytes, at Angular 22
 * with the CEDAR model library and CEDAR's embedded typeface.
 *
 * The ceilings were 1,100,000 and 270,000, and both were raised on the same
 * evidence: adopting CEDAR's design values means adopting its font, and Roboto at
 * three weights is 259,129 bytes of base64 in the bundle. Fetching it instead was
 * the alternative and is not one — a host page is not obliged to load anything
 * for the designer, and a component that renders in a different typeface
 * depending on whether a font request succeeded is not one typeface. CEE embeds
 * the same three weights, and `cedar-embeddable-term-picker` copied them for the same reason.
 *
 * The limits leave headroom deliberately. Raising one is a decision to be taken
 * on evidence and recorded here, not a step in making a build pass.
 *
 * `angular.json`'s `initial` budget gates the same bytes: Angular sums main.js and
 * polyfills.js, which is exactly what make-bundle.mjs concatenates. It therefore carries
 * RAW_LIMIT below as its `maximumError` and no warning band, so the two cannot disagree
 * about the same artifact. Move both together, or neither. Angular cannot gate the gzip
 * figure, which stays this script's alone.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { OUT, readManifest } from './make-bundle.mjs';

// 2026-09-15: the feature-complete authoring surface, including annotations,
// alternate and preferred labels, language, type/property picking and manual IRI
// entry, measures 1,305,786 raw / 409,663 gzip-9 bytes on the CI build. The raw
// ceiling moves with that measured feature set; retain the compressed ceiling.
// 2026-09-16: adding CEFD in the same package, sharing field controls and model,
// measures 1,357,497 raw / 423,495 gzip-9 bytes. Allow modest headroom for both
// public elements; no second framework or model bundle is shipped.
// 2026-09-18: shared states, surfaces, density, motion and overlay roles measure
// 1,390,721 raw / 429,452 gzip-9 bytes. Keep the gzip ceiling; allow 4 KB raw
// headroom for these shared recipes and their accessibility labels.
// 2026-09-19: current-sibling reactor composition with shared choice summaries,
// occurrence headings and shadow-root focus handling measures 1,396,958 raw /
// 431,352 gzip-9 bytes. Allow 8 KB raw headroom; retain the compressed ceiling.
// Current sibling reactor with container actions, move/collapse controls and shared
// handle tokens measures 1,405,040 raw bytes. Allow 5 KB for that composition;
// retain the compressed ceiling.
// 2026-09-20: editable placement keys, unnamed drafts, shared validation summaries,
// persistent tab errors and guarded header clicks measure 1,410,072 raw / 434,203
// gzip-9 bytes against current siblings. Restore 5 KB raw headroom for this
// authoring surface; retain the compressed ceiling.
// Bounded, keyboard-accessible Overview resizing and deferred name validation
// measure 1,414,603 raw / 435,422 gzip-9 bytes in the current-sibling reactor.
// Retain the raw ceiling; add 1 KB compressed capacity for these interactions.
// 2026-09-21: precision normalization, blank-option validation and accessible
// subtree deletion confirmation measure 1,415,548 raw / 436,359 gzip-9 bytes
// in the current-sibling reactor (CI gzip: 436,335). No dependency was added.
// Allow 4.5 KB raw and 1.6 KB compressed headroom for this authoring surface.
// 2026-09-22: element navigation, insertion positioning and shared confirmation
// dialogs, composed with the current shared tokens, measure 1,422,484 raw /
// 437,851 gzip-9 bytes. No dependency was added. Preserve roughly 4.5 KB of raw
// headroom; the compressed artifact remains within its existing ceiling.
const RAW_LIMIT = 1_427_000;
const GZIP_LIMIT = 438_000;

const format = (bytes) => `${bytes.toLocaleString('en-US')} bytes`;

const bundle = readFileSync(OUT);
const manifest = readManifest();

if (bundle.length !== manifest.bytes) {
  console.error(`  bundle is ${format(bundle.length)} but its manifest says ${format(manifest.bytes)}.`);
  console.error('  Run: npm run bundle');
  process.exit(1);
}

const gzip = gzipSync(bundle, { level: 9 }).length;
let failed = false;

for (const [label, actual, limit] of [
  ['raw', bundle.length, RAW_LIMIT],
  ['gzip-9', gzip, GZIP_LIMIT],
]) {
  const headroom = limit - actual;
  if (headroom < 0) {
    console.error(`  ${label}: ${format(actual)} exceeds its ${format(limit)} ceiling by ${format(-headroom)}.`);
    failed = true;
  } else {
    console.log(`  ${label}: ${format(actual)}, ${format(headroom)} under the ceiling.`);
  }
}

process.exit(failed ? 1 : 0);
