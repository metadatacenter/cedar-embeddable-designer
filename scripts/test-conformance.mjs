import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createJavaOracle } from 'cedar-model-typescript-library/conformance/java-oracle.mjs';

const directory = await mkdtemp(join(tmpdir(), 'ced-authoring-'));
let oracle;
try {
  const entry = join(directory, 'cases.cjs');
  await build({
    entryPoints: ['scripts/conformance-cases.ts'],
    outfile: entry,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'error',
  });
  const { cases, CedarReaders, TemplateValueValidator, SchemaArtifactValidator, JsonSourcePolicy } = createRequire(
    import.meta.url,
  )(entry);
  oracle = await createJavaOracle(
    SchemaArtifactValidator.schemaDigests,
    JsonSourcePolicy.stringify.bind(JsonSourcePolicy),
  );
  const rows = await cases(),
    readers = CedarReaders.json().getStrict();
  for (const row of rows) {
    const verdict = await oracle.validate(row.artifact, row.kind);
    if (row.saveable) {
      assert.equal(verdict.canSave, true, `${row.name}: Java validator: ${JSON.stringify(verdict.errors)}`);
      assert.equal(verdict.readable, true, `${row.name}: Java reader: ${verdict.readerError}`);
      assert.equal(
        SchemaArtifactValidator.validate(row.artifact, row.kind).canSave,
        true,
        `${row.name}: raw TypeScript validation`,
      );
      const reader =
        row.kind === 'template'
          ? readers.getTemplateReader()
          : row.kind === 'element'
            ? readers.getTemplateElementReader()
            : readers.getTemplateFieldReader();
      const read = reader.readFromString(JsonSourcePolicy.stringify(row.artifact));
      assert.equal(
        TemplateValueValidator.validate(read.template ?? read.element ?? read.field).canSave,
        true,
        `${row.name}: TypeScript reader/value checks`,
      );
    } else {
      assert.ok(!verdict.canSave || !verdict.readable, `${row.name}: negative control must be refused by Java`);
      assert.equal(
        SchemaArtifactValidator.validate(row.artifact, row.kind).canSave,
        false,
        `${row.name}: raw TypeScript must refuse`,
      );
    }
  }
  console.log(
    `Authoring conformance: ${rows.filter((row) => row.saveable).length} saveable CED outputs accepted by Java validator, Java reader and strict TypeScript reader; ${rows.filter((row) => !row.saveable).length} negative controls refused.`,
  );
} finally {
  await oracle?.close();
  await rm(directory, { recursive: true, force: true });
}
