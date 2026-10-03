// Shared flat config for the API and the packages. apps/web has its own config (Next.js rules).
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Business dates and times must go through the kitchen time zone (ClockService / domain calendar),
// never through the process-local Date getters (TRD §4.2).
const localTimeGetters = ['getDate', 'getDay', 'getHours', 'getMinutes', 'getMonth', 'getFullYear'];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/src/generated/**', 'apps/web/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-restricted-syntax': [
        'error',
        ...localTimeGetters.map((name) => ({
          selector: `CallExpression[callee.property.name='${name}']`,
          message: `Do not use Date#${name}() (process-local time). Use the kitchen-TZ helpers instead.`,
        })),
      ],
    },
  },
  {
    // Nest uses decorators + DI by class reference; type-only imports would break injection.
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
);
