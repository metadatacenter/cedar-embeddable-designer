/**
 * Two properties of this codebase that no type can express, and that nothing else
 * would notice breaking.
 *
 * Both hold today by discipline, which is another way of saying they hold until
 * someone adds a convenient import. Neither breaks the build when it goes: the
 * first fails at `tsc --emitDeclarationOnly`, whose output nothing looks at until
 * an embedder compiles against the package, and the second fails at nothing at
 * all — it just quietly stops being true.
 *
 * Run under `node --test` rather than with the unit suite, which runs in a
 * browser environment and cannot read the source tree it is testing.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const SRC = resolve(fileURLToPath(new URL('..', import.meta.url)), 'src');

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const sources = () => walk(SRC).filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));

const references = (file) => {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const result = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
      result.push({
        module: node.moduleSpecifier.text,
        typeOnly: !!(node.isTypeOnly || node.importClause?.isTypeOnly),
      });
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      result.push({ module: node.argument.literal.text, typeOnly: true });
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require') &&
      ts.isStringLiteral(node.arguments[0])
    )
      result.push({ module: node.arguments[0].text, typeOnly: false });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
};
const importsOf = (file) => references(file).map(({ module }) => module);

/*
 * `ced-public-api.ts` becomes the declaration the npm package ships, through one
 * `tsc --emitDeclarationOnly`. An import here would put a path into that
 * declaration that exists only inside this repository, so an embedder compiling
 * against the package would be told to resolve a file they were never sent.
 */
test('the published contract is written without imports', () => {
  const contract = readFileSync(join(SRC, 'app/ced-public-api.ts'), 'utf8');

  assert.doesNotMatch(contract, /^\s*import\s/m);
  assert.doesNotMatch(contract, /\brequire\s*\(/);
});

/*
 * One module speaks to the CEDAR model library, through the cedar-template facade.
 * Everything this designer builds, writes and reads goes through that boundary, which is
 * what keeps the designer's own state a separate thing from the CEDAR artifact
 * and stops the library's vocabulary from spreading into components.
 *
 * Losing it is not a compile error but a slow one: a component reaching for a
 * builder writes a second, divergent path to the same artifact, and the two come
 * to disagree about what a field is.
 */
test('the CEDAR model library stays inside the adapter module', () => {
  const speakers = sources()
    .filter((file) => importsOf(file).some((module) => module.includes('cedar-model-typescript-library')))
    .map((file) => relative(SRC, file))
    .sort();

  assert.ok(speakers.length > 0);
  assert.deepEqual(
    speakers.filter((file) => !file.startsWith('app/core/model/cedar-model/')),
    [],
  );
});

test('adapter implementations never depend on their public facade and have no dependency cycles', () => {
  const files = sources();
  const known = new Set(files);
  const adapter = files.filter((file) => file.includes('/core/model/cedar-model/'));
  const edges = new Map(
    files.map((file) => [
      file,
      references(file)
        .filter(({ module, typeOnly }) => module.startsWith('.') && !typeOnly)
        .map(({ module }) => resolve(dirname(file), module) + '.ts')
        .filter((path) => known.has(path)),
    ]),
  );
  const visited = new Set();
  const visit = (file, stack = []) => {
    assert.ok(
      !stack.includes(file),
      `Dependency cycle: ${[...stack, file].map((path) => relative(SRC, path)).join(' → ')}`,
    );
    if (visited.has(file)) return;
    for (const dependency of edges.get(file) ?? []) visit(dependency, [...stack, file]);
    visited.add(file);
  };
  for (const file of adapter) {
    assert.ok(!importsOf(file).some((module) => module.endsWith('cedar-template')), relative(SRC, file));
    visit(file);
  }
});

/*
 * The sibling web components are not dependencies: the host loads their scripts
 * and this bundle carries neither. An import of either package would put a second
 * copy of it inside this one — two megabytes of editor, or a picker registering a
 * tag the host has already registered.
 */
test('the sibling components are not imported', () => {
  const importers = sources()
    .filter((file) =>
      importsOf(file).some(
        (module) => module.includes('cedar-embeddable-editor') || module.includes('cedar-embeddable-term-picker'),
      ),
    )
    .map((file) => relative(SRC, file));

  assert.deepEqual(importers, []);
});
