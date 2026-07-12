/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ['../../.eslintrc.cjs'],
  parserOptions: {
    project: './tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
  },
  rules: {
    // Regex-based format validators (E.164 phone, sanitization patterns) —
    // reviewed by hand, not user-supplied patterns, so ReDoS scanning here
    // is noise rather than signal.
    'security/detect-unsafe-regex': 'off',
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/__tests__/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'import/no-cycle': 'off',
      },
    },
  ],
};
