// ESLint 9 flat config. Replaces .eslintrc and .config/.eslintrc, which
// @grafana/eslint-config 10 no longer supports.
import grafanaConfig from '@grafana/eslint-config';

export default [
  {
    // What the ESLint 8 setup skipped: the .gitignore'd build and test output
    // (the lint script passed --ignore-path .gitignore), the old
    // ignorePatterns, and dot-folders such as .config/ (ESLint 8 ignored those
    // by default; ESLint 9 doesn't).
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      'artifacts/',
      'work/',
      'ci/',
      'e2e-results/',
      'playwright-report/',
      'test-results/',
      'playwright/.auth/',
      'website/site/',
      '.config/',
      'jest.config.js',
      'jest-setup.js',
      'jest-polyfills.js',
      '.prettierrc.js',
      'playwright.config.ts',
      'tests/',
      'testing/scripts/',
      'website/scripts/',
      'website/docs/javascripts/',
      'scripts/',
      'vendor/',
    ],
  },
  ...grafanaConfig,
  {
    // ESLint 9 only lints .js/.mjs/.cjs unless a config names other files;
    // ESLint 8 got these from the lint script's --ext flag.
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      'react/prop-types': 'off',
      // eslint-plugin-react-hooks 7 adds React Compiler rules. These three
      // flag existing panel patterns (state synced in effects, a ref updated
      // during render, module-scope aspect variables). Reworking them changes
      // panel state handling, so they warn rather than fail until that's done.
      // The other compiler rules, rules-of-hooks and exhaustive-deps keep
      // their recommended levels.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
];
