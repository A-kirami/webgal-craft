import { fileURLToPath } from 'node:url'

import eslint from '@eslint/js'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import stylistic from '@stylistic/eslint-plugin'
import unocss from '@unocss/eslint-config/flat'
import vueMacros from '@vue-macros/eslint-config'
import { defineConfig, includeIgnoreFile } from 'eslint/config'
import eslintPluginImportX from 'eslint-plugin-import-x'
import eslintPluginUnicorn from 'eslint-plugin-unicorn'
import eslintPluginVue from 'eslint-plugin-vue'
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
  unocss,
  vueMacros,
  includeIgnoreFile(gitignorePath),
  {
    ignores: [
      '.husky',
      'src-tauri',
      '**/components/ui',
      '**/components/app/window-controls',
      '**/auto-imports.d.ts',
      '**/components.d.ts',
      '**/route-map.d.ts',
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
      'import-x/no-unresolved': ['error',
        {
          ignore: [
            '^virtual:',
            '^~(?!/).*',
            String.raw`^/.*\.(svg|png|jpg|jpeg|gif|ico|webp)$`,
            String.raw`.*\?(url|inline|no-inline|raw|worker|sharedworker)$`,
          ],
        },
      ],
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
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: '@tauri-apps/api/path',
            importNames: ['join', 'dirname', 'basename', 'normalize', 'sep', 'resolve'],
            message: '路径拼接请使用 src/domain/path',
          },
        ],
      }],
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
      'unicorn/no-useless-undefined': ['warn', { checkArguments: false, checkArrowFunctionBody: false }],
      'no-useless-assignment': 'off',
      'unicorn/prefer-https': 'off', // SVG data URI 中的链接不受控制，禁止启用该规则
    },
  },
  {
    files: ['**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/require-default-prop': 'off',
      'unicorn/filename-case': [
        'error',
        {
          case: 'pascalCase',
        },
      ],
    },
  },
  {
    files: [
      '**/*.{spec,test}.{js,jsx,ts,tsx,vue}',
      '**/{__tests__,tests}/**/*.{js,jsx,ts,tsx,vue}',
    ],
    rules: {
      'vue/one-component-per-file': 'off',
      'vue/require-default-prop': 'off',
    },
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx,vue}'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: String.raw`CallExpression[callee.property.name='replaceAll'] Literal[value='\\']`,
          message: String.raw`禁止裸 replaceAll("\\", "/")，请使用 ~/domain/path。`,
        },
        {
          selector: String.raw`CallExpression[callee.property.name='replace'] Literal[value='\\']`,
          message: String.raw`禁止裸 replace("\\", "/")，请使用 ~/domain/path。`,
        },
        {
          selector: String.raw`CallExpression[callee.property.name='replace'] Literal[regex.pattern='\\\\'][regex.flags='g']`,
          message: String.raw`禁止裸 replace(/\\\\/g, "/")，请使用 ~/domain/path。`,
        },
        {
          selector: 'TSAsExpression > TSTypeReference[typeName.name=/^(AbsPath|RelPath|LookupPathKey)$/]',
          message: '禁止用 as AbsPath/RelPath/LookupPathKey 绕过路径工厂，请通过 ~/domain/path 或 ~/services/resource-path/lookup 构造。',
        },
      ],
    },
  },
  {
    files: ['src/domain/path/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-namespace': 'off',
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
      '@intlify/vue-i18n/no-unused-keys': [
        'warn',
        {
          src: './src',
          extensions: ['.js', '.ts', '.vue'],
        },
      ],
      '@intlify/vue-i18n/prefer-sfc-lang-attr': 'warn',
      '@intlify/vue-i18n/no-raw-text': [
        'warn',
        {
          ignorePattern: '^[-\\s0-9+*/.,=!@#$%^&()\\[\\]{}<>?;:"\'`~|\\\\×—]+$',
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
