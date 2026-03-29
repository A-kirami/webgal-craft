import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // 集成测试共享同一个前端 dev server 和 Tauri mock 运行时，本地并发会放大时序竞态。
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'bun run dev:web',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
  },
})
