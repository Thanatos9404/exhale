import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

const TESTS = ['**/*.test.{ts,tsx}', '**/*.spec.ts', 'src/test/**', 'tests/**', 'e2e/**'];

/** Size and shape limits that keep every module small enough to read in one sitting. */
const SHAPE_LIMITS = {
  'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
  'max-params': ['error', 4],
  'max-depth': ['error', 3],
  complexity: ['error', 12],
  'no-nested-ternary': 'error',
};

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'public',
      '.vercel',
      'playwright-report',
      'test-results',
    ],
  },
  // Rules cannot be switched off from inside a file: there are no eslint-disable comments.
  { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' } },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      ...SHAPE_LIMITS,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Values are narrowed by guards or schemas, never asserted. `as const` stays allowed.
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      'react-hooks/exhaustive-deps': 'error',
      'no-console': 'error',
      'no-warning-comments': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // The one module allowed to write to the console; everything else logs through it.
    files: ['server/log.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: TESTS,
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  {
    // Build scripts run in Node and report to the terminal.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: SHAPE_LIMITS,
  },
);
