import '~/__tests__/mocks/i18n'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  fieldsToTransform,
  parseTransformJson,
  serializeTransform,
  transformToFields,
} from '~/features/editor/effect-editor/effect-editor-config'
import { createEffectEditorProvider, useEffectEditorProvider } from '~/features/editor/effect-editor/useEffectEditorProvider'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { usePreferenceStore } from '~/stores/preference'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { Transform } from '~/domain/stage/types'
import type { EffectEditorDraft } from '~/features/editor/effect-editor/useEffectEditorProvider'
import type { TransformBaselineSessionClient } from '~/features/editor/transform-resolution/baseline-session'
import type { SetEffectPhase } from '~/types/editorPreviewProtocol'

const debugCommanderMock = vi.hoisted(() => ({
  executeCommand: vi.fn<(command: string) => Promise<void>>(async () => { /* no-op */ }),
  setEffect: vi.fn<(target: string, transform: Transform, options?: { phase?: SetEffectPhase }) => Promise<void>>(async () => { /* no-op */ }),
  syncScene: vi.fn<(scenePath: string, lineNumber: number, lineText: string, options?: { transformBaselineRevision?: string, settleMode?: 'immediate' }) => Promise<void>>(async () => { /* no-op */ }),
}))

const previewSyncStoreMock = vi.hoisted(() => ({
  isPreviewReady: true,
  queryBaseTransform: vi.fn(async () => ({ status: 'unavailable' } as const)),
  queryTransformBaseline: vi.fn(async () => ({ status: 'unavailable' } as const)),
}))

const loggerWarnMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())
const notifyWarningMock = vi.hoisted(() => vi.fn())
const modalOpenMock = vi.hoisted(() => vi.fn((
  _name: string,
  payload: { onApply?: () => void, onDiscard?: () => void, onCancel?: () => void },
) => {
  payload.onCancel?.()
}))

vi.mock('~/services/debug-commander', () => ({
  debugCommander: debugCommanderMock,
}))

vi.mock('~/stores/preview-sync', () => ({
  usePreviewSyncStore: () => previewSyncStoreMock,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: () => ({
    open: modalOpenMock,
  }),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: loggerErrorMock,
  warn: loggerWarnMock,
}))

vi.mock('notivue', () => ({
  push: {
    warning: notifyWarningMock,
  },
}))

function createBaseSentence(transformJson: string = ''): ISentence {
  const args = transformJson
    ? [{ key: 'transform', value: transformJson }]
    : []

  return {
    command: commandType.changeFigure,
    commandRaw: 'changeFigure',
    content: 'figure.png',
    args,
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
  }
}

function createBaselineClient(): TransformBaselineSessionClient {
  return {
    queryBaseTransform: vi.fn(async () => ({
      status: 'ready',
      transform: {
        position: { x: 0, y: 20 },
      },
    } as const)),
    queryTransformBaseline: vi.fn(async () => ({
      status: 'ready',
      transform: {
        position: { x: 1000 },
      },
    } as const)),
    syncScene: vi.fn(async () => { /* no-op */ }),
  }
}

function createUnavailableBaselineClient(): TransformBaselineSessionClient {
  return {
    queryBaseTransform: vi.fn(async () => ({
      status: 'unavailable',
    } as const)),
    queryTransformBaseline: vi.fn(async () => ({
      status: 'unavailable',
    } as const)),
    syncScene: vi.fn(async () => { /* no-op */ }),
  }
}

function createProvider(options: {
  baselineClient?: TransformBaselineSessionClient
} = {}) {
  return createEffectEditorProvider({
    baselineClient: options.baselineClient ?? createUnavailableBaselineClient(),
  })
}

function createOpenTarget(options: {
  baseSentence?: ISentence
  effectTarget?: string
  scenePath?: string
  sentenceId?: number
  onApply?: (result: EffectEditorDraft) => void | Promise<void>
} = {}) {
  return {
    baseSentence: options.baseSentence ?? createBaseSentence(),
    effectTarget: options.effectTarget ?? 'fig-center',
    scenePath: options.scenePath ?? 'scene/start.txt',
    sentenceId: options.sentenceId ?? 3,
    onApply: options.onApply ?? (() => { /* no-op */ }),
  }
}

function cloneDraft(draft: EffectEditorDraft): EffectEditorDraft {
  return {
    transform: structuredClone(draft.transform),
    duration: draft.duration,
    ease: draft.ease,
  }
}

function setupImmediateAnimationFrame(): void {
  let nextFrameId = 0
  const frameTimers = new Map<number, ReturnType<typeof setTimeout>>()

  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    nextFrameId += 1
    const frameId = nextFrameId
    const timerId = setTimeout(() => {
      frameTimers.delete(frameId)
      callback(Date.now())
    }, 0)
    frameTimers.set(frameId, timerId)
    return frameId
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((frameId: number) => {
    const timerId = frameTimers.get(frameId)
    if (timerId === undefined) {
      return
    }

    clearTimeout(timerId)
    frameTimers.delete(frameId)
  }))
}

type RuntimeGlobals = typeof globalThis & {
  $ref?: <T>(value: T) => T
  fieldsToTransform?: typeof fieldsToTransform
  logger?: {
    error: (message: string) => void
    info: (message: string) => void
    warn: (message: string) => void
  }
  parseTransformJson?: typeof parseTransformJson
  serializeTransform?: typeof serializeTransform
  toRaw?: <T>(value: T) => T
  transformToFields?: typeof transformToFields
  useI18n?: () => { t: (key: string) => string }
  useModalStore?: () => {
    open: (
      name: string,
      payload: {
        onSave: () => void
        onDontSave: () => void
        onCancel: () => void
      },
      id?: string,
    ) => void
  }
}

const runtimeGlobals = globalThis as RuntimeGlobals
const originalRuntimeGlobals = {
  $ref: runtimeGlobals.$ref,
  toRaw: runtimeGlobals.toRaw,
  useI18n: runtimeGlobals.useI18n,
  parseTransformJson: runtimeGlobals.parseTransformJson,
  serializeTransform: runtimeGlobals.serializeTransform,
  fieldsToTransform: runtimeGlobals.fieldsToTransform,
  transformToFields: runtimeGlobals.transformToFields,
  logger: runtimeGlobals.logger,
  useModalStore: runtimeGlobals.useModalStore,
}

function restoreRuntimeGlobal<K extends keyof typeof originalRuntimeGlobals>(
  key: K,
  value: (typeof originalRuntimeGlobals)[K],
) {
  if (value === undefined) {
    delete runtimeGlobals[key]
    return
  }
  runtimeGlobals[key] = value as RuntimeGlobals[K]
}

beforeAll(() => {
  runtimeGlobals.$ref = value => value
  runtimeGlobals.toRaw = value => value
  runtimeGlobals.useI18n = () => ({ t: key => key })
  runtimeGlobals.parseTransformJson = parseTransformJson
  runtimeGlobals.serializeTransform = serializeTransform
  runtimeGlobals.fieldsToTransform = fieldsToTransform
  runtimeGlobals.transformToFields = transformToFields
  runtimeGlobals.logger = {
    error() { /* no-op */ },
    info() { /* no-op */ },
    warn() { /* no-op */ },
  }
  runtimeGlobals.useModalStore = () => ({
    open(_name, payload) {
      payload.onCancel()
    },
  })
})

afterAll(() => {
  restoreRuntimeGlobal('$ref', originalRuntimeGlobals.$ref)
  restoreRuntimeGlobal('toRaw', originalRuntimeGlobals.toRaw)
  restoreRuntimeGlobal('useI18n', originalRuntimeGlobals.useI18n)
  restoreRuntimeGlobal('parseTransformJson', originalRuntimeGlobals.parseTransformJson)
  restoreRuntimeGlobal('serializeTransform', originalRuntimeGlobals.serializeTransform)
  restoreRuntimeGlobal('fieldsToTransform', originalRuntimeGlobals.fieldsToTransform)
  restoreRuntimeGlobal('transformToFields', originalRuntimeGlobals.transformToFields)
  restoreRuntimeGlobal('logger', originalRuntimeGlobals.logger)
  restoreRuntimeGlobal('useModalStore', originalRuntimeGlobals.useModalStore)
})

beforeEach(() => {
  setupImmediateAnimationFrame()

  const editSettingsStore = useEditSettingsStore()
  editSettingsStore.enableLivePreview = true
  editSettingsStore.enableRealtimeEffectPreview = true
  editSettingsStore.autoApplyEffectEditorChanges = true

  debugCommanderMock.setEffect.mockReset()
  debugCommanderMock.executeCommand.mockReset()
  debugCommanderMock.syncScene.mockReset()
  debugCommanderMock.executeCommand.mockImplementation(async () => { /* no-op */ })
  debugCommanderMock.setEffect.mockImplementation(async () => { /* no-op */ })
  debugCommanderMock.syncScene.mockImplementation(async () => { /* no-op */ })
  modalOpenMock.mockReset()
  modalOpenMock.mockImplementation((
    _name: string,
    payload: { onApply?: () => void, onDiscard?: () => void, onCancel?: () => void },
  ) => {
    payload.onCancel?.()
  })
  previewSyncStoreMock.queryBaseTransform.mockReset()
  previewSyncStoreMock.queryTransformBaseline.mockReset()
  previewSyncStoreMock.isPreviewReady = true
  loggerWarnMock.mockReset()
  loggerErrorMock.mockReset()
  notifyWarningMock.mockReset()
  previewSyncStoreMock.queryBaseTransform.mockImplementation(async () => ({ status: 'unavailable' }))
  previewSyncStoreMock.queryTransformBaseline.mockImplementation(async () => ({ status: 'unavailable' }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useEffectEditorProvider', () => {
  it('预览面板关闭时会丢弃运行时请求但仍允许应用脚本变更', async () => {
    usePreferenceStore().showPreviewPanel = false
    useEditSettingsStore().autoApplyEffectEditorChanges = false
    const applyMock = vi.fn()
    const provider = createProvider()

    await provider.open(createOpenTarget({ onApply: applyMock }))
    provider.updateDraft({ transform: { blur: 12 } })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(provider.canApply).toBe(true)
    })

    expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()
    await expect(provider.apply()).resolves.toBe(true)
    expect(applyMock).toHaveBeenCalledWith(expect.objectContaining({
      transform: { blur: 12 },
    }))
    expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()
  })

  it('未产生 visual preview 时关闭效果编辑器不会重复恢复场景预览', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false
    const provider = createEffectEditorProvider()

    await provider.open(createOpenTarget({
      scenePath: '/games/demo/game/scene/start.txt',
    }))

    await vi.waitFor(() => {
      expect(debugCommanderMock.syncScene).toHaveBeenCalledWith(
        '/games/demo/game/scene/start.txt',
        3,
        'changeFigure:figure.png;',
        {
          settleMode: 'immediate',
        },
      )
    })

    const closed = await provider.close()

    expect(closed).toBe(true)
    expect(debugCommanderMock.syncScene).toHaveBeenCalledTimes(1)
    expect(debugCommanderMock.syncScene).toHaveBeenLastCalledWith(
      '/games/demo/game/scene/start.txt',
      3,
      'changeFigure:figure.png;',
      {
        settleMode: 'immediate',
      },
    )
  })

  it('打开普通效果编辑器时会解析基础基线并立即同步场景', async () => {
    const baselineClient = createBaselineClient()
    const provider = createProvider({ baselineClient })

    await provider.open(createOpenTarget())

    await vi.waitFor(() => {
      expect(provider.session?.baselineTransform).toEqual({
        position: { x: 0, y: 20 },
      })
    })

    expect(baselineClient.syncScene).toHaveBeenCalledWith(
      'scene/start.txt',
      3,
      'changeFigure:figure.png;',
      {
        settleMode: 'immediate',
      },
    )
    expect(baselineClient.queryBaseTransform).toHaveBeenCalledTimes(1)
    expect(baselineClient.queryTransformBaseline).not.toHaveBeenCalled()
    expect(provider.session?.baselineTransform).toEqual({
      position: { x: 0, y: 20 },
    })
  })

  it('基线查询失败后会结束等待状态', async () => {
    const baselineClient = createUnavailableBaselineClient()
    vi.mocked(baselineClient.queryBaseTransform).mockRejectedValueOnce(new Error('query failed'))
    const provider = createProvider({ baselineClient })

    await provider.open(createOpenTarget())

    await vi.waitFor(() => {
      expect(provider.session?.baselineResolved).toBe(true)
    })

    expect(provider.session?.baselineSource).toBe('unknown')
    expect(provider.session?.baselineTransform).toBeUndefined()
    expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining('解析效果编辑器 transform baseline 失败'))
  })

  it('将变换设置为默认值时仍应视为可应用改动', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const applyCalls: EffectEditorDraft[] = []
    const provider = createProvider()

    await provider.open(createOpenTarget({
      onApply(result) {
        applyCalls.push(cloneDraft(result))
      },
    }))

    expect(provider.canApply).toBe(false)

    provider.updateDraft({ transform: { blur: 0 } })
    expect(provider.canApply).toBe(true)

    const applied = await provider.apply()
    expect(applied).toBe(true)
    expect(applyCalls).toHaveLength(1)
    expect(applyCalls[0]?.transform.blur).toBe(0)
  })

  it('实时预览在字段被清除后会发送缺失该字段的效果', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"alpha":0.5,"blur":8}'),
    }))

    provider.updateDraft({ transform: { alpha: 0.5 } })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })

    expect(debugCommanderMock.syncScene).not.toHaveBeenCalled()
    expect(debugCommanderMock.executeCommand).not.toHaveBeenCalled()
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {
      alpha: 0.5,
    }, {
      phase: 'preview',
    })
  })

  it('实时预览在最后一个显式字段被清除后发送空变换', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: {} })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })

    expect(debugCommanderMock.syncScene).not.toHaveBeenCalled()
    expect(debugCommanderMock.executeCommand).not.toHaveBeenCalled()
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {}, {
      phase: 'preview',
    })
  })

  it('实时预览在字段更新时会发送最新效果', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })

    expect(debugCommanderMock.syncScene).not.toHaveBeenCalled()
    expect(debugCommanderMock.executeCommand).not.toHaveBeenCalled()
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {
      blur: 12,
    }, {
      phase: 'preview',
    })
  })

  it('实时预览发送 preview phase 并在 flush 时提交 commit phase', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })

    provider.requestPreview({ schedule: 'immediate', flush: true })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(2)
    })

    expect(debugCommanderMock.setEffect.mock.calls[0]).toEqual([
      'fig-center',
      { blur: 12 },
      { phase: 'preview' },
    ])
    expect(debugCommanderMock.setEffect.mock.calls[1]).toEqual([
      'fig-center',
      { blur: 12 },
      { phase: 'commit' },
    ])
  })

  it('应用效果编辑器时会先发送最终 commit phase 再更新本地提交基线', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false
    const applyCalls: EffectEditorDraft[] = []
    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
      onApply(result) {
        applyCalls.push(cloneDraft(result))
      },
    }))

    provider.updateDraft({ transform: { blur: 12 } })

    const applied = await provider.apply()

    expect(applied).toBe(true)
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 12 }, {
      phase: 'commit',
    })
    expect(applyCalls).toEqual([
      {
        duration: '',
        ease: '',
        transform: { blur: 12 },
      },
    ])
  })

  it('应用仅修改时长和缓动的草稿不会发送 runtime commit 但会持久化编辑器草稿', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const applyCalls: EffectEditorDraft[] = []
    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: {
        ...createBaseSentence('{"blur":8}'),
        args: [
          { key: 'transform', value: '{"blur":8}' },
          { key: 'duration', value: '100' },
          { key: 'ease', value: 'easeIn' },
        ],
      },
      onApply(result) {
        applyCalls.push(cloneDraft(result))
      },
    }))

    provider.updateDraft({ duration: '300', ease: 'easeOut' })

    const applied = await provider.apply()

    expect(applied).toBe(true)
    expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()
    expect(applyCalls).toEqual([
      {
        duration: '300',
        ease: 'easeOut',
        transform: { blur: 8 },
      },
    ])
  })

  it('同一帧内多次 immediate preview 只发送最新草稿', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const frameCallbacks: FrameRequestCallback[] = []
    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })
    provider.updateDraft({ transform: { blur: 16 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })
    provider.updateDraft({ transform: { blur: 20 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()
    expect(frameCallbacks).toHaveLength(1)

    frameCallbacks[0]?.(16)

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 20 }, {
      phase: 'preview',
    })
  })

  it('预览覆盖态不会改写响应式 draft，且同一帧只发送最新覆盖值', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const frameCallbacks: FrameRequestCallback[] = []
    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    provider.updatePreviewTransform(() => ({ blur: 12 }))
    provider.requestPreview({ schedule: 'immediate' })
    provider.updatePreviewTransform(() => ({ blur: 20 }))
    provider.requestPreview({ schedule: 'immediate' })

    expect(provider.session?.draft.transform).toEqual({ blur: 8 })
    expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()
    expect(frameCallbacks).toHaveLength(1)

    frameCallbacks[0]?.(16)

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 20 }, {
      phase: 'preview',
    })
    expect(provider.session?.draft.transform).toEqual({ blur: 8 })
  })

  it('preview in-flight 时只保留最新 transform 并丢弃旧中间值', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const previewCalls: Transform[] = []
    const previewResolvers: (() => void)[] = []
    const provider = createProvider()

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform) => {
      previewCalls.push(structuredClone(transform))
      await new Promise<void>((resolve) => {
        previewResolvers.push(resolve)
      })
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(previewCalls).toEqual([{ blur: 12 }])
    })

    provider.updateDraft({ transform: { blur: 16 } })
    provider.requestPreview({ schedule: 'immediate' })
    provider.updateDraft({ transform: { blur: 20 } })
    provider.requestPreview({ schedule: 'immediate' })

    expect(previewCalls).toEqual([{ blur: 12 }])

    previewResolvers[0]?.()
    await vi.waitFor(() => {
      expect(previewCalls).toEqual([
        { blur: 12 },
        { blur: 20 },
      ])
    })

    expect(debugCommanderMock.setEffect.mock.calls.map(call => call[2])).toEqual([
      { phase: 'preview' },
      { phase: 'preview' },
    ])
  })

  it('preview accepted 状态未知时关闭会尝试恢复 runtime 可见状态', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()
    let callCount = 0

    debugCommanderMock.setEffect.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('preview command timeout')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })

    const closed = await provider.close({ forceDiscard: true })

    expect(closed).toBe(true)
    expect(debugCommanderMock.setEffect.mock.calls).toEqual([
      ['fig-center', { blur: 12 }, { phase: 'preview' }],
      ['fig-center', { blur: 8 }, { phase: 'preview' }],
    ])
  })

  it('scope dispose 会恢复 visual preview 并废弃当前 session', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const scope = effectScope()
    let provider: ReturnType<typeof createEffectEditorProvider> | undefined

    scope.run(() => {
      provider = createProvider()
    })
    if (!provider) {
      throw new Error('effect editor provider was not created')
    }

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 12 }, {
        phase: 'preview',
      })
    })

    debugCommanderMock.setEffect.mockClear()
    scope.stop()

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 8 }, {
        phase: 'preview',
      })
    })
    expect(provider.isOpen).toBe(false)
    expect(provider.session).toBeUndefined()
  })

  it('useEffectEditorProvider 创建的 provider 会在 scope dispose 时恢复 preview', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const scope = effectScope()
    let provider: ReturnType<typeof useEffectEditorProvider> | undefined

    scope.run(() => {
      provider = useEffectEditorProvider()
    })
    if (!provider) {
      throw new Error('effect editor provider was not created')
    }

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 12 }, {
        phase: 'preview',
      })
    })

    debugCommanderMock.setEffect.mockClear()
    scope.stop()

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 8 }, {
        phase: 'preview',
      })
    })
  })

  it('scope dispose 恢复失败时废弃当前 session', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const scope = effectScope()
    let provider: ReturnType<typeof createEffectEditorProvider> | undefined

    scope.run(() => {
      provider = createProvider()
    })
    if (!provider) {
      throw new Error('effect editor provider was not created')
    }

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      if (options?.phase === 'preview' && transform.blur === 8) {
        throw new Error('restore failed')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 12 }, {
        phase: 'preview',
      })
    })

    debugCommanderMock.setEffect.mockClear()
    scope.stop()

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 8 }, {
        phase: 'preview',
      })
    })
    await vi.waitFor(() => {
      expect(provider?.isOpen).toBe(false)
    })
    expect(provider.session).toBeUndefined()
  })

  it('preview 明确失败后保留草稿并继续发送最新预览', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    debugCommanderMock.setEffect.mockRejectedValueOnce(new Error('preview failed'))

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })

    debugCommanderMock.setEffect.mockClear()
    provider.updateDraft({ transform: { blur: 20 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 20 }, {
        phase: 'preview',
      })
    })
    expect(provider.session?.draft.transform).toEqual({ blur: 20 })
  })

  it('应用效果编辑器时 final commit 会排在已发送 preview 后', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const order: string[] = []
    const previewResolvers: (() => void)[] = []
    const provider = createProvider()

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      if (options?.phase === 'preview' && transform.blur === 12) {
        order.push('preview:start')
        await new Promise<void>((resolve) => {
          previewResolvers.push(resolve)
        })
        order.push('preview:end')
        return
      }

      order.push(`${options?.phase}:${transform.blur}`)
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(order).toEqual(['preview:start'])
    })

    provider.updateDraft({ transform: { blur: 20 } })
    const applyPromise = provider.apply()

    await Promise.resolve()
    expect(order).toEqual(['preview:start'])

    previewResolvers[0]?.()
    await applyPromise

    expect(order).toEqual(['preview:start', 'preview:end', 'commit:20'])
  })

  it('flush commit 会使用触发 flush 时的草稿快照', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const order: string[] = []
    const previewResolvers: (() => void)[] = []
    const provider = createProvider()

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      if (options?.phase === 'preview' && transform.blur === 12) {
        order.push('preview:start:12')
        await new Promise<void>((resolve) => {
          previewResolvers.push(resolve)
        })
        order.push('preview:end:12')
        return
      }

      order.push(`${options?.phase}:${transform.blur}`)
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(order).toEqual(['preview:start:12'])
    })

    provider.updateDraft({ transform: { blur: 16 } })
    provider.requestPreview({ schedule: 'immediate', flush: true })
    provider.updateDraft({ transform: { blur: 20 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    previewResolvers[0]?.()
    await vi.waitFor(() => {
      expect(order).toEqual(['preview:start:12', 'preview:end:12', 'commit:16', 'preview:20'])
    })
  })

  it('普通实时预览会跳过相同变换但 flush 会提交最终 commit', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: false })
    provider.requestPreview({ schedule: 'continuous', flush: true })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(2)
    })

    expect(debugCommanderMock.setEffect.mock.calls.map(call => call[2])).toEqual([
      { phase: 'preview' },
      { phase: 'commit' },
    ])
  })

  it('flush 时变换等于提交基线且没有可见预览污染时不会发送 runtime commit', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.requestPreview({ schedule: 'immediate', flush: true })
    await Promise.resolve()

    expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()
  })

  it('flush 是 no-op 时缺少 target 不会产生缺失 target 警告', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
      effectTarget: '',
    }))

    provider.requestPreview({ schedule: 'immediate', flush: true })
    await Promise.resolve()

    expect(loggerWarnMock).not.toHaveBeenCalled()
    expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()
  })

  it('清除完整草稿后会发送空效果预览，并可通过撤销恢复清除前草稿', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()
    const baseSentence = createBaseSentence('{"blur":8}')
    baseSentence.args.push(
      { key: 'duration', value: '300' },
      { key: 'ease', value: 'easeInOut' },
    )

    await provider.open(createOpenTarget({
      baseSentence,
    }))

    expect(provider.canClear).toBe(true)
    expect(provider.clearDraft()).toBe(true)

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {}, {
        phase: 'preview',
      })
    })

    expect(provider.session?.draft).toEqual({
      duration: '',
      ease: '',
      transform: {},
    })
    expect(provider.canApply).toBe(true)
    expect(provider.canClear).toBe(false)
    expect(provider.clearDraft()).toBe(false)
    expect(modalOpenMock).not.toHaveBeenCalled()

    debugCommanderMock.setEffect.mockClear()

    expect(provider.undoDraft()).toBe(true)
    expect(provider.session?.draft).toEqual({
      duration: '300',
      ease: 'easeInOut',
      transform: { blur: 8 },
    })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 8 }, {
        phase: 'preview',
      })
    })
  })

  it('清除未结算的连续编辑草稿时会把清除前状态保留为独立撤销项', async () => {
    const editSettings = useEditSettingsStore()
    editSettings.autoApplyEffectEditorChanges = false
    editSettings.enableRealtimeEffectPreview = false

    const provider = createProvider()
    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    expect(provider.clearDraft()).toBe(true)

    expect(provider.undoDraft()).toBe(true)
    expect(provider.session?.draft.transform).toEqual({ blur: 12 })

    expect(provider.undoDraft()).toBe(true)
    expect(provider.session?.draft.transform).toEqual({ blur: 8 })
  })

  it('关闭并丢弃未应用变更时通过打开表单时的 transform 重置预览', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const baselineClient = createUnavailableBaselineClient()
    const provider = createProvider({ baselineClient })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))
    await vi.waitFor(() => {
      expect(baselineClient.syncScene).toHaveBeenCalled()
    })
    vi.mocked(baselineClient.syncScene).mockClear()

    provider.updateDraft({ transform: { blur: 12 } })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {
        blur: 12,
      }, {
        phase: 'preview',
      })
    })

    debugCommanderMock.setEffect.mockClear()

    const closed = await provider.close({ forceDiscard: true })

    expect(closed).toBe(true)
    expect(debugCommanderMock.syncScene).not.toHaveBeenCalled()
    expect(debugCommanderMock.executeCommand).not.toHaveBeenCalled()
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {
      blur: 8,
    }, {
      phase: 'preview',
    })
    expect(baselineClient.syncScene).not.toHaveBeenCalled()
  })

  it('关闭时等待已发送 preview 完成后再发送 restore preview', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const order: string[] = []
    const previewResolvers: (() => void)[] = []
    const baselineClient = createUnavailableBaselineClient()
    const provider = createProvider({ baselineClient })

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      if (options?.phase === 'preview' && transform.blur === 12) {
        order.push('preview:start')
        await new Promise<void>((resolve) => {
          previewResolvers.push(resolve)
        })
        order.push('preview:end')
        return
      }

      order.push(`${options?.phase}:${transform.blur}`)
    })
    vi.mocked(baselineClient.syncScene).mockImplementation(async () => {
      order.push('sync')
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))
    await vi.waitFor(() => {
      expect(baselineClient.syncScene).toHaveBeenCalled()
    })
    order.length = 0
    vi.mocked(baselineClient.syncScene).mockClear()

    provider.updateDraft({ transform: { blur: 12 } })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(order).toEqual(['preview:start'])
    })

    const closePromise = provider.close({ forceDiscard: true })
    await Promise.resolve()

    expect(order).toEqual(['preview:start'])

    previewResolvers[0]?.()
    await closePromise

    expect(order).toEqual(['preview:start', 'preview:end', 'preview:8'])
    expect(baselineClient.syncScene).not.toHaveBeenCalled()
  })

  it('关闭发生在 deferred 交互批处理中时会恢复到 committed base draft', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 16 } })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 16 }, {
        phase: 'preview',
      })
    })

    debugCommanderMock.setEffect.mockClear()

    provider.updateDraft({ transform: { blur: 20 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 20 }, {
        phase: 'preview',
      })
    })

    debugCommanderMock.setEffect.mockClear()

    const closed = await provider.close({ forceDiscard: true })

    expect(closed).toBe(true)
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 8 }, {
      phase: 'preview',
    })
  })

  it('自动应用开启时关闭 deferred 交互不会把当前拖拽草稿提交为 commit', async () => {
    const applyCalls: EffectEditorDraft[] = []
    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
      onApply(result) {
        applyCalls.push(cloneDraft(result))
      },
    }))

    provider.updateDraft({ transform: { blur: 16 } })

    await vi.waitFor(() => {
      expect(applyCalls.map(call => call.transform)).toEqual([{ blur: 16 }])
    })
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 16 }, {
      phase: 'commit',
    })
    debugCommanderMock.setEffect.mockClear()

    provider.updateDraft({ transform: { blur: 20 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 20 }, {
        phase: 'preview',
      })
    })
    debugCommanderMock.setEffect.mockClear()

    const closed = await provider.close()

    expect(closed).toBe(true)
    expect(applyCalls.map(call => call.transform)).toEqual([{ blur: 16 }])
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 16 }, {
      phase: 'preview',
    })
    expect(debugCommanderMock.setEffect).not.toHaveBeenCalledWith('fig-center', { blur: 20 }, {
      phase: 'commit',
    })
  })

  it('关闭弹窗取消时会恢复 deferred 交互的 rollback preview', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 16 } })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 16 }, {
        phase: 'preview',
      })
    })
    debugCommanderMock.setEffect.mockClear()

    provider.updateDraft({ transform: { blur: 20 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 20 }, {
        phase: 'preview',
      })
    })
    debugCommanderMock.setEffect.mockClear()

    const closed = await provider.close()

    expect(closed).toBe(false)
    expect(provider.isOpen).toBe(true)
    expect(provider.session?.draft.transform).toEqual({ blur: 16 })
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 16 }, {
      phase: 'preview',
    })
  })

  it('关闭时 restore 明确失败会保留 session 并允许再次恢复', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()
    let failRestore = true

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      if (options?.phase === 'preview' && transform.blur === 8 && failRestore) {
        throw new Error('restore failed')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 12 }, {
        phase: 'preview',
      })
    })

    const closed = await provider.close({ forceDiscard: true })

    expect(closed).toBe(false)
    expect(provider.isOpen).toBe(true)

    failRestore = false
    debugCommanderMock.setEffect.mockClear()
    const retriedClosed = await provider.close({ forceDiscard: true })

    expect(retriedClosed).toBe(true)
    expect(provider.isOpen).toBe(false)
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 8 }, {
      phase: 'preview',
    })
  })

  it('关闭时 restore 普通 timeout 会保留 session 并允许再次恢复', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()
    let failRestore = true

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      if (options?.phase === 'preview' && transform.blur === 8 && failRestore) {
        failRestore = false
        throw new Error('preview.command.set-effect command timeout')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 12 }, {
        phase: 'preview',
      })
    })

    const closed = await provider.close({ forceDiscard: true })

    expect(closed).toBe(false)
    expect(provider.isOpen).toBe(true)

    debugCommanderMock.setEffect.mockClear()
    const retriedClosed = await provider.close({ forceDiscard: true })

    expect(retriedClosed).toBe(true)
    expect(provider.isOpen).toBe(false)
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 8 }, {
      phase: 'preview',
    })
  })

  it('commit 明确失败后会保留草稿并允许继续预览最新草稿', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()
    const failCommit = true

    debugCommanderMock.setEffect.mockImplementation(async (_target, _transform, options) => {
      if (options?.phase === 'commit' && failCommit) {
        throw new Error('commit failed')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } })
    expect(await provider.apply()).toBe(false)
    expect(provider.session?.draft.transform).toEqual({ blur: 12 })

    debugCommanderMock.setEffect.mockClear()
    provider.updateDraft({ transform: { blur: 20 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 20 }, {
        phase: 'preview',
      })
    })
    expect(provider.session?.draft.transform).toEqual({ blur: 20 })
  })

  it('commit accepted 状态未知后会阻止新的交互预览', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    debugCommanderMock.setEffect.mockImplementation(async (_target, _transform, options) => {
      if (options?.phase === 'commit') {
        throw new Error('preview state reset')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } })
    expect(await provider.apply()).toBe(false)

    debugCommanderMock.setEffect.mockClear()
    provider.updateDraft({ transform: { blur: 20 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()
    expect(provider.session?.draft.transform).toEqual({ blur: 12 })
  })

  it('commit accepted 状态未知后关闭会提示运行时预览未同步', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    debugCommanderMock.setEffect.mockImplementation(async (_target, _transform, options) => {
      if (options?.phase === 'commit') {
        throw new Error('preview state reset')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } })
    expect(await provider.apply()).toBe(false)

    const closed = await provider.close()

    expect(closed).toBe(false)
    expect(provider.isOpen).toBe(true)
    expect(notifyWarningMock).toHaveBeenCalledWith({
      message: 'modals.effectEditor.previewUnsyncedCloseBlockedMessage',
      title: 'modals.effectEditor.previewUnsyncedCloseBlockedTitle',
    })

    const forceClosed = await provider.close({ forceDiscard: true })

    expect(forceClosed).toBe(true)
    expect(provider.isOpen).toBe(false)
  })

  it('commit 普通 timeout 后允许继续预览并基于最新草稿再次应用', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()
    const commitTransforms: Transform[] = []
    let failFirstCommit = true

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      if (options?.phase !== 'commit') {
        return
      }

      commitTransforms.push(structuredClone(transform))
      if (failFirstCommit) {
        failFirstCommit = false
        throw new Error('preview.command.set-effect command timeout')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } })
    expect(await provider.apply()).toBe(false)

    debugCommanderMock.setEffect.mockClear()
    provider.updateDraft({ transform: { blur: 20 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 20 }, {
        phase: 'preview',
      })
    })

    expect(await provider.apply()).toBe(true)
    expect(commitTransforms).toEqual([{ blur: 12 }, { blur: 20 }])
  })

  it('commit 明确失败后 discard close 可以关闭 session', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()
    const failCommit = true

    modalOpenMock.mockImplementation((
      _name: string,
      payload: { onApply?: () => void, onDiscard?: () => void, onCancel?: () => void },
    ) => {
      payload.onDiscard?.()
    })
    debugCommanderMock.setEffect.mockImplementation(async (_target, _transform, options) => {
      if (options?.phase === 'commit' && failCommit) {
        throw new Error('commit failed')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } })
    expect(await provider.apply()).toBe(false)

    const closed = await provider.close()

    expect(closed).toBe(true)
    expect(provider.isOpen).toBe(false)
  })

  it('runtime commit 成功但编辑器应用失败后丢弃关闭会恢复 runtime 可见状态', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
      onApply() {
        throw new Error('apply failed')
      },
    }))

    provider.updateDraft({ transform: { blur: 12 } })
    expect(await provider.apply()).toBe(false)
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 12 }, {
      phase: 'commit',
    })

    debugCommanderMock.setEffect.mockClear()

    const closed = await provider.close({ forceDiscard: true })

    expect(closed).toBe(true)
    expect(provider.isOpen).toBe(false)
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 8 }, {
      phase: 'preview',
    })
  })

  it('commit accepted 状态未知且有未保存草稿时重新打开不会废弃旧 session', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()
    const failCommit = true

    debugCommanderMock.setEffect.mockImplementation(async (_target, _transform, options) => {
      if (options?.phase === 'commit' && failCommit) {
        throw new Error('preview state reset')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } })
    expect(await provider.apply()).toBe(false)

    const previousSessionId = provider.session?.sessionId
    notifyWarningMock.mockClear()
    debugCommanderMock.setEffect.mockClear()

    const opened = await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":4}'),
      effectTarget: 'fig-right',
    }))

    expect(opened).toBe(false)
    expect(provider.isOpen).toBe(true)
    expect(provider.session?.sessionId).toBe(previousSessionId)
    expect(provider.session?.effectTarget).toBe('fig-center')
    expect(provider.session?.draft.transform).toEqual({ blur: 12 })
    expect(notifyWarningMock).toHaveBeenCalledWith({
      message: 'modals.effectEditor.previewUnsyncedCloseBlockedMessage',
      title: 'modals.effectEditor.previewUnsyncedCloseBlockedTitle',
    })
  })

  it('scope dispose 在 commit 明确失败后会关闭当前 preview session', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const scope = effectScope()
    let provider: ReturnType<typeof createEffectEditorProvider> | undefined

    scope.run(() => {
      provider = createProvider()
    })
    if (!provider) {
      throw new Error('effect editor provider was not created')
    }

    debugCommanderMock.setEffect.mockImplementation(async (_target, _transform, options) => {
      if (options?.phase === 'commit') {
        throw new Error('commit failed')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } })
    expect(await provider.apply()).toBe(false)

    scope.stop()

    await vi.waitFor(() => {
      expect(provider?.isOpen).toBe(false)
    })
    expect(provider.session).toBeUndefined()
  })

  it('commit in-flight 期间继续编辑时明确失败后不会重试旧快照并允许再次应用最新草稿', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const commitResolvers: (() => void)[] = []
    const commitTransforms: Transform[] = []
    const provider = createProvider()

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      if (options?.phase !== 'commit') {
        return
      }

      commitTransforms.push(structuredClone(transform))
      if (commitTransforms.length === 1) {
        await new Promise<void>((resolve) => {
          commitResolvers.push(resolve)
        })
        throw new Error('commit failed')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } })
    const firstApply = provider.apply()

    await vi.waitFor(() => {
      expect(commitTransforms).toEqual([{ blur: 12 }])
    })

    provider.updateDraft({ transform: { blur: 20 } }, { deferAutoApply: true })
    commitResolvers[0]?.()

    await expect(firstApply).resolves.toBe(false)
    expect(provider.session?.draft.transform).toEqual({ blur: 20 })
    expect(commitTransforms).toEqual([{ blur: 12 }])

    await expect(provider.apply()).resolves.toBe(true)
    expect(commitTransforms).toEqual([{ blur: 12 }, { blur: 20 }])
  })

  it('commit 明确失败后会继续发送已经排队的最新 preview', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const order: string[] = []
    const previewResolvers: (() => void)[] = []
    const provider = createProvider()

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      if (options?.phase === 'preview' && transform.blur === 12) {
        order.push('preview:start:12')
        await new Promise<void>((resolve) => {
          previewResolvers.push(resolve)
        })
        order.push('preview:end:12')
        return
      }

      order.push(`${options?.phase}:${transform.blur}`)
      if (options?.phase === 'commit' && transform.blur === 16) {
        throw new Error('commit failed')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(order).toEqual(['preview:start:12'])
    })

    provider.updateDraft({ transform: { blur: 16 } })
    provider.requestPreview({ schedule: 'immediate', flush: true })
    provider.updateDraft({ transform: { blur: 20 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    previewResolvers[0]?.()

    await vi.waitFor(() => {
      expect(order).toEqual(['preview:start:12', 'preview:end:12', 'commit:16', 'preview:20'])
    })
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 20 }, {
      phase: 'preview',
    })
  })

  it('commit accepted 状态未知后不会继续发送已经排队的后续 preview', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const order: string[] = []
    const previewResolvers: (() => void)[] = []
    const provider = createProvider()

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      if (options?.phase === 'preview' && transform.blur === 12) {
        order.push('preview:start:12')
        await new Promise<void>((resolve) => {
          previewResolvers.push(resolve)
        })
        order.push('preview:end:12')
        return
      }

      order.push(`${options?.phase}:${transform.blur}`)
      if (options?.phase === 'commit' && transform.blur === 16) {
        throw new Error('preview state reset')
      }
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(order).toEqual(['preview:start:12'])
    })

    provider.updateDraft({ transform: { blur: 16 } })
    provider.requestPreview({ schedule: 'immediate', flush: true })
    provider.updateDraft({ transform: { blur: 20 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })

    previewResolvers[0]?.()

    await vi.waitFor(() => {
      expect(order).toEqual(['preview:start:12', 'preview:end:12', 'commit:16'])
    })
    expect(debugCommanderMock.setEffect).not.toHaveBeenCalledWith('fig-center', { blur: 20 }, {
      phase: 'preview',
    })
  })

  it('自动应用清除时会先同步空效果预览，再提交 runtime 并持久化空草稿', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = true

    const order: string[] = []
    const applyCalls: EffectEditorDraft[] = []
    const provider = createProvider()

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      order.push(`${options?.phase}:${JSON.stringify(transform)}`)
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
      onApply(result) {
        order.push(`apply:${JSON.stringify(result.transform)}`)
        applyCalls.push(cloneDraft(result))
      },
    }))

    expect(provider.clearDraft()).toBe(true)

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {}, {
        phase: 'preview',
      })
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {}, {
        phase: 'commit',
      })
    })
    await vi.waitFor(() => {
      expect(applyCalls).toEqual([
        {
          duration: '',
          ease: '',
          transform: {},
        },
      ])
    })
    expect(order).toEqual([
      'preview:{}',
      'commit:{}',
      'apply:{}',
    ])
  })

  it('取消未发送的 queued preview 不会同步场景', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const baselineClient = createUnavailableBaselineClient()
    const provider = createProvider({ baselineClient })
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ transform: { blur: 12 } })
    provider.requestPreview({ schedule: 'frame' })
    await provider.cancelPreview()

    expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()
    expect(baselineClient.syncScene).not.toHaveBeenCalled()
  })

  it('取消交互会丢弃尚未触发的 continuous trailing preview', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false
    vi.useFakeTimers()
    vi.setSystemTime(0)

    try {
      const provider = createProvider()

      await provider.open(createOpenTarget({
        baseSentence: createBaseSentence('{"blur":8}'),
      }))

      provider.updateDraft({ transform: { blur: 16 } })
      provider.updateDraft({ transform: { blur: 20 } }, { deferAutoApply: true })
      provider.requestPreview({ schedule: 'continuous' })

      expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()

      await provider.cancelPreview()
      await vi.advanceTimersByTimeAsync(40)

      expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()
      expect(provider.session?.draft.transform).toEqual({ blur: 16 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('取消已发送 preview 时会等待 preview 后发送 rollback draft restore', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const order: string[] = []
    const previewResolvers: (() => void)[] = []
    const baselineClient = createUnavailableBaselineClient()
    const provider = createProvider({ baselineClient })

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      if (options?.phase === 'preview' && transform.blur === 12) {
        order.push('preview:start')
        await new Promise<void>((resolve) => {
          previewResolvers.push(resolve)
        })
        order.push('preview:end')
        return
      }

      order.push(`${options?.phase}:${transform.blur}`)
    })
    vi.mocked(baselineClient.syncScene).mockImplementation(async () => {
      order.push('sync')
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))
    await vi.waitFor(() => {
      expect(baselineClient.syncScene).toHaveBeenCalled()
    })
    order.length = 0
    vi.mocked(baselineClient.syncScene).mockClear()

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(order).toEqual(['preview:start'])
    })

    const cancelPromise = provider.cancelPreview()
    await Promise.resolve()

    expect(order).toEqual(['preview:start'])

    previewResolvers[0]?.()
    await cancelPromise

    expect(order).toEqual(['preview:start', 'preview:end', 'preview:8'])
    expect(provider.session?.draft.transform).toEqual({ blur: 8 })
    expect(baselineClient.syncScene).not.toHaveBeenCalled()
  })

  it('取消回滚后显式预览 rollback transform 不依赖额外 runtime 字段去重', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const baselineClient = createUnavailableBaselineClient()
    const provider = createProvider({ baselineClient })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))
    vi.mocked(baselineClient.syncScene).mockClear()

    provider.updateDraft({ transform: { blur: 12 } })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })

    await provider.cancelPreview()
    debugCommanderMock.setEffect.mockClear()

    provider.requestPreview({ schedule: 'immediate' })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 12 }, {
        phase: 'preview',
      })
    })
  })

  it('关闭已接管回滚时交互取消不会额外发送 restore preview', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const order: string[] = []
    const previewResolvers: (() => void)[] = []
    const baselineClient = createUnavailableBaselineClient()
    const provider = createProvider({ baselineClient })

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      if (options?.phase === 'preview' && transform.blur === 12) {
        order.push('preview:start')
        await new Promise<void>((resolve) => {
          previewResolvers.push(resolve)
        })
        order.push('preview:end')
        return
      }

      order.push(`${options?.phase}:${transform.blur}`)
    })
    vi.mocked(baselineClient.syncScene).mockImplementation(async () => {
      order.push('sync')
    })

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))
    await vi.waitFor(() => {
      expect(baselineClient.syncScene).toHaveBeenCalled()
    })
    order.length = 0
    vi.mocked(baselineClient.syncScene).mockClear()

    provider.updateDraft({ transform: { blur: 12 } })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(order).toEqual(['preview:start'])
    })

    const closePromise = provider.close({ forceDiscard: true })
    const cancelPromise = provider.cancelPreview()
    await Promise.resolve()

    previewResolvers[0]?.()
    await Promise.all([closePromise, cancelPromise])

    expect(order).toEqual(['preview:start', 'preview:end', 'preview:8'])
    expect(baselineClient.syncScene).not.toHaveBeenCalled()
  })

  it('关闭并丢弃仅修改时长的草稿不会发送效果预览重置', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
    }))

    provider.updateDraft({ duration: '300' })

    const closed = await provider.close({ forceDiscard: true })

    expect(closed).toBe(true)
    expect(debugCommanderMock.syncScene).not.toHaveBeenCalled()
    expect(debugCommanderMock.executeCommand).not.toHaveBeenCalled()
    expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()
  })

  it('自动应用提交未完成时可串行消费后续草稿', async () => {
    const applyCalls: EffectEditorDraft[] = []
    const resolvers: (() => void)[] = []
    const provider = createProvider()

    await provider.open(createOpenTarget({
      onApply(result) {
        applyCalls.push(cloneDraft(result))
        return new Promise<void>((resolve) => {
          resolvers.push(resolve)
        })
      },
    }))

    provider.updateDraft({ duration: '100' })
    await vi.waitFor(() => {
      expect(applyCalls.length).toBe(1)
    })

    provider.updateDraft({ duration: '200' })
    expect(applyCalls.length).toBe(1)

    resolvers[0]?.()
    await vi.waitFor(() => {
      expect(applyCalls.map(call => call.duration)).toEqual(['100', '200'])
    })

    resolvers[1]?.()
    await vi.waitFor(() => {
      expect(provider.canApply).toBe(false)
    })
  })

  it('自动应用与普通预览请求交错时只通过 commit 收敛运行时状态', async () => {
    const applyCalls: EffectEditorDraft[] = []
    const applyResolvers: (() => void)[] = []
    const runtimeCalls: { phase: SetEffectPhase | undefined, transform: Transform }[] = []
    const runtimeResolvers: (() => void)[] = []
    const provider = createProvider()

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform, options) => {
      runtimeCalls.push({
        phase: options?.phase,
        transform: structuredClone(transform),
      })
      await new Promise<void>((resolve) => {
        runtimeResolvers.push(resolve)
      })
    })

    await provider.open(createOpenTarget({
      onApply(result) {
        applyCalls.push(cloneDraft(result))
        return new Promise<void>((resolve) => {
          applyResolvers.push(resolve)
        })
      },
    }))

    provider.updateDraft({
      duration: '100',
      transform: { alpha: 0.2 },
    })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(runtimeCalls.length).toBe(1)
    })
    expect(runtimeCalls[0]).toEqual({
      phase: 'commit',
      transform: { alpha: 0.2 },
    })
    expect(applyCalls).toHaveLength(0)

    provider.updateDraft({
      duration: '200',
      transform: { alpha: 0.8 },
    })
    provider.requestPreview({ schedule: 'immediate' })
    expect(applyCalls).toHaveLength(0)
    expect(runtimeCalls.length).toBe(1)

    runtimeResolvers[0]?.()
    await vi.waitFor(() => {
      expect(applyCalls.length).toBe(1)
      expect(applyCalls.at(-1)?.duration).toBe('100')
    })

    applyResolvers[0]?.()
    await vi.waitFor(() => {
      expect(runtimeCalls.length).toBe(2)
    })
    expect(runtimeCalls[1]).toEqual({
      phase: 'commit',
      transform: { alpha: 0.8 },
    })

    runtimeResolvers[1]?.()
    await vi.waitFor(() => {
      expect(applyCalls.length).toBe(2)
      expect(applyCalls.at(-1)?.duration).toBe('200')
      expect(runtimeCalls.at(-1)?.transform.alpha).toBe(0.8)
    })

    applyResolvers[1]?.()
    await vi.waitFor(() => {
      expect(provider.canApply).toBe(false)
    })
  })

  it('自动应用关闭时会把一次拖拽变换记录为单个本地撤销条目', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createEffectEditorProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
      effectTarget: 'fig-center',
      onApply: vi.fn(),
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.updateDraft({ transform: { blur: 16 } })
    provider.requestPreview({ schedule: 'immediate', flush: true })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 16 }, {
        phase: 'commit',
      })
    })

    debugCommanderMock.setEffect.mockClear()

    expect(provider.undoDraft()).toBe(true)
    expect(provider.session?.draft.transform).toEqual({ blur: 8 })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 8 }, {
        phase: 'preview',
      })
    })

    debugCommanderMock.setEffect.mockClear()

    expect(provider.redoDraft()).toBe(true)
    expect(provider.session?.draft.transform).toEqual({ blur: 16 })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 16 }, {
        phase: 'preview',
      })
    })
  })

  it('自动应用开启时 undo 和 redo 会先同步 preview 再自动提交', async () => {
    const applyCalls: EffectEditorDraft[] = []
    const provider = createEffectEditorProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
      effectTarget: 'fig-center',
      onApply(result) {
        applyCalls.push(cloneDraft(result))
      },
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.updateDraft({ transform: { blur: 16 } })
    provider.requestPreview({ schedule: 'immediate', flush: true })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 16 }, {
        phase: 'commit',
      })
    })

    debugCommanderMock.setEffect.mockClear()

    expect(provider.undoDraft()).toBe(true)
    expect(provider.session?.draft.transform).toEqual({ blur: 8 })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenNthCalledWith(1, 'fig-center', { blur: 8 }, {
        phase: 'preview',
      })
    })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 8 }, {
        phase: 'commit',
      })
    })
    await vi.waitFor(() => {
      expect(applyCalls.at(-1)?.transform).toEqual({ blur: 8 })
    })

    debugCommanderMock.setEffect.mockClear()

    expect(provider.redoDraft()).toBe(true)
    expect(provider.session?.draft.transform).toEqual({ blur: 16 })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenNthCalledWith(1, 'fig-center', { blur: 16 }, {
        phase: 'preview',
      })
    })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 16 }, {
        phase: 'commit',
      })
    })
    await vi.waitFor(() => {
      expect(applyCalls.at(-1)?.transform).toEqual({ blur: 16 })
    })
  })

  it('自动应用开启时 undo preview 失败不会自动升级为 commit', async () => {
    const applyCalls: EffectEditorDraft[] = []
    const provider = createEffectEditorProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
      effectTarget: 'fig-center',
      onApply(result) {
        applyCalls.push(cloneDraft(result))
      },
    }))

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.updateDraft({ transform: { blur: 16 } })
    provider.requestPreview({ schedule: 'immediate', flush: true })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 16 }, {
        phase: 'commit',
      })
    })

    debugCommanderMock.setEffect.mockImplementation(async (_target, _transform, options) => {
      if (options?.phase === 'preview') {
        throw new Error('preview failed')
      }
    })
    debugCommanderMock.setEffect.mockClear()

    expect(provider.undoDraft()).toBe(true)

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { blur: 8 }, {
        phase: 'preview',
      })
    })
    await Promise.resolve()

    expect(debugCommanderMock.setEffect).not.toHaveBeenCalledWith('fig-center', { blur: 8 }, {
      phase: 'commit',
    })
    expect(applyCalls.at(-1)?.transform).toEqual({ blur: 16 })
  })

  it('复制和粘贴当前效果时会克隆完整草稿并记录本地历史', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createEffectEditorProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
      effectTarget: 'fig-center',
      onApply: vi.fn(),
    }))

    provider.updateDraft({
      duration: '300',
      ease: 'easeInOut',
      transform: { alpha: 0.5, blur: 12 },
    })

    expect(provider.copyCurrentEffect()).toBe(true)

    provider.updateDraft({
      duration: '100',
      ease: '',
      transform: { blur: 2 },
    })

    expect(provider.pasteCurrentEffect()).toBe(true)
    expect(provider.session?.draft).toEqual({
      duration: '300',
      ease: 'easeInOut',
      transform: { alpha: 0.5, blur: 12 },
    })
  })

  it('自动应用开启时 paste 会先同步 preview 再自动提交', async () => {
    const applyCalls: EffectEditorDraft[] = []
    const provider = createEffectEditorProvider()

    await provider.open(createOpenTarget({
      baseSentence: createBaseSentence('{"blur":8}'),
      effectTarget: 'fig-center',
      onApply(result) {
        applyCalls.push(cloneDraft(result))
      },
    }))

    provider.updateDraft({
      duration: '300',
      ease: 'easeInOut',
      transform: { alpha: 0.5, blur: 12 },
    })

    await vi.waitFor(() => {
      expect(applyCalls.at(-1)?.transform).toEqual({ alpha: 0.5, blur: 12 })
    })

    expect(provider.copyCurrentEffect()).toBe(true)

    provider.updateDraft({
      duration: '100',
      ease: '',
      transform: { blur: 2 },
    })

    await vi.waitFor(() => {
      expect(applyCalls.at(-1)?.transform).toEqual({ blur: 2 })
    })

    debugCommanderMock.setEffect.mockClear()

    expect(provider.pasteCurrentEffect()).toBe(true)
    expect(provider.session?.draft).toEqual({
      duration: '300',
      ease: 'easeInOut',
      transform: { alpha: 0.5, blur: 12 },
    })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenNthCalledWith(1, 'fig-center', { alpha: 0.5, blur: 12 }, {
        phase: 'preview',
      })
    })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', { alpha: 0.5, blur: 12 }, {
        phase: 'commit',
      })
    })
    await vi.waitFor(() => {
      expect(applyCalls.at(-1)?.transform).toEqual({ alpha: 0.5, blur: 12 })
    })
  })
})
