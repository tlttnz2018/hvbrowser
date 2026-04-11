import expoConfig from 'eslint-config-expo/flat.js';
import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

const projectIgnores = [
  'node_modules/**',
  '.expo/**',
  '.expo-shared/**',
  'dist/**',
  'build/**',
  'coverage/**',
];

export default [
  {
    ignores: projectIgnores,
  },
  ...expoConfig,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'import/first': 'off',
      'import/newline-after-import': 'warn',
      'import/no-duplicates': 'warn',
      'import/no-named-as-default': 'off',
      'react/jsx-no-useless-fragment': 'warn',
      'react/self-closing-comp': 'warn',
      'react-native/no-inline-styles': 'off',
      'simple-import-sort/exports': 'warn',
      'simple-import-sort/imports': 'warn',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  eslintConfigPrettier,
];
