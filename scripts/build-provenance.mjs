import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, DEFAULT_DIST } from './build-output.mjs';

export const PROVENANCE = join(DEFAULT_DIST, 'ced-build-inputs.json');
function fingerprint(root, paths) {
  const hash = createHash('sha256');
  const visit = (path) => {
    hash.update(relative(root, path) + '\0');
    if (!existsSync(path)) {
      hash.update('missing\0');
      return;
    }
    if (statSync(path).isDirectory()) {
      for (const name of readdirSync(path).sort()) {
        if (name !== 'node_modules' && name !== '.git' && name !== 'ced-build-inputs.json') visit(join(path, name));
      }
    } else {
      hash.update(readFileSync(path));
      hash.update('\0');
    }
  };
  for (const path of paths) visit(join(root, path));
  return hash.digest('hex');
}

/** Content-based: touching a file or restoring timestamps cannot change the verdict. */
export function sourceFingerprint(root = ROOT) {
  const config = readdirSync(root)
    .filter((name) => /^(?:package(?:-lock)?\.json|angular\.json|tsconfig.*\.json|\.postcssrc\.json)$/.test(name))
    .sort();
  return fingerprint(root, [
    'src',
    'public',
    'scripts',
    ...config,
    'node_modules/@org.metadatacenter/cedar-design-tokens',
    'node_modules/cedar-model-typescript-library',
  ]);
}
export function outputFingerprint(dist = DEFAULT_DIST) {
  return fingerprint(dist, ['.']);
}
export function verifyProvenance(record, root = ROOT, dist = DEFAULT_DIST) {
  if (!record || record.source !== sourceFingerprint(root))
    throw new Error('Source, configuration or dependencies changed. Run: npm run dist');
  if (record.output !== outputFingerprint(dist))
    throw new Error('Compiled output changed or is missing. Run: npm run dist');
}
