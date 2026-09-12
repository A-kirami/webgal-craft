import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, shallowRef } from 'vue'

import { LATEST_ENGINE_RUNTIME_CAPABILITIES, LEGACY_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { AbsPath } from '~/domain/path'
import { buildStatements } from '~/domain/script/sentence'

const {
  useEditorDiagnosticsStoreMock,
  useEditorStoreMock,
  useResourceIndexMock,
  useResourceStoreMock,
  useTabsStoreMock,
} = vi.hoisted(() => ({
  useEditorDiagnosticsStoreMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  useResourceIndexMock: vi.fn(),
  useResourceStoreMock: vi.fn(),
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

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
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
    useResourceStoreMock.mockReset()
    useTabsStoreMock.mockReset()
    useResourceStoreMock.mockReturnValue(reactive({
      currentEngineCapabilities: undefined,
    }))
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
    const sceneToken = shallowRef('token-1')
    const tabsStore = reactive({
      tabs: [{ path: openPath }],
    })

    useEditorDiagnosticsStoreMock.mockReturnValue(diagnosticsStore)
    useEditorStoreMock.mockReturnValue({
      getTextProjectionState: vi.fn(() => undefined),
      getVisualProjectionState: (path: AbsPath) => visualProjections.get(path),
      peekSceneContentChangeToken: vi.fn(() => sceneToken.value),
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

    sceneToken.value = 'token-2'
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
      peekSceneContentChangeToken: vi.fn(() => visualProjection.kind),
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

  it('当前引擎能力变化后重新发布兼容性诊断', async () => {
    const path = AbsPath.from('/game/scene/start.txt')
    const diagnosticsStore = {
      invalidateSource: vi.fn(),
      publish: vi.fn(),
    }
    const resourceStore = reactive<{
      currentEngineCapabilities?: { live2d: boolean, spine: boolean }
    }>({
      currentEngineCapabilities: { live2d: false, spine: false },
    })

    useEditorDiagnosticsStoreMock.mockReturnValue(diagnosticsStore)
    useEditorStoreMock.mockReturnValue({
      getTextProjectionState: vi.fn(() => undefined),
      getVisualProjectionState: vi.fn(() => reactive({
        kind: 'scene' as const,
        statements: buildStatements('changeFigure:hero.json;'),
      })),
      peekSceneContentChangeToken: vi.fn(() => 'revision-1'),
    })
    useResourceIndexMock.mockReturnValue({
      hasAssetKey: vi.fn(() => true),
      revision: shallowRef(0),
      status: shallowRef('ready'),
    })
    useResourceStoreMock.mockReturnValue(resourceStore)
    useTabsStoreMock.mockReturnValue(reactive({ tabs: [{ path }] }))

    const scope = effectScope()
    scope.run(useEditorDiagnostics)

    expect(diagnosticsStore.publish).toHaveBeenLastCalledWith(path, [
      expect.objectContaining({ code: 'unsupported-live2d' }),
    ])

    resourceStore.currentEngineCapabilities = { live2d: true, spine: false }
    await nextTick()

    expect(diagnosticsStore.publish).toHaveBeenLastCalledWith(path, [])
    expect(diagnosticsStore.invalidateSource).not.toHaveBeenCalledWith('resource')
    scope.stop()
  })

  it('当前引擎运行时能力变化后重新发布 Opus 兼容性诊断', async () => {
    const path = AbsPath.from('/game/scene/start.txt')
    const diagnosticsStore = {
      invalidateSource: vi.fn(),
      publish: vi.fn(),
    }
    const resourceStore = reactive({
      currentEngineCapabilities: undefined,
      currentEngineRuntimeCapabilities: LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    })

    useEditorDiagnosticsStoreMock.mockReturnValue(diagnosticsStore)
    useEditorStoreMock.mockReturnValue({
      getTextProjectionState: vi.fn(() => undefined),
      getVisualProjectionState: vi.fn(() => reactive({
        kind: 'scene' as const,
        statements: buildStatements('say:hello -voice.opus;'),
      })),
      peekSceneContentChangeToken: vi.fn(() => 'revision-1'),
    })
    useResourceIndexMock.mockReturnValue({
      hasAssetKey: vi.fn(() => true),
      revision: shallowRef(0),
      status: shallowRef('ready'),
    })
    useResourceStoreMock.mockReturnValue(resourceStore)
    useTabsStoreMock.mockReturnValue(reactive({ tabs: [{ path }] }))

    const scope = effectScope()
    scope.run(useEditorDiagnostics)

    expect(diagnosticsStore.publish).toHaveBeenLastCalledWith(path, [
      expect.objectContaining({ code: 'unsupported-opus-vocal' }),
    ])

    resourceStore.currentEngineRuntimeCapabilities = LATEST_ENGINE_RUNTIME_CAPABILITIES
    await nextTick()

    expect(diagnosticsStore.publish).toHaveBeenLastCalledWith(path, [])
    scope.stop()
  })

  it('当前引擎立绘位置能力变化后重新发布兼容性诊断', async () => {
    const path = AbsPath.from('/game/scene/start.txt')
    const diagnosticsStore = {
      invalidateSource: vi.fn(),
      publish: vi.fn(),
    }
    const resourceStore = reactive({
      currentEngineCapabilities: undefined,
      currentEngineRuntimeCapabilities: LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    })

    useEditorDiagnosticsStoreMock.mockReturnValue(diagnosticsStore)
    useEditorStoreMock.mockReturnValue({
      getTextProjectionState: vi.fn(() => undefined),
      getVisualProjectionState: vi.fn(() => reactive({
        kind: 'scene' as const,
        runtimeCapabilities: resourceStore.currentEngineRuntimeCapabilities,
        statements: buildStatements('changeFigure: hero.png -left13;'),
      })),
      peekSceneContentChangeToken: vi.fn(() => 'revision-1'),
    })
    useResourceIndexMock.mockReturnValue({
      hasAssetKey: vi.fn(() => true),
      revision: shallowRef(0),
      status: shallowRef('ready'),
    })
    useResourceStoreMock.mockReturnValue(resourceStore)
    useTabsStoreMock.mockReturnValue(reactive({ tabs: [{ path }] }))

    const scope = effectScope()
    scope.run(useEditorDiagnostics)

    expect(diagnosticsStore.publish).toHaveBeenLastCalledWith(path, [
      expect.objectContaining({ code: 'unsupported-figure-position' }),
    ])

    resourceStore.currentEngineRuntimeCapabilities = LATEST_ENGINE_RUNTIME_CAPABILITIES
    await nextTick()

    expect(diagnosticsStore.publish).toHaveBeenLastCalledWith(path, [])
    scope.stop()
  })

  it('只重新诊断内容令牌变化的标签页', async () => {
    const changedPath = AbsPath.from('/game/scene/changed.txt')
    const stablePath = AbsPath.from('/game/scene/stable.txt')
    const diagnosticsStore = {
      invalidateSource: vi.fn(),
      publish: vi.fn(),
    }
    const tokens = reactive(new Map<AbsPath, string>([
      [changedPath, 'token-1'],
      [stablePath, 'token-2'],
    ]))
    const visualProjections = new Map([
      [changedPath, reactive({
        kind: 'scene' as const,
        statements: buildStatements('label:start;\nlabel:start;'),
      })],
      [stablePath, reactive({
        kind: 'scene' as const,
        statements: buildStatements('label:other;\nlabel:other;'),
      })],
    ])

    useEditorDiagnosticsStoreMock.mockReturnValue(diagnosticsStore)
    useEditorStoreMock.mockReturnValue({
      getTextProjectionState: vi.fn(() => undefined),
      getVisualProjectionState: (path: AbsPath) => visualProjections.get(path),
      peekSceneContentChangeToken: (path: AbsPath) => tokens.get(path),
    })
    useResourceIndexMock.mockReturnValue({
      hasAssetKey: vi.fn(() => true),
      revision: shallowRef(0),
      status: shallowRef('ready'),
    })
    useTabsStoreMock.mockReturnValue(reactive({
      tabs: [{ path: changedPath }, { path: stablePath }],
    }))

    const scope = effectScope()
    scope.run(useEditorDiagnostics)
    expect(diagnosticsStore.publish).toHaveBeenCalledTimes(2)
    diagnosticsStore.publish.mockClear()

    tokens.set(changedPath, 'token-1-updated')
    await nextTick()

    expect(diagnosticsStore.publish).toHaveBeenCalledTimes(1)
    expect(diagnosticsStore.publish).toHaveBeenCalledWith(changedPath, expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate-label' }),
    ]))
    scope.stop()
  })

  it('没有场景内容令牌的文档（动画草稿）等长编辑后仍重新发布诊断', async () => {
    const path = AbsPath.from('/game/animation/story.json')
    const diagnosticsStore = {
      invalidateSource: vi.fn(),
      publish: vi.fn(),
    }
    const textProjection = reactive({
      kind: 'animation' as const,
      syncError: 'invalid-animation-json' as const,
      textContent: '{invalid',
    })

    useEditorDiagnosticsStoreMock.mockReturnValue(diagnosticsStore)
    useEditorStoreMock.mockReturnValue({
      getTextProjectionState: () => textProjection,
      getVisualProjectionState: () => undefined,
      peekSceneContentChangeToken: () => undefined,
    })
    useResourceIndexMock.mockReturnValue({
      hasAssetKey: vi.fn(() => false),
      revision: shallowRef(0),
      status: shallowRef('ready'),
    })
    useTabsStoreMock.mockReturnValue(reactive({ tabs: [{ path }] }))

    const scope = effectScope()
    scope.run(useEditorDiagnostics)
    expect(diagnosticsStore.publish).toHaveBeenLastCalledWith(path, [
      expect.objectContaining({ code: 'invalid-animation-json' }),
    ])
    diagnosticsStore.publish.mockClear()

    // 等长替换：除内容本身外没有任何字段变化
    textProjection.textContent = '{invaliX'
    await nextTick()

    expect(diagnosticsStore.publish).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('资源索引变化时令牌未变也强制重算所有打开文档', async () => {
    const firstPath = AbsPath.from('/game/scene/first.txt')
    const secondPath = AbsPath.from('/game/scene/second.txt')
    const diagnosticsStore = {
      invalidateSource: vi.fn(),
      publish: vi.fn(),
    }
    const resourceRevision = shallowRef(0)
    const visualProjections = new Map([
      [firstPath, reactive({
        kind: 'scene' as const,
        statements: buildStatements('changeBg:missing.png;'),
      })],
      [secondPath, reactive({
        kind: 'scene' as const,
        statements: buildStatements('changeBg:missing.png;'),
      })],
    ])

    useEditorDiagnosticsStoreMock.mockReturnValue(diagnosticsStore)
    useEditorStoreMock.mockReturnValue({
      getTextProjectionState: vi.fn(() => undefined),
      getVisualProjectionState: (path: AbsPath) => visualProjections.get(path),
      peekSceneContentChangeToken: vi.fn(() => 'unchanged-token'),
    })
    useResourceIndexMock.mockReturnValue({
      hasAssetKey: vi.fn(() => false),
      revision: resourceRevision,
      status: shallowRef('ready'),
    })
    useTabsStoreMock.mockReturnValue(reactive({
      tabs: [{ path: firstPath }, { path: secondPath }],
    }))

    const scope = effectScope()
    scope.run(useEditorDiagnostics)
    diagnosticsStore.publish.mockClear()

    resourceRevision.value++
    await nextTick()

    expect(diagnosticsStore.invalidateSource).toHaveBeenCalledWith('resource')
    expect(diagnosticsStore.publish).toHaveBeenCalledTimes(2)
    expect(diagnosticsStore.publish).toHaveBeenCalledWith(firstPath, [
      expect.objectContaining({ code: 'missing-resource' }),
    ])
    expect(diagnosticsStore.publish).toHaveBeenCalledWith(secondPath, [
      expect.objectContaining({ code: 'missing-resource' }),
    ])
    scope.stop()
  })
})
