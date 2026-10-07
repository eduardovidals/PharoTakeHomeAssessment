import path from 'node:path';
import js from '@eslint/js';
import prettier from '@pharo/prettier-config';
import query from '@tanstack/eslint-plugin-query';
import accessibility from 'eslint-plugin-jsx-a11y-x';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import typescript from 'typescript-eslint';

const authoredFiles = ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'];
const typedFiles = ['**/*.{ts,tsx,mts,cts}'];
const reactFiles = ['**/*.{jsx,tsx}'];

/**
 * Create Pharo's flat ESLint policy for a repository's authored source.
 * TypeScript's compiler owns semantic type checking; these standard rules reject
 * unsafe syntax while React, Query, accessibility and formatting have one owner.
 *
 * @param {{ rootDirectory: string }} options Canonical absolute repository directory.
 * @returns {import('eslint').Linter.Config[]} Configurations consumed by root ESLint.
 */
export function createPharoEslintConfig(options) {
  if (!options || !path.isAbsolute(options.rootDirectory ?? '')) {
    throw new TypeError('rootDirectory must be an absolute repository path');
  }

  return [
    {
      name: 'pharo/generated-and-private',
      ignores: [
        '.dev-private/**',
        '.factory-agent/**',
        '.private/**',
        '.reference/**',
        '.private-skills/**',
        '.nx/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/coverage/**',
        '**/storybook-static/**',
        '**/playwright-report/**',
        '**/test-results/**',
        '**/TestResults/**',
        '**/bin/**',
        '**/obj/**',
        'apps/pharo-dashboard-ui/src/routeTree.gen.ts',
      ],
    },
    {
      ...js.configs.recommended,
      name: 'pharo/javascript',
      files: authoredFiles,
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      linterOptions: { reportUnusedDisableDirectives: 'error' },
    },
    ...typescript.configs.strict.map((configuration) => ({
      ...configuration,
      name: `pharo/${configuration.name}`,
      files: typedFiles,
      languageOptions: {
        ...configuration.languageOptions,
        parserOptions: { tsconfigRootDir: options.rootDirectory },
      },
    })),
    {
      name: 'pharo/explicit-type-safety',
      files: typedFiles,
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      },
    },
    {
      name: 'pharo/browser-source',
      files: [
        'apps/pharo-dashboard-ui/src/**/*.{js,jsx,ts,tsx}',
        'packages/pharo-react-components/**/*.{js,jsx,ts,tsx}',
        'packages/pharo-react-form-components/**/*.{js,jsx,ts,tsx}',
        'packages/pharo-react-charts/**/*.{js,jsx,ts,tsx}',
        '**/.storybook/preview.{js,ts,tsx}',
      ],
      languageOptions: { globals: globals.browser },
    },
    {
      name: 'pharo/node-tooling',
      files: [
        '*.{js,mjs,cjs}',
        'scripts/**/*.{js,mjs,cjs,ts,mts,cts}',
        '**/*.config.{js,mjs,cjs,ts,mts,cts}',
        '**/.storybook/main.{js,ts,mjs}',
        '**/e2e/**/*.{js,mjs,ts}',
        'packages/pharo-eslint-config/{src,test}/**/*.mjs',
        'packages/pharo-prettier-config/{src,test}/**/*.mjs',
      ],
      languageOptions: { globals: globals.node },
    },
    {
      ...accessibility.configs.recommended,
      name: 'pharo/accessible-react',
      files: reactFiles,
    },
    {
      name: 'pharo/react-hooks',
      files: authoredFiles,
      plugins: { 'react-hooks': hooks },
      rules: {
        ...hooks.configs.recommended.rules,
        'react-hooks/exhaustive-deps': 'error',
      },
    },
    ...query.configs['flat/recommended'].map((configuration) => ({
      ...configuration,
      files: authoredFiles,
      rules: { ...configuration.rules, '@tanstack/query/no-rest-destructuring': 'error' },
    })),
    {
      ...refresh.configs.vite,
      name: 'pharo/application-refresh',
      files: ['apps/pharo-dashboard-ui/src/**/*.tsx'],
      ignores: ['**/*.test.tsx', '**/*.stories.tsx', '**/test/**'],
    },
    {
      name: 'pharo/tanstack-file-routes',
      files: ['apps/pharo-dashboard-ui/src/routes/*.tsx'],
      rules: {
        'react-refresh/only-export-components': [
          'error',
          {
            allowConstantExport: true,
            allowCompoundComponents: true,
            allowExportNames: ['Route'],
          },
        ],
      },
    },
    {
      ...prettierRecommended,
      name: 'pharo/formatting',
      files: authoredFiles,
      rules: {
        ...prettierRecommended.rules,
        'prettier/prettier': ['error', prettier, { usePrettierrc: false }],
      },
    },
  ];
}
