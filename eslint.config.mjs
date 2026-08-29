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
       * `prefer-inject` and `prefer-standalone` stay on, where CEE switches both off.
       * CEE has 118 constructor injections and 47 non-standalone components; this
       * codebase has none of either, so the rules cost nothing and keep it that way.
       *
       * The two below are off, and each is off for a stated reason rather than
       * because it was noisy.
       */

      /*
       * 26 sites, 22 of which are in code that is being deleted or rewritten: the
       * hand-written YAML parser, `TemplateService.loadTemplate`, the element wrapper
       * and the Electron service. Typing them where they stand would be work thrown
       * away, and typing them properly is what replacing that code amounts to.
       *
       * The rule goes back on when the model library owns serialization and the
       * element has a declared contract, at which point the remaining four are a
       * morning's work.
       */
      '@typescript-eslint/no-explicit-any': 'off',
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
