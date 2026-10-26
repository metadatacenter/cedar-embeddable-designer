import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PROVENANCE,
  provenanceFile,
  sourceFingerprint,
  outputFingerprint,
  verifyProvenance,
} from './build-provenance.mjs';
import { HOST_FONTS_DIST } from './build-output.mjs';

test('source/config/dependency edits and altered outputs invalidate a build independently of timestamps', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'ced-provenance-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dist = join(root, 'dist');
  const paths = [
    'src/app.ts',
    'angular.json',
    'package-lock.json',
    'node_modules/@org.metadatacenter/cedar-design-tokens/dist/tokens.css',
    'node_modules/cedar-model-typescript-library/index.js',
  ];
  for (const path of [...paths, 'dist/main.js']) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), 'original');
  }
  const record = { source: sourceFingerprint(root), output: outputFingerprint(dist) };
  verifyProvenance(record, root, dist);
  for (const path of paths) {
    const file = join(root, path),
      time = statSync(file);
    writeFileSync(file, 'changed');
    utimesSync(file, time.atime, time.mtime);
    assert.throws(() => verifyProvenance(record, root, dist), /Source/);
    writeFileSync(file, 'original');
  }
  writeFileSync(join(dist, 'main.js'), 'tampered');
  assert.throws(() => verifyProvenance(record, root, dist), /Compiled/);
  assert.throws(() => verifyProvenance(undefined, root, dist), /Source/);
  rmSync(dist, { recursive: true });
  assert.throws(() => verifyProvenance(record, root, dist), /Compiled/);
});

test('each build output keeps its own provenance, so one variant cannot vouch for the other', () => {
  const standalone = provenanceFile();
  const hosted = provenanceFile(HOST_FONTS_DIST);

  assert.equal(standalone, PROVENANCE);
  assert.notEqual(hosted, standalone);
  assert.ok(hosted.startsWith(HOST_FONTS_DIST));
});
