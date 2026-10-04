import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const disabledTestModifiers = ['skip', 'skipIf', 'runIf', 'todo', 'only', 'fails'].flatMap((property) =>
  ['it', 'test', 'describe'].map((object) => ({
    object,
    property,
    message: 'Required suites must not be skipped, narrowed or conditional. Fix or delete the test instead.',
  })),
);

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'migrations/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Async functions that satisfy a Promise-returning contract without awaiting are fine.
      '@typescript-eslint/require-await': 'off',
      // Configuration is read once at the entry points; nothing else touches the environment.
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: 'Read configuration via src/config; only entry points read process.env.' },
      ],
    },
  },
  {
    files: ['src/main.ts', 'src/scripts/**/*.ts', 'tests/**/*.ts', '*.config.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', ...disabledTestModifiers],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
