/* eslint-disable new-cap */
import path from 'node:path'

import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import Vue from '@vitejs/plugin-vue'
import VueJsx from '@vitejs/plugin-vue-jsx'
import PostcssNesting from 'postcss-nesting'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Info from 'unplugin-info/vite'
import TurboConsole from 'unplugin-turbo-console/vite'
import Components from 'unplugin-vue-components/vite'
import VueReactivityFunction from 'unplugin-vue-reactivity-function/vite'
import { defineConfig } from 'vite'
import VueDevTools from 'vite-plugin-vue-devtools'
import MetaLayouts from 'vite-plugin-vue-meta-layouts'
import VueMacros from 'vue-macros/vite'
import { VueRouterAutoImports } from 'vue-router/unplugin'
import VueRouter from 'vue-router/vite'
import 'vitest/config'

const host = process.env.TAURI_DEV_HOST
const isVitest = Boolean(process.env.VITEST)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    VueMacros({
      plugins: {
        vue: Vue(),
        vueJsx: VueJsx(),
        vueRouter: VueRouter({
          routesFolder: 'src/views',
          dts: 'src/route-map.d.ts',
        }),
      },
      shortVmodel: {
        prefix: '::',
      },
      betterDefine: false,
    }),
    VueReactivityFunction({
      ignore: ['$fetch'],
    }),
    MetaLayouts(),
    AutoImport({
      imports: [
        'vue',
        'vue-i18n',
        '@vueuse/core',
        VueRouterAutoImports,
        {
          '@tauri-apps/plugin-log': [['*', 'logger']],
          'notivue': [['push', 'notify']],
          'vue-sonner': ['toast'],
        },
      ],
      dts: 'src/auto-imports.d.ts',
      dtsMode: 'overwrite',
      vueTemplate: true,
    }),
    Components({
      dts: 'src/components.d.ts',
    }),
    UnoCSS(),
    VueI18nPlugin({
      include: [path.resolve(import.meta.dirname, './src/locales/**')],
    }),
    Info({
      meta: {
        isDebug: !!process.env.TAURI_ENV_DEBUG,
        isBuild: process.env.GITHUB_WORKFLOW === 'Build',
        isRelease: process.env.GITHUB_WORKFLOW === 'Release',
        prNum: process.env.GITHUB_PR_NUMBER,
        buildSha: process.env.GITHUB_BUILD_SHA,
      },
    }),
    !isVitest && TurboConsole(),
    !isVitest && VueDevTools(),
  ],

  resolve: {
    alias: {
      '~/': `${path.resolve(import.meta.dirname, 'src')}/`,
    },
  },

  css: {
    postcss: {
      plugins: [PostcssNesting()],
    },
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },

  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'src/**/*.spec.ts',
        'src/locales/**',
      ],
    },
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/__tests__/**/*.test.ts'],
          exclude: ['node_modules', 'dist', 'src-tauri'],
          setupFiles: ['src/__tests__/setup.ts'],
        },
        extends: true,
      },
    ],
  },
})
