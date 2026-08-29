// @ts-check
/**
 * ESLint flat config, matching the CEDAR Embeddable Editor's.
 *
 * `angular-eslint` 22 requires ESLint 9 or 10, and ESLint 9 makes flat config the
 * default while 10 removes the old format entirely. The four `@angular-eslint/*`
 * packages are one `angular-eslint` here, and the two `@typescript-eslint/*` are
 * one `typescript-eslint`. That is the upstream shape, not a repackaging done here.
 *
 * `.mjs` rather than `.js` because package.json declares no `type`, so a bare `.js`
 * would be parsed as CommonJS and these imports would fail.
 */
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  {
    ignores: ['dist/**', 'dist-electron/**', 'out-tsc/**', 'node_modules/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
      prettierRecommended,
    ],
    processor: angular.processInlineTemplates,
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /*
       * Prettier owns formatting, and `eslint-config-prettier` switches off every
       * rule that would argue with it. A second opinion on formatting is how the two
       * end up disagreeing.
       */
      'prettier/prettier': 'error',
      // A leading underscore marks a binding that an interface, override or callback
      // signature forces us to declare but that the body does not use.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      /*
       * `prefer-inject`, `prefer-standalone` and `prefer-on-push` all stay on, where
       * CEE switches all three off. CEE has 118 constructor injections, 47
       * non-standalone components and a rendering model that mutates in place; this
       * codebase has none of those, so the rules cost nothing and keep it that way.
       *
       * `no-explicit-any` is on too, as its own note said it would be once the model
       * library owned serialization and the element had a declared contract. Of the
       * 26 sites it first reported, 22 were in the YAML shim, the element wrapper and
       * the Electron service, all since deleted; the last four were one untyped
       * preference update, now generic in the key that names it.
       */
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended],
    rules: {
      // The migration this asks for is done: `ng update` rewrote every `*ngIf` and
      // `*ngFor` as `@if` and `@for` on the way to 21. The rule is what stops the old
      // syntax coming back one template at a time.
      '@angular-eslint/template/prefer-control-flow': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    extends: [js.configs.recommended, prettierRecommended],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'script',
    },
  },
);
