/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ['../../.eslintrc.cjs'],
  parserOptions: {
    project: './tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
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
