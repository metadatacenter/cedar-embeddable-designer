/**
 * What the published package contains, and which registry it belongs to.
 *
 * Shared by the staging step and the verification step so the two cannot
 * disagree about either question.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './build-output.mjs';
import { MANIFEST, OUT, sha256 } from './make-bundle.mjs';

export const TYPES = join(ROOT, 'dist-types/ced-public-api.d.ts');
export const TARGET = join(ROOT, 'dist-npm/cedar-embeddable-designer');

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/**
 * The two channels the designer publishes on, and which one a version selects.
 *
 * A development snapshot goes to the CEDAR Nexus under the `@org.metadatacenter`
 * scope; a release goes to public npmjs unscoped. The channel is derived from the
 * version rather than passed at publish time, so a snapshot cannot be published
 * as a release by forgetting a flag. The scope is what makes selective resolution
 * possible: npm routes by scope, so an embedding application can take this one
 * package from Nexus while everything else comes from npmjs.
 */
const NEXUS_REGISTRY = 'https://nexus.bmir.stanford.edu/repository/npm-cedar/';
const DEV_VERSION = /-dev\./;

export function packageMetadata(rootPackage = readJson(join(ROOT, 'package.json'))) {
  const isDev = DEV_VERSION.test(rootPackage.version);
  return {
    name: isDev ? '@org.metadatacenter/cedar-embeddable-designer' : 'cedar-embeddable-designer',
    version: rootPackage.version,
    description: rootPackage.description,
    // The bundle is a side-effecting script that registers a custom element and
    // exports nothing, so `main` is a courtesy and `types` is what a host imports
    // `CedConfig` from. The declaration also carries the `HTMLElementTagNameMap`
    // entry that makes `document.querySelector('cedar-embeddable-designer')` typed.
    main: 'cedar-embeddable-designer.js',
    types: 'cedar-embeddable-designer.d.ts',
    files: [
      'cedar-embeddable-designer.js',
      'cedar-embeddable-designer.d.ts',
      'bundle-manifest.json',
      'README.md',
      'CHANGELOG.md',
      'license.txt',
    ],
    // A release carries no publishConfig, so it goes to registry.npmjs.org under
    // `latest`. A snapshot names Nexus here, so the destination cannot be lost by
    // forgetting a flag. The tag still has to be passed on the command line.
    ...(isDev ? { publishConfig: { registry: NEXUS_REGISTRY, tag: 'dev' } } : {}),
    repository: { type: 'git', url: 'git+https://github.com/metadatacenter/cedar-embeddable-designer.git' },
    keywords: ['metadata', 'CEDAR', 'template', 'designer', 'Web Component'],
    author: 'Metadata Center',
    license: 'BSD-2-Clause',
    bugs: { url: 'https://github.com/metadatacenter/cedar-embeddable-designer/issues' },
    homepage: 'https://github.com/metadatacenter/cedar-embeddable-designer#readme',
  };
}

/** The bundle and its manifest, refused if they do not agree. */
export function assertSourceBundle() {
  if (!existsSync(OUT) || !existsSync(MANIFEST)) {
    throw new Error('the bundle is missing.\n  Run: npm run bundle');
  }
  const bundle = readFileSync(OUT);
  const manifest = readJson(MANIFEST);
  if (sha256(bundle) !== manifest.sha256) {
    throw new Error('the bundle does not match its manifest digest.\n  Run: npm run bundle');
  }
  if (!existsSync(TYPES)) {
    throw new Error('the published declaration is missing.\n  Run: npm run types:public');
  }
  return { bundle, manifest };
}

/** Every file the staged package should contain, by name. */
export function expectedFiles() {
  const { bundle, manifest } = assertSourceBundle();
  return {
    'cedar-embeddable-designer.js': bundle,
    'cedar-embeddable-designer.d.ts': readFileSync(TYPES),
    'bundle-manifest.json': Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    'README.md': readFileSync(join(ROOT, 'README.md')),
    'CHANGELOG.md': readFileSync(join(ROOT, 'CHANGELOG.md')),
    'license.txt': readFileSync(join(ROOT, 'license.txt')),
    'package.json': Buffer.from(`${JSON.stringify(packageMetadata(), null, 2)}\n`),
  };
}
