import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, nextTick, reactive } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

import FlowchartSceneDock from './FlowchartSceneDock.vue'

import type { PropType } from 'vue'
import type { ScenePanelFolderItem, ScenePanelTreeNode } from '~/features/editor/scene-panel/scene-panel'

const { useFileStoreMock, useWorkspaceStoreMock } = vi.hoisted(() => ({
  useFileStoreMock: Object.assign(vi.fn(), { $id: 'file' as const }),
  useWorkspaceStoreMock: Object.assign(vi.fn(), { $id: 'workspace' as const }),
}))

vi.mock(import('~/stores/file'), () => ({ useFileStore: useFileStoreMock }))
vi.mock(import('~/stores/workspace'), () => ({ useWorkspaceStore: useWorkspaceStoreMock }))

const workspace = reactive<{ currentGame: { path: string } | undefined }>({
  currentGame: { path: '/games/first' },
})
const getFolderContents = vi.fn<(path: string) => Promise<ScenePanelFolderItem[]>>()

const FileTreeStub = defineComponent({
  props: {
    items: { type: Array as PropType<ScenePanelTreeNode[]>, required: true },
  },
  setup(props) {
    return () => h('ul', props.items.map(item => h('li', { key: item.id }, item.name)))
  },
})

function sceneFile(name: string): ScenePanelFolderItem {
  return { id: name, isDir: false, name, path: `/games/first/game/scene/${name}` }
}

async function renderDock() {
  return await renderInBrowser(FlowchartSceneDock, {
    global: { stubs: { FileTree: FileTreeStub } },
  })
}

describe('FlowchartSceneDock', () => {
  beforeEach(() => {
    workspace.currentGame = { path: '/games/first' }
    getFolderContents.mockReset().mockResolvedValue([])
    useFileStoreMock.mockReturnValue({ initialized: Promise.resolve(), getFolderContents })
    useWorkspaceStoreMock.mockReturnValue(workspace)
  })

  it('折叠与展开保留切换按钮的焦点', async () => {
    await renderDock()
    const toggle = page.getByTestId('flowchart-scene-dock-toggle')
    const button = await toggle.element()
    await toggle.click()
    await expect.element(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(button)

    await toggle.click()
    await expect.element(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(document.activeElement).toBe(button)
  })

  it('旧工程的读取晚于新工程完成时保留新场景树', async () => {
    const firstRead = Promise.withResolvers<ScenePanelFolderItem[]>()
    getFolderContents.mockImplementation(path => path.includes('/first/')
      ? firstRead.promise
      : Promise.resolve([sceneFile('新工程.txt')]))
    await renderDock()
    await expect.poll(() => getFolderContents.mock.calls.length).toBe(1)

    workspace.currentGame = { path: '/games/second' }
    await expect.element(page.getByText('新工程.txt', { exact: true })).toBeVisible()
    firstRead.resolve([sceneFile('旧工程.txt')])
    await firstRead.promise
    await nextTick()

    await expect.element(page.getByText('新工程.txt', { exact: true })).toBeVisible()
    expect(page.getByText('旧工程.txt', { exact: true }).elements()).toHaveLength(0)
  })

  it('清空工作区后不接受仍在读取的场景树', async () => {
    const pendingRead = Promise.withResolvers<ScenePanelFolderItem[]>()
    getFolderContents.mockReturnValue(pendingRead.promise)
    await renderDock()
    await expect.poll(() => getFolderContents.mock.calls.length).toBe(1)

    workspace.currentGame = undefined
    await expect.element(page.getByText('edit.flowchart.sceneDock.empty', { exact: true })).toBeVisible()
    pendingRead.resolve([sceneFile('已关闭工程.txt')])
    await pendingRead.promise
    await nextTick()

    await expect.element(page.getByText('edit.flowchart.sceneDock.empty', { exact: true })).toBeVisible()
    expect(page.getByText('已关闭工程.txt', { exact: true }).elements()).toHaveLength(0)
  })
})
