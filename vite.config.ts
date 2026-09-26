/* eslint-disable new-cap */
import path from 'node:path'

import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import Vue from '@vitejs/plugin-vue'
import VueJsx from '@vitejs/plugin-vue-jsx'
import { playwright } from '@vitest/browser-playwright'
import PostcssNesting from 'postcss-nesting'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Info from 'unplugin-info/vite'
import TurboConsole from 'unplugin-turbo-console/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'
import VueDevTools from 'vite-plugin-vue-devtools'
import MetaLayouts from 'vite-plugin-vue-meta-layouts'
import VueMacros from 'vue-macros/vite'
import { VueRouterAutoImports } from 'vue-router/unplugin'
import VueRouter from 'vue-router/vite'
import 'vitest/config'

const host = process.env.TAURI_DEV_HOST
const disableDevTools = Boolean(
  process.env.VITEST || process.env.WEBGALCRAFT_INTEGRATION_TEST,
)

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
    MetaLayouts(),
    AutoImport({
      imports: [
        'vue',
        'vue-i18n',
        '@vueuse/core',
        VueRouterAutoImports,
        {
          '@tauri-apps/plugin-log': [['*', 'logger']],
          'vue-sonner': ['toast'],
        },
      ],
      dts: 'src/auto-imports.d.ts',
      dtsMode: 'overwrite',
      vueTemplate: true,
    }),
    Components({
      dts: 'src/components.d.ts',
      syncMode: 'overwrite',
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
    !disableDevTools && TurboConsole(),
    !disableDevTools && VueDevTools(),
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
      // 3. tell vite to ignore watching backend, test files and generated types
      ignored: [
        '**/src-tauri/**',
        '**/{__tests__,integration}/**',
        '**/*.{spec,test}.{js,jsx,ts,tsx,mjs,mts,cjs,cts}',
        // Plugins rewrite these declarations on every startup even when the
        // content is unchanged; they are never part of the module graph, so a
        // watch event on them can only degrade into a full page reload.
        '**/auto-imports.d.ts',
        '**/components.d.ts',
        '**/route-map.d.ts',
      ],
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
          exclude: [
            'node_modules',
            'dist',
            'src-tauri',
            'src/**/__tests__/**/*.browser.test.ts',
          ],
          setupFiles: ['src/__tests__/setup.ts'],
        },
        extends: true,
      },
      {
        test: {
          name: 'browser',
          maxWorkers: 4,
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: 'chromium' }],
            locators: { exact: false },
          },
          // 组件浏览器测试使用 .spec.ts，非组件但依赖浏览器环境的测试使用 __tests__/*.browser.test.ts。
          include: [
            'src/**/*.spec.ts',
            'src/**/__tests__/**/*.browser.test.ts',
          ],
        },
        extends: true,
        // 浏览器测试可达的运行时依赖必须在此登记。
        //
        // noDiscovery: true 关闭了 Vite 的运行期依赖发现，未登记的依赖只能按源文件逐个请求；
        // 浏览器模式默认每个测试文件新建 iframe 并重新导入整张模块图，这份成本会乘以测试文件数。
        // 反过来也不能取消 noDiscovery：运行期重新预构建会触发 iframe 整页 reload，
        // 轻则重复执行用例，重则让整轮运行永久挂起。
        //
        // 名单与依赖之间没有自动约束。新增依赖后如果相关测试变慢，先检查这里是否漏登记；
        // 校验方法是 node_modules/.vite/vitest/<hash>/deps/_metadata.json 的 optimized 键数量。
        optimizeDeps: {
          noDiscovery: true,
          include: [
            '@floating-ui/vue',
            '@lucide/vue',
            '@tanstack/vue-virtual',
            '@tauri-apps/api/app',
            '@tauri-apps/api/core',
            '@tauri-apps/api/dpi',
            '@tauri-apps/api/event',
            '@tauri-apps/api/path',
            '@tauri-apps/api/webview',
            '@tauri-apps/api/webviewWindow',
            '@tauri-apps/plugin-dialog',
            '@tauri-apps/plugin-fs',
            '@tauri-apps/plugin-log',
            '@tauri-apps/plugin-opener',
            '@tauri-apps/plugin-os',
            '@tauri-apps/plugin-process',
            '@tauri-apps/plugin-updater',
            '@vueuse/core',
            'class-variance-authority',
            'compare-versions',
            'dayjs',
            'dayjs/locale/en',
            'dayjs/locale/ja',
            'dayjs/locale/zh-cn',
            'dayjs/locale/zh-tw',
            'dayjs/plugin/relativeTime',
            'dexie',
            'dompurify',
            'driver.js',
            'lru-cache',
            'markdown-it',
            'mime',
            'monaco-editor',
            'pinia',
            'pinia-plugin-persistedstate',
            'reka-ui',
            'sanitize-filename',
            'tailwind-merge',
            'vee-validate',
            'vue',
            'vue-i18n',
            'vue-router',
            'vue-sonner',
            'wavesurfer.js',
            'webgal-parser',
            'webgal-parser/src/config/scriptConfig',
            'webgal-parser/src/interface/sceneInterface',
            'zod',
          ],
        },
      },
    ],
  },
})
