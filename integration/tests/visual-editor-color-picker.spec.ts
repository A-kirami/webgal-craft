import { expect, test } from '@playwright/test'

import { enterEditorFromCreatedGame, launchCraftApp, openStartSceneFile, replaceSceneText } from '../support/editor-flow'

import type { Locator, Page } from '@playwright/test'

const OPEN_POPOVER = '[id^="reka-popover-content"][data-state="open"]'
const AREA = `${OPEN_POPOVER} [data-testid="color-picker-area"]`
const PANEL_HEX_FIELD = `${OPEN_POPOVER} [data-testid="color-picker-panel-hex-field"]`

interface ColorFieldHandles {
  /** 选择器触发器上显示应用侧当前色值的输入框 */
  appValue: Locator
  /** 面板内的色值框（拖拽过程中实时反映本地颜色） */
  panelValue: Locator
  areaBox: { x: number, y: number, width: number, height: number }
}

async function openStatementColorField(page: Page): Promise<ColorFieldHandles> {
  const card = page.getByRole('option').filter({ hasText: 'Fullscreen Text' }).first()
  await expect(card).toBeVisible({ timeout: 6_0000 })
  await card.click()

  const trigger = card.getByRole('button', { name: /Font Color|字体颜色/ }).first()
  // 触发器与色值框同属一个胶囊：从触发按钮向上取所属胶囊内的第一个输入框
  const pill = trigger.locator('xpath=ancestor::*[@data-slot="input-group"][1]')
  const appValue = pill.locator('input').first()

  await trigger.click()

  const area = page.locator(AREA)
  await expect(area).toBeVisible()
  const areaBox = await area.boundingBox()
  if (!areaBox) {
    throw new Error('色板没有布局盒')
  }

  return {
    appValue,
    panelValue: page.locator(PANEL_HEX_FIELD),
    areaBox,
  }
}

test.describe('可视化编辑器颜色选择器', () => {
  test('拖拽色板期间不改写语句，松手后一次性写入最终色值', async ({ page }) => {
    // 建游戏 → 进编辑器 → 打开场景 → 切可视化 → 拖拽 → 撤销 是一条连续流程，冷启动下超过默认的 30s
    test.slow()

    await launchCraftApp(page, { persistedStores: { preference: { editorMode: 'text' } } })
    await enterEditorFromCreatedGame(page)
    await openStartSceneFile(page)
    await replaceSceneText(page, '; WebGAL scene\nintro:颜色拖拽测试 -fontColor=#FF0000;')

    await page.getByRole('button', { name: /切换可视化|Switch to Visual/ }).click()
    const { appValue, panelValue, areaBox } = await openStatementColorField(page)

    await expect(appValue).toHaveValue('FF0000')

    // 从色板中心按下并连续拖拽：中途读到的应用色值必须仍是拖拽前的值
    const center = { x: areaBox.x + areaBox.width / 2, y: areaBox.y + areaBox.height / 2 }
    await page.mouse.move(center.x, center.y)
    await page.mouse.down()
    await page.mouse.move(center.x + 24, center.y - 16, { steps: 6 })
    await page.mouse.move(center.x + 48, center.y - 32, { steps: 6 })

    const draggedValue = await panelValue.inputValue()
    expect(draggedValue).toMatch(/^[0-9A-F]{6}$/)
    expect(draggedValue).not.toBe('FF0000')
    await expect(appValue).toHaveValue('FF0000')

    // 松手后才把拖拽结果写入语句
    await page.mouse.up()
    await expect(appValue).toHaveValue(draggedValue)

    // 面板保持打开、焦点仍在面板内时，编辑器上下文不应失效：撤销由编辑器快捷键层接管。
    // 只断言色值会误判——文本编辑器还注册了一条全局 Ctrl+Z 兜底命令，这里看的是快捷键层是否真的命中。
    await page.evaluate(() => {
      const handled: boolean[] = []
      ;(globalThis as unknown as { __shortcutHandled?: boolean[] }).__shortcutHandled = handled
      globalThis.addEventListener('keydown', (event) => {
        if ((event as KeyboardEvent).key.toLowerCase() === 'z') {
          handled.push(event.defaultPrevented)
        }
      })
    })

    await page.keyboard.press('ControlOrMeta+Z')

    const shortcutHandled = await page.evaluate(() => (globalThis as unknown as { __shortcutHandled?: boolean[] }).__shortcutHandled ?? [])
    expect(shortcutHandled).toEqual([true])
    await expect(appValue).toHaveValue('FF0000')

    // 可视化编辑器撤销后会把焦点移回所选语句卡片；面板不应因此被关掉
    await expect(panelValue).toBeVisible()
  })
})
