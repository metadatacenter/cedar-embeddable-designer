/**
 * `import.meta.glob`, declared here because Vite's own types are not reachable.
 *
 * The spec environment is bundled for the browser and has no `node:fs`, so a suite
 * that needs files from disk — the artifact corpus — reaches them through Vite's glob
 * import, which inlines their contents at build time. Vite is a transitive dependency
 * of Vitest rather than a direct one, so `"types": ["vite/client"]` does not resolve
 * and adding Vite to `package.json` to import a type would be the wrong trade.
 *
 * Only the eager form is declared, because only the eager form is used: a lazy glob
 * hands back loaders, and a test that has to await its own fixtures gains nothing.
 */
interface ImportMeta {
  glob<T = unknown>(pattern: string, options: { eager: true }): Record<string, T>;
}
