/**
 * Build `dist-bundle/cedar-embeddable-designer.js` — the single file an embedder
 * downloads — and a manifest recording what went into it. The host-fonts build
 * becomes `cedar-embeddable-designer.host-fonts.js` beside it, with a manifest of
 * its own, for a host that registers the CEDAR fonts for its whole page.
 *
 * The manifest exists so the size gate and the packaging step can check the copy
 * they are looking at without re-deriving it, and so a staged package can be
 * verified byte for byte against the bundle that was tested.
 *
 * Usable as a module: `produceBundle()` returns the bytes and the manifest
 * without writing, so the packaging step is testable against a synthetic build.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { DEFAULT_DIST, HOST_FONTS_DIST, ROOT, resolveBuildOutput } from './build-output.mjs';

import { provenanceFile, verifyProvenance } from './build-provenance.mjs';

export const OUT_DIR = join(ROOT, 'dist-bundle');
export const OUT = join(OUT_DIR, 'cedar-embeddable-designer.js');
export const MANIFEST = join(OUT_DIR, 'bundle-manifest.json');
export const HOST_FONTS_OUT = join(OUT_DIR, 'cedar-embeddable-designer.host-fonts.js');
export const HOST_FONTS_MANIFEST = join(OUT_DIR, 'bundle-manifest.host-fonts.json');

/** Each bundle the package ships, with the build it is made from. */
export const VARIANTS = [
  { label: 'standalone', dist: DEFAULT_DIST, out: OUT, manifest: MANIFEST },
  { label: 'host fonts', dist: HOST_FONTS_DIST, out: HOST_FONTS_OUT, manifest: HOST_FONTS_MANIFEST },
];

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * Flatten one ES module and its chunks into a classic script.
 *
 * `iife` matters: the file is loaded with a plain `<script>` by embedders who
 * are not obliged to use `type="module"`, and a top-level `import` would fail
 * there.
 */
async function flatten(entry) {
  const esbuild = await import('esbuild');
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    /*
     * Whitespace only. Angular has already minified, downleveled and tree-shaken
     * this; re-mangling names would add risk for nothing. But esbuild re-prints
     * what it parses, and printing minified input with default formatting
     * inflates the result substantially, so this undoes that and touches nothing
     * else.
     */
    minifyWhitespace: true,
    write: false,
    logLevel: 'silent',
    platform: 'browser',
  });
  return Buffer.from(result.outputFiles[0].contents);
}

export async function produceBundle(dist = DEFAULT_DIST) {
  const { inputs } = resolveBuildOutput(dist);

  const parts = [];
  for (const input of inputs) {
    parts.push(await flatten(input.path));
  }
  const bundle = Buffer.concat(parts);

  return {
    bundle,
    /*
     * No timestamp. A build time here would make the manifest differ on every
     * rebuild even when the bundle was byte-identical, so a staged copy could
     * never be verified by comparison. The freshness guard uses content fingerprints instead.
     */
    manifest: {
      bytes: bundle.length,
      sha256: sha256(bundle),
      inputs: inputs.map((input) => relative(ROOT, input.path)),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const variant of VARIANTS) {
    const provenance = JSON.parse(readFileSync(provenanceFile(variant.dist), 'utf8'));
    verifyProvenance(provenance, ROOT, variant.dist);
    const { bundle, manifest } = await produceBundle(variant.dist);
    manifest.provenance = provenance;
    mkdirSync(dirname(variant.out), { recursive: true });
    writeFileSync(variant.out, bundle);
    writeFileSync(variant.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(
      `  bundle: ${variant.label} ${manifest.bytes.toLocaleString('en-US')} bytes (${manifest.sha256.slice(0, 12)}…)`,
    );
  }
}

export const readManifest = (manifest = MANIFEST) => JSON.parse(readFileSync(manifest, 'utf8'));
