import '~/__tests__/setup'

import { createPinia, setActivePinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, reactive } from 'vue'

import { AbsPath } from '~/domain/path'
import { useTabsStore } from '~/stores/tabs'

const {
  useEditSettingsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
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

function createMemoryStorage(seed: Record<string, string> = {}) {
  const state = new Map(Object.entries(seed))
  return {
    getItem(key: string) {
      // persistedstate 约定未命中时返回 null，这里显式兼容其接口
      // eslint-disable-next-line unicorn/no-null
      return state.get(key) ?? null
    },
    setItem(key: string, value: string) {
      state.set(key, value)
    },
  }
}

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

describe('useTabsStore', () => {
  beforeEach(() => {
    vi.useRealTimers()
    useWorkspaceStoreMock.mockReset()
    useEditSettingsStoreMock.mockReset()
    eventHandlers.clear()
    workspaceStoreState.currentGame = { id: 'game-1' }
    editSettingsStoreState.enablePreviewTab = true
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)
    useEditSettingsStoreMock.mockReturnValue(editSettingsStoreState)
  })

  it('预览标签页只保留一个，并在再次打开时替换当前预览项', () => {
    const store = useTabsStore()

    store.openTab('scene-1.txt', AbsPath.from('/game/scene-1.txt'))
    store.openTab('scene-2.txt', AbsPath.from('/game/scene-2.txt'))

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

    store.openTab('a.txt', AbsPath.from('/game/a.txt'))
    store.openTab('b.txt', AbsPath.from('/game/b.txt'))
    store.openTab('a.txt', AbsPath.from('/game/a.txt'))

    expect(store.tabs.map(tab => tab.path)).toEqual(['/game/a.txt', '/game/b.txt'])
    expect(store.activeTab?.path).toBe('/game/a.txt')
  })

  it('fixPreviewTab 与 updateTabModified 都会把预览标签转为普通标签', () => {
    const store = useTabsStore()

    store.openTab('preview.txt', AbsPath.from('/game/preview.txt'))
    expect(store.tabs[0]?.isPreview).toBe(true)

    store.fixPreviewTab(0)
    expect(store.tabs[0]?.isPreview).toBe(false)
    expect(store.shouldFocusEditor).toBe(true)

    store.openTab('next.txt', AbsPath.from('/game/next.txt'))
    expect(store.tabs[1]?.isPreview).toBe(true)

    store.updateTabModified(1, true)
    expect(store.tabs[1]).toMatchObject({
      isPreview: false,
      isModified: true,
    })
  })

  it('强制以普通标签重新打开已存在的预览标签时会将其固化', () => {
    const store = useTabsStore()

    store.openTab('preview.txt', AbsPath.from('/game/preview.txt'))
    expect(store.tabs[0]?.isPreview).toBe(true)

    store.openTab('preview.txt', AbsPath.from('/game/preview.txt'), { forceNormal: true })

    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0]).toMatchObject({
      path: '/game/preview.txt',
      isPreview: false,
    })
    expect(store.shouldFocusEditor).toBe(true)
  })

  it('关闭当前标签页后会回退到最近一次激活的剩余标签', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-18T00:00:00.000Z'))

    const store = useTabsStore()

    editSettingsStoreState.enablePreviewTab = false

    store.openTab('a.txt', AbsPath.from('/game/a.txt'))
    vi.setSystemTime(new Date('2026-03-18T00:00:01.000Z'))
    store.openTab('b.txt', AbsPath.from('/game/b.txt'))
    vi.setSystemTime(new Date('2026-03-18T00:00:02.000Z'))
    store.activateTab(0)

    store.closeTab(0)

    expect(store.tabs.map(tab => tab.path)).toEqual(['/game/b.txt'])
    expect(store.activeTab?.path).toBe('/game/b.txt')
  })

  it('关闭后重新打开同一路径时不会继承旧的运行时状态', () => {
    const store = useTabsStore()

    editSettingsStoreState.enablePreviewTab = false

    store.openTab('scene.txt', AbsPath.from('/game/scene.txt'))
    store.updateTabModified(0, true)
    store.closeTab(0)
    store.openTab('scene.txt', AbsPath.from('/game/scene.txt'))

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
    store.openTab('scene.txt', AbsPath.from('/game/scene.txt'))
    store.openTab('image.png', AbsPath.from('/game/image.png'))

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
    store.openTab('scene.txt', AbsPath.from('/game/scene.txt'))
    store.updateTabModified(0, true)
    store.updateTabLoading(0, true)
    store.updateTabError(0, 'rename pending')

    await eventHandlers.get('file:renamed')?.({
      oldPath: '/game/scene.txt',
      newPath: '/game/scene-renamed.txt',
    })

    expect(store.findTabIndex(AbsPath.from('/game/scene.txt'))).toBe(-1)
    expect(store.findTabIndex(AbsPath.from('/game/scene-renamed.txt'))).toBe(0)
    expect(store.tabs[0]).toMatchObject({
      path: '/game/scene-renamed.txt',
      name: 'scene-renamed.txt',
      isModified: true,
      isLoading: true,
      error: 'rename pending',
    })
  })

  it('不同分隔符形态的同一路径会被视为同一标签页，避免重复打开', () => {
    const store = useTabsStore()

    editSettingsStoreState.enablePreviewTab = false

    store.openTab('start.txt', AbsPath.from('X:/games/demo/game/scene/start.txt'))
    store.openTab('start.txt', AbsPath.from(String.raw`X:\games\demo\game\scene\start.txt`))

    expect(store.tabs.map(tab => tab.path)).toEqual(['X:/games/demo/game/scene/start.txt'])
    expect(store.activeTab?.path).toBe('X:/games/demo/game/scene/start.txt')
  })

  it('预览模式下用反斜杠重新打开当前预览标签时不会再插入新标签', () => {
    const store = useTabsStore()

    store.openTab('start.txt', AbsPath.from('X:/games/demo/game/scene/start.txt'))
    store.openTab('start.txt', AbsPath.from(String.raw`X:\games\demo\game\scene\start.txt`))

    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0]).toMatchObject({
      path: 'X:/games/demo/game/scene/start.txt',
      isPreview: true,
    })
  })

  it('持久化恢复时会把旧的反斜杠绝对路径重新规范化', () => {
    const pinia = createPinia()
    pinia.use(createPersistedState({
      storage: createMemoryStorage({
        tabs: JSON.stringify({
          projectTabsMap: {
            'game-1': {
              activeTabIndex: 0,
              tabs: [
                {
                  name: 'start.txt',
                  path: String.raw`x:\games\demo\game\scene\start.txt`,
                  activeAt: 1,
                  isPreview: false,
                },
              ],
            },
          },
        }),
      }),
    }))
    createApp({}).use(pinia)
    setActivePinia(pinia)

    const store = useTabsStore()

    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0]?.path).toBe('X:/games/demo/game/scene/start.txt')
    expect(store.findTabIndex(AbsPath.from(String.raw`X:\games\demo\game\scene\start.txt`))).toBe(0)
  })
})
