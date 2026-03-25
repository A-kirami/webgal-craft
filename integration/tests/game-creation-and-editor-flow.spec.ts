import { expect, test } from '@playwright/test'

import {
  createGameFromHome,
  enterEditorFromCreatedGame,
  expectSavedStatus,
  expectTestWindowOpened,
  expectUnsavedStatus,
  launchCraftApp,
  openStartSceneFile,
  replaceSceneText,
} from '../support/editor-flow'

test.describe('创建游戏与编辑器流程', () => {
  test('用户可以从首页创建新游戏', async ({ page }) => {
    await launchCraftApp(page)

    await createGameFromHome(page)
  })

  test('创建完成后可以进入编辑器页面', async ({ page }) => {
    await launchCraftApp(page)

    await enterEditorFromCreatedGame(page)
    await expect(page.getByRole('button', { name: /Test Game|测试游戏/ })).toBeVisible()
  })

  test('进入编辑器后可以打开测试窗口', async ({ page }) => {
    await launchCraftApp(page)

    await enterEditorFromCreatedGame(page)

    const testGameButton = page.getByRole('button', { name: /Test Game|测试游戏/ })
    await expect(testGameButton).toBeEnabled()

    await testGameButton.click()

    await expectTestWindowOpened(page)
  })

  test('进入编辑器后可以打开场景文件标签页', async ({ page }) => {
    await launchCraftApp(page)

    await enterEditorFromCreatedGame(page)
    await openStartSceneFile(page)
  })

  test('进入编辑器后可以编辑并保存场景文件', async ({ page }) => {
    await launchCraftApp(page)

    await enterEditorFromCreatedGame(page)
    await openStartSceneFile(page)
    await expectSavedStatus(page)

    await replaceSceneText(page, '; WebGAL scene\nintro:保存后的场景文本。')
    await expectUnsavedStatus(page)

    await page.keyboard.press('ControlOrMeta+S')
    await expectSavedStatus(page)
  })

  test('关闭未保存标签页时可以保存并在重新打开后保留内容', async ({ page }) => {
    await launchCraftApp(page)

    await enterEditorFromCreatedGame(page)
    await openStartSceneFile(page)

    await replaceSceneText(page, '; WebGAL scene\nintro:重新打开后仍然保留。')
    await expectUnsavedStatus(page)

    const fileTab = page.getByRole('button', { name: /start\.txt Close/ }).first()
    await fileTab.click({ button: 'middle' })

    const saveChangesDialog = page.getByRole('alertdialog')
    await expect(saveChangesDialog).toBeVisible()
    await saveChangesDialog.getByRole('button', { name: /^(Save|保存|儲存)$/ }).click()

    await expect(page.getByRole('button', { name: /start\.txt Close/ })).toHaveCount(0)
    await expect(saveChangesDialog).toBeHidden()

    await openStartSceneFile(page)
    await expect(page.getByText('重新打开后仍然保留。')).toBeVisible()
    await expectSavedStatus(page)
  })

  test('关闭未保存标签页时可以放弃更改并在重新打开后恢复原内容', async ({ page }) => {
    await launchCraftApp(page, {
      persistedStores: {
        'edit-settings': {
          autoSave: false,
        },
      },
    })

    await enterEditorFromCreatedGame(page)
    await openStartSceneFile(page)

    await replaceSceneText(page, '; WebGAL scene\nintro:未保存的内容不会被保留。')
    await expectUnsavedStatus(page)

    const fileTab = page.getByRole('button', { name: /start\.txt Close/ }).first()
    await fileTab.click({ button: 'middle' })

    const saveChangesDialog = page.getByRole('alertdialog')
    await expect(saveChangesDialog).toBeVisible()
    await saveChangesDialog.getByRole('button', { name: /^(Don't Save|不保存)$/ }).click()

    await expect(page.getByRole('button', { name: /start\.txt Close/ })).toHaveCount(0)
    await expect(saveChangesDialog).toBeHidden()

    await openStartSceneFile(page)
    await expect(page.getByText('欢迎来到集成测试。')).toBeVisible()
    await expect(page.getByText('未保存的内容不会被保留。')).toHaveCount(0)
    await expectSavedStatus(page)
  })
})
