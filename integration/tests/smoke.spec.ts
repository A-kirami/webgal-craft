import { expect, test } from '@playwright/test'

import { HOME_CREATE_GAME_BUTTON_NAME, launchCraftApp } from '../support/editor-flow'

test.describe('应用冒烟测试', () => {
  test('首页可正常加载', async ({ page }) => {
    await launchCraftApp(page)

    await expect(page.getByRole('button', { name: HOME_CREATE_GAME_BUTTON_NAME })).toBeVisible()

    // 页面标题应包含应用名称
    await expect(page).toHaveTitle(/WebGAL/)
  })

  test('启动集成测试应用后 Tauri mock 已完成初始化', async ({ page }) => {
    await launchCraftApp(page)

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const tauriMockGlobal = globalThis as typeof globalThis & {
          __TAURI_MOCK_PENDING__?: boolean
          __TAURI_MOCK_READY__?: boolean
        }

        return {
          pending: tauriMockGlobal.__TAURI_MOCK_PENDING__ ?? true,
          ready: tauriMockGlobal.__TAURI_MOCK_READY__ ?? false,
        }
      })
    }).toEqual({
      pending: false,
      ready: true,
    })
  })
})
