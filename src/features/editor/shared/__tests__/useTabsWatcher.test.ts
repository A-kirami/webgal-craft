import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

const { useTabsStoreMock } = vi.hoisted(() => ({
  useTabsStoreMock: vi.fn(),
}))

const tabsStoreState = reactive({
  tabs: [
    { path: '/game/a.txt' },
    { path: '/game/b.txt' },
  ],
})

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

import { useTabsWatcher } from '~/features/editor/shared/useTabsWatcher'

describe('useTabsWatcher 行为', () => {
  beforeEach(() => {
    tabsStoreState.tabs = [
      { path: '/game/a.txt' },
      { path: '/game/b.txt' },
    ]
    useTabsStoreMock.mockReturnValue(tabsStoreState)
  })

  it('会在标签关闭时回调被移除的路径', async () => {
    const onTabClosed = vi.fn()
    const stop = useTabsWatcher(onTabClosed)

    try {
      tabsStoreState.tabs = [{ path: '/game/b.txt' }]
      await nextTick()

      expect(onTabClosed).toHaveBeenCalledWith('/game/a.txt')
    } finally {
      stop()
    }
  })

  it('返回的 stop 函数会停止后续监听', async () => {
    const onTabClosed = vi.fn()

    const stop = useTabsWatcher(onTabClosed)
    stop()

    tabsStoreState.tabs = [{ path: '/game/b.txt' }]
    await nextTick()

    expect(onTabClosed).not.toHaveBeenCalled()
  })
})
