import { expect } from '@playwright/test'

import { installMockTauri, waitForMockTauriReady } from './mock-tauri'

import type { InstallMockTauriOptions } from './mock-tauri'
import type { Page } from '@playwright/test'

interface TauriInternals {
  invoke(command: string, args?: Record<string, unknown> | Uint8Array, options?: { headers?: Record<string, string> }): Promise<unknown>
}

interface LaunchCraftAppOptions {
  mockTauri?: InstallMockTauriOptions
  persistedStores?: Record<string, unknown>
}

export async function launchCraftApp(page: Page, options: LaunchCraftAppOptions = {}) {
  if (options.persistedStores) {
    await page.addInitScript((stores: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(stores)) {
        globalThis.localStorage.setItem(key, JSON.stringify(value))
      }
    }, options.persistedStores)
  }

  await installMockTauri(page, options.mockTauri)
  await page.goto('/')
  await waitForMockTauriReady(page)
}

export async function createGameFromHome(page: Page, gameName: string = 'Demo Game') {
  await page.getByRole('button', {
    name: /Create Game|创建游戏|ゲームを作成/,
  }).click()

  const createGameDialog = page.getByRole('dialog')
  await expect(createGameDialog).toBeVisible()
  await createGameDialog.getByRole('textbox').first().fill(gameName)
  await createGameDialog.getByRole('button', {
    name: /Create|创建|作成/,
  }).click()

  await expect(createGameDialog).toBeHidden()
  await expect(page.getByRole('heading', { name: gameName })).toBeVisible()
}

export async function enterEditorFromCreatedGame(page: Page, gameName: string = 'Demo Game') {
  await createGameFromHome(page, gameName)
  await page.getByRole('heading', { name: gameName }).click()
  await expect(page).toHaveURL(/\/edit\//)
}

export async function openStartSceneFile(page: Page) {
  await page.getByRole('treeitem', { name: 'start.txt' }).click()
  await expect(page.getByRole('button', { name: /start\.txt/ })).toBeVisible()
}

export async function getSceneEditorInput(page: Page) {
  const editorInput = page.locator('.monaco-editor textarea.inputarea').first()
  await expect(editorInput).toBeVisible()
  return editorInput
}

export async function replaceSceneText(page: Page, content: string) {
  const editorInput = await getSceneEditorInput(page)
  await editorInput.focus()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(content)
}

async function getOpenWindowLabels(page: Page): Promise<string[]> {
  await waitForMockTauriReady(page)

  return await page.evaluate(async () => {
    const tauriInternals = (globalThis as typeof globalThis & {
      __TAURI_INTERNALS__?: TauriInternals
    }).__TAURI_INTERNALS__

    if (!tauriInternals) {
      throw new Error('缺少 Tauri mock runtime')
    }

    const labels = await tauriInternals.invoke('plugin:window|get_all_windows')
    if (!Array.isArray(labels)) {
      throw new TypeError('窗口列表返回值无效')
    }

    return labels.map(String)
  })
}

export async function expectTestWindowOpened(page: Page) {
  await expect.poll(async () => {
    const labels = await getOpenWindowLabels(page)
    return {
      count: labels.length,
      hasMainWindow: labels.includes('main'),
      hasTestWindow: labels.some(label => label.startsWith('test-')),
    }
  }).toEqual({
    count: 2,
    hasMainWindow: true,
    hasTestWindow: true,
  })
}

export async function expectUnsavedStatus(page: Page) {
  await expect(page.getByTitle(/Unsaved|未保存|未儲存/)).toBeVisible()
}

export async function expectSavedStatus(page: Page) {
  await expect(page.getByText(/Saved|已保存|保存済み|已儲存/)).toBeVisible()
}
