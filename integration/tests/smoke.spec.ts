import { expect, test } from '@playwright/test'

test.describe('应用冒烟测试', () => {
  test('首页可正常加载', async ({ page }) => {
    await page.goto('/')
    // 等待 Vue 应用挂载完成
    await page.waitForSelector('#app', { state: 'attached' })
    // 页面标题应包含应用名称
    await expect(page).toHaveTitle(/WebGAL/)
  })
})
