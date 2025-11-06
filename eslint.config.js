import { fileURLToPath } from 'node:url'

import { includeIgnoreFile } from '@eslint/compat'
import eslint from '@eslint/js'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import stylistic from '@stylistic/eslint-plugin'
import unocss from '@unocss/eslint-config/flat'
import vueMacros from '@vue-macros/eslint-config'
import { defineConfig } from 'eslint/config'
import eslintPluginImportX from 'eslint-plugin-import-x'
import eslintPluginUnicorn from 'eslint-plugin-unicorn'
import eslintPluginVue from 'eslint-plugin-vue'
import eslintPluginYml from 'eslint-plugin-yml'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const gitignorePath = fileURLToPath(new URL('.gitignore', import.meta.url))

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.stylistic,
  eslintPluginUnicorn.configs.recommended,
  eslintPluginImportX.flatConfigs.recommended,
  eslintPluginImportX.flatConfigs.typescript,
  stylistic.configs.recommended,
  ...eslintPluginVue.configs['flat/recommended'],
  ...vueI18n.configs.recommended,
  ...eslintPluginYml.configs['flat/recommended'],
  unocss,
  vueMacros,
  includeIgnoreFile(gitignorePath),
  {
    ignores: [
      '.husky',
      'src-tauri',
      '**/components/ui',
      '**/auto-import?(s).d.ts',
      '**/components.d.ts',
      '**/typed-router.d.ts',
    ],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx,cjs,mjs,vue}'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'object-shorthand': ['warn', 'always'],
      'array-callback-return': 'error',
      'camelcase': 'warn',
      'consistent-this': ['error', 'that'],
      'curly': 'error',
      'default-case': 'error',
      'default-case-last': 'error',
      'default-param-last': 'error',
      'dot-notation': 'error',
      'eqeqeq': 'error',
      'func-names': ['error', 'as-needed'],
      'guard-for-in': 'error',
      'new-cap': 'error',
      'no-await-in-loop': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'warn',
      'accessor-pairs': 'error',
      'no-undef': 'off',
      'no-alert': 'error',
      'no-eval': 'error',
      '@stylistic/brace-style': ['error', '1tbs'],
      '@stylistic/dot-location': ['error', 'property'],
      '@stylistic/newline-per-chained-call': ['warn', { ignoreChainWithDepth: 3 }],
      '@stylistic/operator-linebreak': ['warn', 'before', { overrides: { '=': 'after' } }],
      '@stylistic/generator-star-spacing': ['warn', {
        before: false,
        after: true,
        shorthand: 'before',
      }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-unused-expressions': ['error', {
        allowShortCircuit: true,
        allowTernary: true,
        enforceForJSX: true,
      }],
      '@typescript-eslint/no-inferrable-types': ['warn', { ignoreParameters: true, ignoreProperties: true }],
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-unresolved': ['error', { ignore: ['^virtual:', '^~(?!/).*'] }],
      'import-x/order': [
        'warn',
        {
          'groups': ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'object', 'type'],
          'newlines-between': 'always',
          'alphabetize': { order: 'asc', orderImportKind: 'asc', caseInsensitive: true },
          'named': true,
        },
      ],
      'import-x/newline-after-import': 'warn',
      'import-x/consistent-type-specifier-style': 'warn',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/numeric-separators-style': ['warn', { number: { groupLength: 4 } }],
      'unicorn/prefer-add-event-listener': [
        'error', {
          excludedPackages: [
            '@tauri-apps/api/core',
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'unicorn/filename-case': [
        'error',
        {
          case: 'pascalCase',
        },
      ],
    },
  },
  {
    ignores: ['**/layouts'],
    rules: {
      'unicorn/filename-case': 'off',
    },
  },
  {
    rules: {
      '@intlify/vue-i18n/key-format-style': 'warn',
      '@intlify/vue-i18n/no-duplicate-keys-in-locale': 'error',
      '@intlify/vue-i18n/no-dynamic-keys': 'error',
      '@intlify/vue-i18n/no-missing-keys-in-other-locales': 'error',
      '@intlify/vue-i18n/no-unknown-locale': 'error',
      '@intlify/vue-i18n/no-unused-keys': 'warn',
      '@intlify/vue-i18n/prefer-sfc-lang-attr': 'warn',
      '@intlify/vue-i18n/no-raw-text': [
        'warn',
        {
          ignorePattern: '^[-0-9+*/.,!@#$%^&()\\[\\]{}<>?;:"\'`~|\\\\]+$',
        },
      ],
    },
    settings: {
      'vue-i18n': {
        localeDir: './src/locales/*.{json,json5,yaml,yml}',
        messageSyntaxVersion: '^11.0.0',
      },
    },
  },
)
