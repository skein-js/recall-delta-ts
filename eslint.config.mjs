import js from '@eslint/js';
import nx from '@nx/eslint-plugin';
import prettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.skein/**', '**/reports/**', '.nx/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['**/*.{ts,mjs,cjs,js}'],
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    files: ['packages/**/*.ts', 'examples/**/*.ts'],
    plugins: { '@nx': nx },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          depConstraints: [
            { sourceTag: 'platform:shared', onlyDependOnLibsWithTags: ['platform:shared'] },
            {
              sourceTag: 'platform:node',
              onlyDependOnLibsWithTags: ['platform:shared', 'platform:node'],
            },
            { sourceTag: 'type:library', onlyDependOnLibsWithTags: ['type:library'] },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/**/*.ts'],
    ignores: ['**/tests/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['node:*', '@langchain/*', '@skein-js/*', 'better-sqlite3'] },
      ],
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  prettier,
);
