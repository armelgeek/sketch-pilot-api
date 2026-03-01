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
    }
  ],
  {
    prettier: true,
    markdown: true,
    ignorePatterns: ['docs', 'drizzle/**', '.github']
  }
)
