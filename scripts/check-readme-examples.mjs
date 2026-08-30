/**
 * Hold the README's examples to the same standard as the code.
 *
 * Documentation rots in two directions and neither shows up in a build. A
 * TypeScript example can name a configuration key that no longer exists, so the
 * one block whose subject is type safety becomes the only thing in the file a
 * compiler rejects. And a shell example can invoke a script that was renamed or
 * never existed, which reads exactly like one that works.
 *
 * The second is not hypothetical here: `npm --prefix ../cedar-embeddable-editor
 * run dist` was written into this project's documentation and CEE has no `dist`
 * script. Nothing said so, because nothing had ever run a documented command.
 *
 * The TypeScript examples are compiled against the *staged* declaration rather
 * than the repository's sources, so what is checked is the pair a host actually
 * receives: the `.d.ts` and the README that ship together.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGET } from './npm-package.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const README = join(ROOT, 'README.md');

/*
 * A block that is deliberately not a whole module — a method body shown inside a
 * class, say — says so in its fence: ```ts fragment. Every renderer highlights on
 * the first word, so the marker costs nothing on the page and is visible to
 * whoever edits the example. Inferring it instead would mean treating "this does
 * not parse as a module" as acceptable, which is the failure being looked for.
 */
const TS_FENCE = /```(ts|typescript)([^\n]*)\n([\s\S]*?)```/g;
const SHELL_FENCE = /```(bash|shell|sh)[^\n]*\n([\s\S]*?)```/g;

const markdown = readFileSync(README, 'utf8');
const lineOf = (index) => markdown.slice(0, index).split('\n').length;
const problems = [];

/** Every `npm run <script>` a reader is told to type must be a script this project has. */
const scripts = Object.keys(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts);
for (const [, , body] of markdown.matchAll(SHELL_FENCE)) {
  for (const [invocation, name] of body.matchAll(/npm(?:\s+--prefix\s+\S+)?\s+run\s+([\w:-]+)/g)) {
    // Only this project's own scripts: a command aimed at a sibling repository is
    // that repository's to keep true, and this has no view of it.
    if (invocation.includes('--prefix')) {
      continue;
    }
    if (!scripts.includes(name)) {
      problems.push(`README names \`npm run ${name}\`, which this project has no script for.`);
    }
  }
}

const examples = [...markdown.matchAll(TS_FENCE)]
  .map(([, , flags, body], order) => ({ body, fragment: flags.includes('fragment'), line: 0, order }))
  .map((example, index) => ({ ...example, line: lineOf([...markdown.matchAll(TS_FENCE)][index].index) }));

if (examples.length > 0) {
  if (!existsSync(TARGET)) {
    console.error('\n  readme: the package is not staged, so the examples cannot be compiled. Run: npm run dist\n');
    process.exit(1);
  }
  const dir = mkdtempSync(join(tmpdir(), 'ced-readme-'));
  try {
    for (const example of examples) {
      const file = join(dir, `example-${example.order}.ts`);
      const source = example.fragment ? `async function fragment() {\n${example.body}\n}\n` : example.body;
      writeFileSync(
        file,
        source.replace(/'cedar-embeddable-designer'/g, `'${resolve(TARGET, 'cedar-embeddable-designer')}'`),
      );
      try {
        execFileSync(
          'npx',
          [
            'tsc',
            '--noEmit',
            '--strict',
            '--target',
            'ES2022',
            '--moduleResolution',
            'bundler',
            '--module',
            'ESNext',
            file,
          ],
          {
            cwd: ROOT,
            stdio: 'pipe',
          },
        );
      } catch (error) {
        problems.push(`README example at line ${example.line} does not compile:\n${String(error.stdout ?? error)}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (problems.length > 0) {
  console.error(`\n  readme: ${problems.length} problem(s).\n`);
  problems.forEach((problem) => console.error(`  - ${problem}`));
  console.error('');
  process.exit(1);
}

console.log(`  readme: ${examples.length} TypeScript example(s) compile; every documented script exists.`);
