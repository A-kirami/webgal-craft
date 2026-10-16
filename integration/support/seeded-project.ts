import { expect } from '@playwright/test'

import { installMockTauri, waitForMockTauriReady } from './mock-tauri'
import { TOUR_PERSISTENCE } from '../../src/features/onboarding/tour-version'

import type { Page } from '@playwright/test'

/** mock 运行时里的默认引擎记录（见 mock-tauri 的 defaultSeedEngine） */
export const SEEDED_ENGINE = {
  id: 'engine-default',
  engineId: 'WebGAL',
  version: '1.0.0',
} as const

export interface SeededProject {
  /** 游戏记录里的引擎绑定；给一个不存在的记录即可复现悬空绑定 */
  engineId: string
  id: string
  name: string
  path: string
  /** 写入 project.wgcp 的内容；省略时不写文件（等价于没有逻辑引擎引用） */
  projectConfig?: Record<string, unknown>
  /** 是否预置上次会话遗留的 start.txt 标签页 */
  restoreStartSceneTab?: boolean
  sceneText?: string
}

/**
 * 启动应用并预置一个已登记工程 + 可选的遗留标签页。
 * mock runtime 每次页面加载都会清空 IndexedDB，所以工程记录必须在初始化脚本里重建：
 * 先通过 mock 的 fs 命令落盘工程文件，再写入游戏记录，最后等待预置完成。
 */
export async function launchAppWithSeededProject(page: Page, project: SeededProject): Promise<void> {
  const scenePath = `${project.path}/game/scene/start.txt`
  const configPath = `${project.path}/game/config.txt`
  const sceneText = project.sceneText ?? '预置工程里的场景内容。'
  const game = {
    id: project.id,
    path: project.path,
    pathLookupKey: project.path.toLowerCase(),
    engineId: project.engineId,
    createdAt: Date.now(),
    lastModified: Date.now(),
    status: 'created',
    availability: 'available',
    metadata: { name: project.name },
    previewAssets: {
      icon: { path: `${project.path}/game/favicon.ico` },
      cover: { path: `${project.path}/game/background/cover.png` },
    },
  }

  await installMockTauri(page)

  await page.addInitScript((seed) => {
    const globals = globalThis as typeof globalThis & {
      __TAURI_INTERNALS__?: {
        invoke: (command: string, args?: unknown, options?: unknown) => Promise<unknown>
      }
      __SEED_READY__?: boolean
      __SEED_ERROR__?: string
    }

    for (const { storageKey, version } of seed.tourPersistence) {
      localStorage.setItem(storageKey, version)
    }

    if (seed.restoreTab) {
      localStorage.setItem('tabs', JSON.stringify({
        projectTabsMap: {
          [seed.game.id]: {
            activeTabIndex: 0,
            tabs: [{
              name: 'start.txt',
              path: seed.scenePath,
              activeAt: Date.now(),
              isPreview: false,
            }],
          },
        },
      }))
    }

    globals.__SEED_READY__ = false
    void (async () => {
      try {
        const internals = globals.__TAURI_INTERNALS__
        if (!internals) {
          throw new Error('缺少 Tauri mock runtime')
        }

        const writeFile = async (path: string, content: string) => {
          await internals.invoke('plugin:fs|write_file', new TextEncoder().encode(content), {
            headers: { path },
          })
        }

        await internals.invoke('plugin:fs|mkdir', { path: seed.game.path })
        await internals.invoke('plugin:fs|mkdir', { path: `${seed.game.path}/game` })
        await internals.invoke('plugin:fs|mkdir', { path: `${seed.game.path}/game/scene` })
        await writeFile(seed.scenePath, seed.sceneText)
        // inspectGameStructure 依赖 game/config.txt 判定工程结构有效
        await writeFile(
          seed.configPath,
          `Game_name:${seed.game.metadata.name}\nGame_key:seeded\nTitle_img:\nDescription:\nPackage_name:craft.seeded\n`,
        )
        if (seed.projectConfig) {
          await internals.invoke('write_project_config_cmd', {
            projectPath: seed.game.path,
            config: seed.projectConfig,
          })
        }

        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('WebGALCraft')
          request.addEventListener('error', () => reject(request.error))
          request.addEventListener('success', () => {
            const database = request.result
            const transaction = database.transaction('games', 'readwrite')
            transaction.objectStore('games').put(seed.game)
            transaction.addEventListener('complete', () => {
              database.close()
              resolve()
            })
            transaction.addEventListener('error', () => reject(transaction.error))
          })
        })

        globals.__SEED_READY__ = true
      } catch (error) {
        globals.__SEED_ERROR__ = error instanceof Error ? error.message : String(error)
      }
    })()
  }, {
    configPath,
    game,
    projectConfig: project.projectConfig,
    restoreTab: project.restoreStartSceneTab ?? false,
    scenePath,
    sceneText,
    tourPersistence: Object.values(TOUR_PERSISTENCE),
  })

  await page.goto('/')
  await waitForMockTauriReady(page)
  await page.waitForFunction(() => {
    const appRoot = document.querySelector('#app')
    return Boolean(appRoot && appRoot.childElementCount > 0)
  })
  await page.waitForFunction(() => {
    const globals = globalThis as typeof globalThis & {
      __SEED_READY__?: boolean
      __SEED_ERROR__?: string
    }
    return globals.__SEED_READY__ === true || typeof globals.__SEED_ERROR__ === 'string'
  })

  const seedError = await page.evaluate(() => {
    const globals = globalThis as typeof globalThis & { __SEED_ERROR__?: string }
    return globals.__SEED_ERROR__
  })
  if (seedError) {
    throw new Error(`预置工程失败: ${seedError}`)
  }
}

/** 从首页进入预置工程 */
export async function openSeededProject(page: Page, projectName: string): Promise<void> {
  const gameCard = page.getByRole('heading', { name: projectName }).locator('xpath=..')
  await expect(gameCard).toBeVisible()
  await Promise.all([
    page.waitForURL(/\/edit\//),
    gameCard.click(),
  ])
}

/** 读取 IndexedDB 里登记的引擎绑定，用于断言悬空绑定是否被修复 */
export async function readRegisteredEngineId(page: Page, gameId: string): Promise<string | undefined> {
  return await page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('WebGALCraft')
      request.addEventListener('error', () => reject(request.error))
      request.addEventListener('success', () => resolve(request.result))
    })
    const game = await new Promise<{ engineId?: string } | undefined>((resolve, reject) => {
      const transaction = database.transaction('games', 'readonly')
      const get = transaction.objectStore('games').get(id)
      get.addEventListener('error', () => reject(get.error))
      get.addEventListener('success', () => resolve(get.result as { engineId?: string } | undefined))
    })
    database.close()
    return game?.engineId
  }, gameId)
}
