import { expect, test } from '@playwright/test'

import { enterEditorFromCreatedGame, launchCraftApp, openStartSceneFile } from '../support/editor-flow'

// 弹窗内容宽度约 408px：这条路径必须由容器截断，而不是把弹窗内容撑宽
const LONG_BACKGROUND_PATH = 'background/very-long-directory-name/another-extremely-long-directory/background-file-name-v2.webp'
// webgal-parser 的 commandType.changeBg（集成测试无法直接导入 node_modules 内的 TS 源码）
const CHANGE_BG_TYPE = 1

test.describe('默认命令弹窗文件选择器', () => {
  test('编辑默认值时长路径不撑宽弹窗', async ({ page }) => {
    // 建游戏 → 进编辑器 → 打开场景 → 打开默认值弹窗是一条连续流程，冷启动下超过默认的 30s
    test.slow()

    await launchCraftApp(page, {
      persistedStores: {
        'command-panel': { defaults: { [CHANGE_BG_TYPE]: `changeBg:${LONG_BACKGROUND_PATH};` } },
      },
    })
    await enterEditorFromCreatedGame(page)
    await openStartSceneFile(page)

    const commandCard = page.locator(`[data-command-panel-command-type="${CHANGE_BG_TYPE}"]`)
    await commandCard.hover()
    await commandCard.getByRole('button', { name: /Edit defaults|编辑默认值/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const picker = dialog.getByRole('textbox').first()
    await expect(picker).toHaveValue(LONG_BACKGROUND_PATH)

    const metrics = await dialog.evaluate((element) => {
      const input = element.querySelector('input')
      return {
        // 弹窗是 grid 容器，被内容撑宽会体现在 scrollWidth 上
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        inputRight: input?.getBoundingClientRect().right ?? 0,
        // DialogScrollContent 的 p-5 内边距
        contentRight: element.getBoundingClientRect().right - 20,
      }
    })

    expect(metrics.scrollWidth).toBe(metrics.clientWidth)
    expect(metrics.inputRight).toBeLessThanOrEqual(metrics.contentRight)
  })
})
