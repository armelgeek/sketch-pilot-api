import { config } from '@kolhe/eslint-config'

export default config(
  [
    {
      files: ['src/**/*.ts'],
      rules: {
        'import/no-default-export': 'off'
      }
    },
    {
      files: ['drizzle/**/*'],
      rules: {
        'unicorn/filename-case': 'off',
        'no-console': 'off'
      }
    },
    {
      files: ['**/*.test.ts'],
      rules: {
        'unicorn/filename-case': 'off',
        'no-console': 'off',
        'import/no-default-export': 'off'
      }
    },
    {
      files: ['plugins/sketch-pilot/**/*.ts'],
      rules: {
        'no-console': 'off',
        'node/prefer-global/process': 'off',
        'node/prefer-global/buffer': 'off',
        '@typescript-eslint/no-require-imports': 'off',
        'require-await': 'off',
        'no-case-declarations': 'off',
        'unicorn/no-array-push-push': 'off',
        'unused-imports/no-unused-vars': 'off',
        'no-duplicate-imports': 'off',
        'no-async-promise-executor': 'off',
        'jsdoc/check-param-names': 'off',
        'regexp/no-super-linear-backtracking': 'off',
        'regexp/no-misleading-capturing-group': 'off',
        'regexp/no-unused-capturing-group': 'off',
        'no-lonely-if': 'off',
        'unicorn/prefer-string-slice': 'off',
        'unicorn/prefer-number-properties': 'off',
        'no-useless-escape': 'off',
        '@typescript-eslint/consistent-type-assertions': 'off'
      }
    }
  ],
  {
    prettier: true,
    markdown: true,
    ignorePatterns: ['docs', 'drizzle/**', '.github', 'plugins/sketch-pilot/**']
  }
)
