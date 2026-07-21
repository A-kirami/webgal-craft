import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, shallowRef } from 'vue'

import { AbsPath } from '~/domain/path'
import { buildStatements } from '~/domain/script/sentence'

const {
  useEditorDiagnosticsStoreMock,
  useEditorStoreMock,
  useResourceIndexMock,
  useTabsStoreMock,
} = vi.hoisted(() => ({
  useEditorDiagnosticsStoreMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  useResourceIndexMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor-diagnostics', () => ({
  useEditorDiagnosticsStore: useEditorDiagnosticsStoreMock,
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/services/resource-index/service', () => ({
  useResourceIndex: useResourceIndexMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

import { useEditorDiagnostics } from '../useEditorDiagnostics'

describe('useEditorDiagnostics', () => {
  beforeEach(() => {
    useEditorDiagnosticsStoreMock.mockReset()
    useEditorStoreMock.mockReset()
    useResourceIndexMock.mockReset()
    useTabsStoreMock.mockReset()
  })

  it('只发布已打开文档，并在资源索引变化后使资源诊断失效再重算', async () => {
    const openPath = AbsPath.from('/game/scene/start.txt')
    const unopenedPath = AbsPath.from('/game/scene/unopened.txt')
    const diagnosticsStore = {
      invalidateSource: vi.fn(),
      publish: vi.fn(),
    }
    const visualProjections = new Map([
      [openPath, reactive({
        kind: 'scene' as const,
        statements: buildStatements('changeBg:missing.png;'),
      })],
      [unopenedPath, reactive({
        kind: 'scene' as const,
        statements: buildStatements('label:duplicate;\nlabel:duplicate;'),
      })],
    ])
    const resourceRevision = shallowRef(0)
    const sceneRevision = shallowRef('revision-1')
    const tabsStore = reactive({
      tabs: [{ path: openPath }],
    })

    useEditorDiagnosticsStoreMock.mockReturnValue(diagnosticsStore)
    useEditorStoreMock.mockReturnValue({
      getTextProjectionState: vi.fn(() => undefined),
      getVisualProjectionState: (path: AbsPath) => visualProjections.get(path),
      peekSceneRevision: vi.fn(() => sceneRevision.value),
    })
    useResourceIndexMock.mockReturnValue({
      hasAssetKey: vi.fn(() => false),
      revision: resourceRevision,
      status: shallowRef('ready'),
    })
    useTabsStoreMock.mockReturnValue(tabsStore)

    const scope = effectScope()
    scope.run(useEditorDiagnostics)

    expect(diagnosticsStore.publish).toHaveBeenCalledTimes(1)
    expect(diagnosticsStore.publish).toHaveBeenCalledWith(openPath, [
      expect.objectContaining({ code: 'missing-resource', severity: 'error' }),
    ])
    expect(diagnosticsStore.publish).not.toHaveBeenCalledWith(unopenedPath, expect.anything())

    resourceRevision.value++
    await nextTick()

    expect(diagnosticsStore.invalidateSource).toHaveBeenCalledWith('resource')
    expect(diagnosticsStore.publish).toHaveBeenCalledTimes(2)

    sceneRevision.value = 'revision-2'
    await nextTick()

    expect(diagnosticsStore.publish).toHaveBeenCalledTimes(3)
    scope.stop()
  })

  it('打开文档切换为不可诊断投影时清除旧快照', async () => {
    const path = AbsPath.from('/game/notes.txt')
    const diagnosticsStore = {
      invalidateSource: vi.fn(),
      publish: vi.fn(),
    }
    const visualProjection = reactive<{ kind: 'scene' | 'unknown', statements?: ReturnType<typeof buildStatements> }>({
      kind: 'scene',
      statements: buildStatements('label:start;\nlabel:start;'),
    })

    useEditorDiagnosticsStoreMock.mockReturnValue(diagnosticsStore)
    useEditorStoreMock.mockReturnValue({
      getTextProjectionState: vi.fn(() => undefined),
      getVisualProjectionState: vi.fn(() => visualProjection),
      peekSceneRevision: vi.fn(() => visualProjection.kind),
    })
    useResourceIndexMock.mockReturnValue({
      hasAssetKey: vi.fn(() => true),
      revision: shallowRef(0),
      status: shallowRef('ready'),
    })
    useTabsStoreMock.mockReturnValue(reactive({ tabs: [{ path }] }))

    const scope = effectScope()
    scope.run(useEditorDiagnostics)
    expect(diagnosticsStore.publish).toHaveBeenCalledWith(path, expect.any(Array))

    visualProjection.kind = 'unknown'
    delete visualProjection.statements
    await nextTick()

    expect(diagnosticsStore.publish).toHaveBeenLastCalledWith(path, [])
    scope.stop()
  })
})
