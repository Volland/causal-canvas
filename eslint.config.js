import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-test/**',
      '**/node_modules/**',
      'apps/vscode/media/**',
      'apps/vscode/schema/**',
      'conformance/**',
      'examples/**',
      'manuscript/figures/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The webview is browser code; `JSX` is a global from the React types.
    files: ['apps/vscode/webview/**/*.tsx'],
    languageOptions: { globals: { JSX: 'readonly', window: 'readonly', MessageEvent: 'readonly' } },
  },
);
