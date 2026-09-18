// V40-02: configuración mínima de ESLint (flat config) para el stack actual:
// JavaScript + JSX + React 19 + Vite. Sin TypeScript, sin plugins de framework.
// Filosofía: solo errores reales fallan el lint; el estilo preexistente genera
// warnings documentados (no se reescribe producción para satisfacer estilo).
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'public/**'],
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
    },
    rules: {
      // Errores reales: rompen o indican bugs.
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-ex-assign': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-setter-return': 'error',
      'no-this-before-super': 'error',
      'no-undef-init': 'error',
      'constructor-super': 'error',
      'for-direction': 'error',
      'getter-return': 'error',
      'no-async-promise-executor': 'error',
      'no-compare-neg-zero': 'error',
      'no-cond-assign': 'error',
      'no-control-regex': 'error',
      'no-debugger': 'error',
      'no-dupe-else-if': 'error',
      'no-dupe-class-members': 'error',
      'no-extra-boolean-cast': 'error',
      'no-invalid-regexp': 'error',
      'no-irregular-whitespace': 'error',
      'no-loss-of-precision': 'error',
      'no-misleading-character-class': 'error',
      'no-new-symbol': 'error',
      'no-nonoctal-decimal-escape': 'error',
      'no-obj-calls': 'error',
      'no-octal': 'error',
      'no-prototype-builtins': 'error',
      'no-regex-spaces': 'error',
      'no-self-assign': 'error',
      'no-sparse-arrays': 'error',
      'no-template-curly-in-string': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-optional-chaining': 'error',
      // - 'no-unused-expressions': se permiten short-circuit (`a&&b()`) y
      //   ternarios, patrones intencionales en este codebase (p.ej.
      //   `onChange&&onChange()`); el resto de expresiones muertas sigue
      //   siendo error.
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'no-useless-backreference': 'error',
      'no-useless-catch': 'warn',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      // Estilo/legado: warnings, no bloquean (código preexistente intacto).
      // - 'no-unused-vars': el codebase usa patrones con imports/funciones
      //   reservadas y catch vacíos intencionales; reescribirlos es V40-0X.
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      // - 'no-case-declarations': switch con let preexistente en producción.
      'no-case-declarations': 'warn',
      // - 'no-fallthrough': flujos legacy con fallthrough comentado.
      'no-fallthrough': 'warn',
    },
  },
  {
    // Config, tests y scripts: entorno node además de browser.
    files: ['*.config.js', 'src/test/**/*.js', 'src/**/*.test.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
