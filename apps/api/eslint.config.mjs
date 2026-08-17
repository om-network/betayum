// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Keep the existing backlog visible without blocking infrastructure and
      // formatting validation. New code should not add to these warnings.
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/prefer-promise-reject-errors': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/unbound-method': 'warn',
      'no-case-declarations': 'warn',
      'no-constant-condition': 'warn',
      'no-control-regex': 'warn',
      'no-misleading-character-class': 'warn',
      'no-useless-catch': 'warn',
      'no-useless-escape': 'warn',
    },
  },
);
