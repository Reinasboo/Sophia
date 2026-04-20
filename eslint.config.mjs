import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
          // Allow PascalCase for Zod schemas, React components, and other factory functions
          modifiers: ['exported'],
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE'],
        },
        {
          // Allow any formatting for object literal properties (program IDs, snake_case keys, etc.)
          selector: 'objectLiteralProperty',
          format: null,
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Disable strict rules for config and demo files
    files: ['eslint.config.mjs', 'scripts/**/*.ts', 'vitest.config.ts'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/', 'build/', 'node_modules/', '.next/', 'apps/frontend/'],
  }
);
