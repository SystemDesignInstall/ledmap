import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/out/**', '**/node_modules/**', '**/coverage/**'],
  },
  tseslint.configs.recommended,
  {
    files: ['packages/app/src/renderer/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: ['node:*', 'electron', '@ledmap/core/*', '**/core/src/**'],
      }],
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron'],
              message: 'core must stay pure: no electron imports',
            },
            {
              group: ['node:fs', 'node:path', 'node:os', 'node:child_process', 'node:process'],
              message: 'core must stay pure: no node builtin imports',
            },
          ],
        },
      ],
    },
  },
)
