import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, reactive } from 'vue'

const {
  isAnimationTableRelatedPathMock,
  onMock,
  syncAnimationTableMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  isAnimationTableRelatedPathMock: vi.fn(),
  onMock: vi.fn(),
  syncAnimationTableMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

let workspaceStoreState = reactive<{ CWD?: string }>({
  CWD: '/project',
})

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: () => ({
    on: onMock,
  }),
}))

vi.mock('~/services/animation-table-sync', () => ({
  isAnimationTableRelatedPath: isAnimationTableRelatedPathMock,
  syncAnimationTable: syncAnimationTableMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

describe('useAnimationTableSyncBootstrap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()

    isAnimationTableRelatedPathMock.mockReset()
    onMock.mockReset()
    syncAnimationTableMock.mockReset()
    useWorkspaceStoreMock.mockReset()
    syncAnimationTableMock.mockResolvedValue(undefined)

    workspaceStoreState = reactive({
      CWD: '/project',
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)
  })

  it('相关事件会被合并为一次 animationTable 同步请求', async () => {
    const handlers = new Map<string, (event: Record<string, string>) => void>()
    onMock.mockImplementation((eventType: string, handler: (event: Record<string, string>) => void) => {
      handlers.set(eventType, handler)
      return vi.fn()
    })
    isAnimationTableRelatedPathMock.mockReturnValue(true)

    const { useAnimationTableSyncBootstrap } = await import('../useAnimationTableSyncBootstrap')
    const scope = effectScope()
    scope.run(() => {
      useAnimationTableSyncBootstrap()
    })

    handlers.get('file:created')?.({ path: '/project/game/animation/aaa.json' })
    handlers.get('file:created')?.({ path: '/project/game/animation/bbb.json' })
    handlers.get('file:renamed')?.({
      oldPath: '/project/game/animation/old.json',
      newPath: '/project/game/animation/new.json',
    })

    await vi.runAllTimersAsync()

    expect(syncAnimationTableMock).toHaveBeenCalledTimes(1)
    expect(syncAnimationTableMock).toHaveBeenCalledWith('/project')

    scope.stop()
  })

  it('首次进入且工作区已就绪时会主动调度一次同步', async () => {
    onMock.mockImplementation(() => vi.fn())

    const { useAnimationTableSyncBootstrap } = await import('../useAnimationTableSyncBootstrap')
    const scope = effectScope()
    scope.run(() => {
      useAnimationTableSyncBootstrap()
    })

    await vi.runAllTimersAsync()

    expect(syncAnimationTableMock).toHaveBeenCalledTimes(1)
    expect(syncAnimationTableMock).toHaveBeenCalledWith('/project')

    scope.stop()
  })

  it('工作区切换时会取消旧的待执行同步，只保留当前工作区', async () => {
    onMock.mockImplementation(() => vi.fn())

    const { useAnimationTableSyncBootstrap } = await import('../useAnimationTableSyncBootstrap')
    const scope = effectScope()
    scope.run(() => {
      useAnimationTableSyncBootstrap()
    })

    workspaceStoreState.CWD = '/next-project'
    await nextTick()
    await vi.runAllTimersAsync()

    expect(syncAnimationTableMock).toHaveBeenCalledTimes(1)
    expect(syncAnimationTableMock).toHaveBeenCalledWith('/next-project')

    scope.stop()
  })

  it('会忽略索引无关路径和缺失工作区的情况', async () => {
    const handlers = new Map<string, (event: Record<string, string>) => void>()
    onMock.mockImplementation((eventType: string, handler: (event: Record<string, string>) => void) => {
      handlers.set(eventType, handler)
      return vi.fn()
    })
    isAnimationTableRelatedPathMock.mockReturnValue(false)
    workspaceStoreState.CWD = undefined

    const { useAnimationTableSyncBootstrap } = await import('../useAnimationTableSyncBootstrap')
    const scope = effectScope()
    scope.run(() => {
      useAnimationTableSyncBootstrap()
    })

    handlers.get('file:created')?.({ path: '/project/game/animation/aaa.json' })
    handlers.get('directory:renamed')?.({
      oldPath: '/project/game/animation/aaa',
      newPath: '/project/game/animation/bbb',
    })

    await vi.runAllTimersAsync()

    expect(syncAnimationTableMock).not.toHaveBeenCalled()

    scope.stop()
  })

  it('作用域销毁后会取消待执行同步，并允许重新挂载重新绑定', async () => {
    onMock.mockImplementation(() => vi.fn())

    const { useAnimationTableSyncBootstrap } = await import('../useAnimationTableSyncBootstrap')

    const firstScope = effectScope()
    firstScope.run(() => {
      useAnimationTableSyncBootstrap()
    })

    expect(onMock).toHaveBeenCalledTimes(6)

    firstScope.stop()
    await vi.runAllTimersAsync()

    expect(syncAnimationTableMock).not.toHaveBeenCalled()

    const secondScope = effectScope()
    secondScope.run(() => {
      useAnimationTableSyncBootstrap()
    })
    await vi.runAllTimersAsync()

    expect(onMock).toHaveBeenCalledTimes(12)
    expect(syncAnimationTableMock).toHaveBeenCalledTimes(1)
    expect(syncAnimationTableMock).toHaveBeenCalledWith('/project')

    secondScope.stop()
  })
})
