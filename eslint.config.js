import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // ESLint 9.39+ has an option-shape mismatch with
      // typescript-eslint <8.21 on this rule that crashes lint with
      // "Cannot read properties of undefined (reading
      // 'allowShortCircuit')". Disable until typescript-eslint is
      // upgraded.
      '@typescript-eslint/no-unused-expressions': 'off',
      // Tracked technical debt — ~500 occurrences. Demote to warn
      // so CI lint can be enforced as a blocking step without
      // requiring a multi-week any→proper-types refactor.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Many hooks intentionally run once or are stable across
      // renders. Demote to warn rather than fail the build.
      'react-hooks/exhaustive-deps': 'warn',
      // Allow `_e`, `_err`, `_mode` etc. as a convention for
      // intentionally-unused destructured/caught values.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  }
);
