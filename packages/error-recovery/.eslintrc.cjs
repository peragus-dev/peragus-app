module.exports = {
  root: true,
  extends: [require.resolve('@peragus/configs/eslint/library.js')],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.lint.json',
    tsconfigRootDir: __dirname,
  },
  globals: {
    Bun: false,
  },
};
