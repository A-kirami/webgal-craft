import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, reactive } from 'vue'

const {
  onMock,
  registerDynamicOptionsMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  onMock: vi.fn(),
  registerDynamicOptionsMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

const dynamicOptionSources = [
  {
    key: 'animationTableEntries',
    resolveCacheKey: () => '/project',
    loadOptions: vi.fn(async () => []),
    invalidateByFileModified: vi.fn(() => false),
  },
] as const

let workspaceStoreState = reactive<{ CWD?: string }>({
  CWD: '/project',
})

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: () => ({
    on: onMock,
  }),
}))

vi.mock('~/features/editor/command-registry/dynamic-options', () => ({
  editorDynamicOptionSources: dynamicOptionSources,
  normalizeGamePath: (path: string) => path.toLowerCase(),
}))

vi.mock('~/features/editor/dynamic-options/dynamic-options', () => ({
  registerDynamicOptions: registerDynamicOptionsMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

describe('useEditorDynamicOptionsBootstrap', () => {
  beforeEach(() => {
    vi.resetModules()

    onMock.mockReset()
    registerDynamicOptionsMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    workspaceStoreState = reactive({
      CWD: '/project',
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)
  })

  it('作用域销毁后会允许重新挂载重新绑定失效监听，而不会重复注册解析器', async () => {
    onMock.mockImplementation(() => vi.fn())

    const { useEditorDynamicOptionsBootstrap } = await import('../useEditorDynamicOptionsBootstrap')

    const firstScope = effectScope()
    firstScope.run(() => {
      useEditorDynamicOptionsBootstrap()
    })

    expect(registerDynamicOptionsMock).toHaveBeenCalledTimes(dynamicOptionSources.length)
    expect(onMock).toHaveBeenCalledTimes(7)

    firstScope.stop()

    const secondScope = effectScope()
    secondScope.run(() => {
      useEditorDynamicOptionsBootstrap()
    })

    expect(registerDynamicOptionsMock).toHaveBeenCalledTimes(dynamicOptionSources.length)
    expect(onMock).toHaveBeenCalledTimes(14)

    secondScope.stop()
  })
})
