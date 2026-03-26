import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { useTabsStore } from '~/stores/tabs'

const {
  basenameMock,
  useEditSettingsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  basenameMock: vi.fn(async (input: string) => input.split('/').at(-1) ?? input),
  useEditSettingsStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))
const eventHandlers = new Map<string, (event: unknown) => unknown>()
const workspaceStoreState = reactive<{ currentGame?: { id: string } }>({
  currentGame: { id: 'game-1' },
})
const editSettingsStoreState = reactive({
  enablePreviewTab: true,
})

vi.mock('@tauri-apps/api/path', () => ({
  basename: basenameMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('~/stores/edit-settings', () => ({
  useEditSettingsStore: useEditSettingsStoreMock,
}))

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: () => ({
    on: vi.fn((type: string, handler: (event: unknown) => unknown) => {
      eventHandlers.set(type, handler)
      return () => {
        eventHandlers.delete(type)
      }
    }),
  }),
}))

describe('标签状态仓库', () => {
  beforeEach(() => {
    vi.useRealTimers()
    useWorkspaceStoreMock.mockReset()
    useEditSettingsStoreMock.mockReset()
    basenameMock.mockClear()
    eventHandlers.clear()
    workspaceStoreState.currentGame = { id: 'game-1' }
    editSettingsStoreState.enablePreviewTab = true
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)
    useEditSettingsStoreMock.mockReturnValue(editSettingsStoreState)
  })

  it('预览标签页只保留一个，并在再次打开时替换当前预览项', () => {
    const store = useTabsStore()

    store.openTab('scene-1.txt', '/game/scene-1.txt')
    store.openTab('scene-2.txt', '/game/scene-2.txt')

    expect(store.tabs).toEqual([
      expect.objectContaining({
        name: 'scene-2.txt',
        path: '/game/scene-2.txt',
        isPreview: true,
      }),
    ])
    expect(store.activeTab?.path).toBe('/game/scene-2.txt')
  })

  it('重复打开已存在标签页时只激活，不会重复插入', () => {
    const store = useTabsStore()

    editSettingsStoreState.enablePreviewTab = false

    store.openTab('a.txt', '/game/a.txt')
    store.openTab('b.txt', '/game/b.txt')
    store.openTab('a.txt', '/game/a.txt')

    expect(store.tabs.map(tab => tab.path)).toEqual(['/game/a.txt', '/game/b.txt'])
    expect(store.activeTab?.path).toBe('/game/a.txt')
  })

  it('fixPreviewTab 与 updateTabModified 都会把预览标签转为普通标签', () => {
    const store = useTabsStore()

    store.openTab('preview.txt', '/game/preview.txt')
    expect(store.tabs[0]?.isPreview).toBe(true)

    store.fixPreviewTab(0)
    expect(store.tabs[0]?.isPreview).toBe(false)
    expect(store.shouldFocusEditor).toBe(true)

    store.openTab('next.txt', '/game/next.txt')
    expect(store.tabs[1]?.isPreview).toBe(true)

    store.updateTabModified(1, true)
    expect(store.tabs[1]).toMatchObject({
      isPreview: false,
      isModified: true,
    })
  })

  it('关闭当前标签页后会回退到最近一次激活的剩余标签', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-18T00:00:00.000Z'))

    const store = useTabsStore()

    editSettingsStoreState.enablePreviewTab = false

    store.openTab('a.txt', '/game/a.txt')
    vi.setSystemTime(new Date('2026-03-18T00:00:01.000Z'))
    store.openTab('b.txt', '/game/b.txt')
    vi.setSystemTime(new Date('2026-03-18T00:00:02.000Z'))
    store.activateTab(0)

    store.closeTab(0)

    expect(store.tabs.map(tab => tab.path)).toEqual(['/game/b.txt'])
    expect(store.activeTab?.path).toBe('/game/b.txt')
  })

  it('关闭后重新打开同一路径时不会继承旧的运行时状态', () => {
    const store = useTabsStore()

    editSettingsStoreState.enablePreviewTab = false

    store.openTab('scene.txt', '/game/scene.txt')
    store.updateTabModified(0, true)
    store.closeTab(0)
    store.openTab('scene.txt', '/game/scene.txt')

    expect(store.tabs[0]).toMatchObject({
      path: '/game/scene.txt',
      isPreview: false,
    })
    expect(store.tabs[0]?.isModified).toBeUndefined()
    expect(store.tabs[0]?.isLoading).toBeUndefined()
    expect(store.tabs[0]?.error).toBeUndefined()
  })

  it('文件系统事件会驱动关闭与重命名标签', async () => {
    const store = useTabsStore()

    editSettingsStoreState.enablePreviewTab = false
    store.openTab('scene.txt', '/game/scene.txt')
    store.openTab('image.png', '/game/image.png')

    await eventHandlers.get('file:renamed')?.({
      oldPath: '/game/scene.txt',
      newPath: '/game/scene-renamed.txt',
    })
    expect(store.tabs[0]).toMatchObject({
      name: 'scene-renamed.txt',
      path: '/game/scene-renamed.txt',
    })

    await eventHandlers.get('file:removed')?.({ path: '/game/image.png' })
    expect(store.tabs.map(tab => tab.path)).toEqual(['/game/scene-renamed.txt'])
  })

  it('文件重命名时会把运行时状态一并迁移到新路径', async () => {
    const store = useTabsStore()

    editSettingsStoreState.enablePreviewTab = false
    store.openTab('scene.txt', '/game/scene.txt')
    store.updateTabModified(0, true)
    store.updateTabLoading(0, true)
    store.updateTabError(0, 'rename pending')

    await eventHandlers.get('file:renamed')?.({
      oldPath: '/game/scene.txt',
      newPath: '/game/scene-renamed.txt',
    })

    expect(store.findTabIndex('/game/scene.txt')).toBe(-1)
    expect(store.findTabIndex('/game/scene-renamed.txt')).toBe(0)
    expect(store.tabs[0]).toMatchObject({
      path: '/game/scene-renamed.txt',
      name: 'scene-renamed.txt',
      isModified: true,
      isLoading: true,
      error: 'rename pending',
    })
  })
})
