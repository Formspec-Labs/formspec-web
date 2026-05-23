// ESLint flat-config per web ADR-0009 §"Discipline: no service-specific imports in core".
// The load-bearing rule is `import/no-restricted-paths`: it enforces the directory
// boundary between ports / app / composition-types and adapters. Vendor-name string
// detection (e.g., literal "formspec-server" in core prose) is a separate pre-commit
// grep concern per ADR-0009; ESLint cannot reliably catch that at AST level.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'vendor/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
        node: true,
      },
    },
    rules: {
      // web ADR-0009 §Discipline — port/adapter boundary enforcement.
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/ports',
              from: './src/adapters',
              message: 'Ports MUST NOT import adapters (web ADR-0009 §Discipline).',
            },
            {
              target: './src/ports',
              from: './src/composition',
              message: 'Ports MUST NOT import composition (web ADR-0009 §Discipline).',
            },
            {
              target: './src/ports',
              from: './src/app',
              message: 'Ports MUST NOT import the React shell (web ADR-0009 §Discipline).',
            },
            {
              target: './src/app',
              from: './src/adapters',
              message: 'App shell MUST NOT import adapters directly; consume via Composition (web ADR-0009 §Composition lifecycle).',
            },
            {
              target: './src/composition/types.ts',
              from: './src/adapters',
              message: 'Composition interface MUST NOT import adapters (web ADR-0009 §Discipline).',
            },
            {
              target: './src/adapters',
              from: './src/app',
              message: 'Adapters MUST NOT import from the React shell.',
            },
            {
              target: './src/adapters',
              from: './src/composition',
              message: 'Adapters MUST NOT import from composition; receive dependencies via constructor injection (web ADR-0009 §Composition lifecycle).',
            },
          ],
        },
      ],
      // Allow side-effect-free type-only imports across boundaries.
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // Allow leading-underscore for intentionally-unused args (stub adapters).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
