/**
 * Copy the sibling web components into `public/`, for the development host.
 * With `--bundle-demo`, stage them and `demo/index.html` into `dist-bundle/`.
 *
 * The designer offers term search through `<cedar-embeddable-term-picker>` and previews a
 * template with `<cedar-embeddable-editor>`. Neither is bundled — a host page
 * loads all three scripts — so a development host that serves the designer alone
 * has two surfaces that can only report their own absence.
 *
 * The copies are build output of neighbouring repositories and are not committed.
 * A sibling that has not been built is reported and skipped rather than failing
 * the run: the designer says so where the component would have been used, which
 * is the same thing an embedder sees.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siblings = [
  {
    name: 'cedar-embeddable-term-picker',
    from: resolve(root, '../cedar-embeddable-term-picker/dist-bundle/cedar-embeddable-term-picker.js'),
    built: 'npm --prefix ../cedar-embeddable-term-picker run dist',
  },
  {
    name: 'cedar-embeddable-editor',
    from: resolve(root, '../cedar-embeddable-editor/visual/public/cedar-embeddable-editor.js'),
    built:
      'npm --prefix ../cedar-embeddable-editor run build:production && npm --prefix ../cedar-embeddable-editor/visual run bundle',
  },
];

const bundleDemo = process.argv.includes('--bundle-demo');
const target = join(root, bundleDemo ? 'dist-bundle' : 'public');
mkdirSync(target, { recursive: true });
if (bundleDemo) copyFileSync(join(root, 'demo/index.html'), join(target, 'index.html'));

for (const sibling of siblings) {
  const to = join(target, `${sibling.name}.js`);
  if (!existsSync(sibling.from)) {
    console.log(`  ${sibling.name}: not built, skipping — \`${sibling.built}\` to include it`);
    continue;
  }
  copyFileSync(sibling.from, to);
  console.log(
    `  ${sibling.name}: ${statSync(to).size.toLocaleString('en-US')} bytes staged to ${bundleDemo ? 'dist-bundle' : 'public'}/`,
  );
}
