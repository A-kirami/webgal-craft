import { expect, test } from '@playwright/test'

import {
  launchAppWithSeededProject,
  openSeededProject,
  readRegisteredEngineId,
  SEEDED_ENGINE,
} from '../support/seeded-project'

const PROJECT_CONFIG = { version: 1, engine: { id: SEEDED_ENGINE.engineId, version: SEEDED_ENGINE.version } }
const DANGLING_ENGINE_ID = 'engine-missing-record'

test.describe('从首页进入工程', () => {
  test('工程存在上次会话遗留的标签页时，进入后直接显示文件内容', async ({ page }) => {
    const project = {
      id: 'restored-tabs-game',
      name: 'Restored Tabs Game',
      path: 'C:/Games/RestoredTabsGame',
      engineId: SEEDED_ENGINE.id,
      projectConfig: PROJECT_CONFIG,
      restoreStartSceneTab: true,
      sceneText: '重新进入工程后应当直接看到这段内容。',
    }

    await launchAppWithSeededProject(page, project)
    await openSeededProject(page, project.name)

    await expect(page.getByRole('button', { name: /Test Game|测试游戏/ })).toBeVisible()
    await expect(page.getByText(project.sceneText)).toBeVisible({ timeout: 1_0000 })
  })

  test('绑定悬空但项目配置能解析到已安装引擎时，进入即自愈并回写绑定', async ({ page }) => {
    const project = {
      id: 'dangling-binding-game',
      name: 'Dangling Binding Game',
      path: 'C:/Games/DanglingBindingGame',
      engineId: DANGLING_ENGINE_ID,
      projectConfig: PROJECT_CONFIG,
      restoreStartSceneTab: true,
      sceneText: '绑定悬空自愈后应当看到这段内容。',
    }

    await launchAppWithSeededProject(page, project)
    await openSeededProject(page, project.name)

    await expect(page.getByRole('button', { name: /Test Game|测试游戏/ })).toBeVisible()
    await expect(page.getByText(project.sceneText)).toBeVisible({ timeout: 1_0000 })
    await expect.poll(async () => await readRegisteredEngineId(page, project.id)).toBe(SEEDED_ENGINE.id)
  })

  test('绑定悬空且项目配置也解析不出引擎时，点击工程给出重选运行时的入口', async ({ page }) => {
    const project = {
      id: 'unrecoverable-binding-game',
      name: 'Unrecoverable Binding Game',
      path: 'C:/Games/UnrecoverableBindingGame',
      engineId: DANGLING_ENGINE_ID,
      // 没有 engine 引用：既修不了绑定，也没有可展示的当前引擎
      projectConfig: { version: 1 },
    }

    await launchAppWithSeededProject(page, project)

    // 关键回归：过去这里毫无反应——不跳转、不弹窗、不提示
    const gameCard = page.getByRole('heading', { name: project.name }).locator('xpath=..')
    await expect(gameCard).toBeVisible()
    await gameCard.click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })
})
