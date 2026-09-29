import '~/__tests__/mocks/i18n'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { LATEST_ENGINE_RUNTIME_CAPABILITIES, LEGACY_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { createEffectEditorProvider } from '~/features/editor/effect-editor/useEffectEditorProvider'
import { useEditSettingsStore } from '~/stores/edit-settings'

import type { EffectScope } from 'vue'
import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'
import type {
  EffectEditorOpenTarget,
  EffectEditorProvider,
} from '~/features/editor/effect-editor/useEffectEditorProvider'
import type {
  TransformBaselineQueryResult,
  TransformBaselineSessionClient,
} from '~/features/editor/transform-resolution/baseline-session'

const previewSyncStoreMock = vi.hoisted(() => ({
  isPreviewReady: true,
}))

const editorStoreMock = vi.hoisted(() => ({
  currentState: undefined as {
    path: string
    projection: 'text' | 'visual'
    isDirty: boolean
    lastSavedTime?: Date
  } | undefined,
  currentTextProjection: undefined as { path: string, textContent: string } | undefined,
}))

const debugCommanderMock = vi.hoisted(() => ({
  setEffect: vi.fn(async () => { /* no-op */ }),
}))

vi.mock('~/stores/preview-sync', async () => {
  const { reactive: toReactive } = await import('vue')
  return { usePreviewSyncStore: () => toReactive(previewSyncStoreMock) }
})

vi.mock('~/stores/editor', async (importOriginal) => {
  const { reactive: toReactive } = await import('vue')
  const actual = await importOriginal<typeof import('~/stores/editor')>()
  return {
    ...actual,
    useEditorStore: () => toReactive(editorStoreMock),
  }
})

vi.mock('~/services/debug-commander', () => ({
  debugCommander: debugCommanderMock,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: () => ({ open: vi.fn() }),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('vue-sonner', () => ({
  toast: { warning: vi.fn() },
}))

const previewSyncStore = reactive(previewSyncStoreMock)
const editorStore = reactive(editorStoreMock)

type RuntimeGlobals = typeof globalThis & {
  $ref?: <T>(value: T) => T
  toRaw?: <T>(value: T) => T
  useI18n?: () => { t: (key: string) => string }
  logger?: {
    error: (message: string) => void
    info: (message: string) => void
    warn: (message: string) => void
  }
}

const runtimeGlobals = globalThis as RuntimeGlobals
const originalRuntimeGlobals = {
  $ref: runtimeGlobals.$ref,
  toRaw: runtimeGlobals.toRaw,
  useI18n: runtimeGlobals.useI18n,
  logger: runtimeGlobals.logger,
}

beforeAll(() => {
  runtimeGlobals.$ref = value => value
  runtimeGlobals.toRaw = value => value
  runtimeGlobals.useI18n = () => ({ t: key => key })
  runtimeGlobals.logger = {
    error() { /* no-op */ },
    info() { /* no-op */ },
    warn() { /* no-op */ },
  }
})

afterAll(() => {
  runtimeGlobals.$ref = originalRuntimeGlobals.$ref
  runtimeGlobals.toRaw = originalRuntimeGlobals.toRaw
  runtimeGlobals.useI18n = originalRuntimeGlobals.useI18n
  runtimeGlobals.logger = originalRuntimeGlobals.logger
})

function createSetTransformSentence(args: arg[] = []): ISentence {
  return {
    command: commandType.setTransform,
    commandRaw: 'setTransform',
    content: '{"scale":{"x":2}}',
    args,
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    startLine: 0,
    endLine: 0,
    isLineBreakHolder: false,
  }
}

function createOpenTarget(options: {
  baseSentence?: ISentence
  runtimeCapabilities?: EngineRuntimeCapabilities
  onApply?: EffectEditorOpenTarget['onApply']
} = {}): EffectEditorOpenTarget {
  return {
    baseSentence: options.baseSentence ?? createSetTransformSentence(),
    effectTarget: 'fig-center',
    runtimeCapabilities: options.runtimeCapabilities,
    scenePath: 'scene/start.txt',
    sentenceId: 3,
    onApply: options.onApply ?? (() => { /* no-op */ }),
  }
}

function createBaselineClient(): TransformBaselineSessionClient {
  return {
    queryBaseTransform: vi.fn(async () => ({
      status: 'ready',
      transform: { position: { x: 0, y: 20 }, scale: { x: 1, y: 1 } },
    } as const)),
    queryTransformBaseline: vi.fn(async (): Promise<TransformBaselineQueryResult> => ({
      status: 'ready',
      transform: { scale: { x: 2, y: 2 } },
    })),
    syncScene: vi.fn(async () => { /* no-op */ }),
  }
}

let scope: EffectScope | undefined

function createProvider(client: TransformBaselineSessionClient): EffectEditorProvider {
  scope?.stop()
  scope = effectScope()
  return scope.run(() => createEffectEditorProvider({ baselineClient: client }))!
}

async function openAndResolve(provider: EffectEditorProvider, client: TransformBaselineSessionClient) {
  await provider.open(createOpenTarget())
  await vi.waitFor(() => {
    expect(provider.session?.baselineResolved).toBe(true)
  })
  expect(client.syncScene).toHaveBeenCalledTimes(1)
}

function textProjection() {
  const projection = editorStore.currentTextProjection
  if (!projection) {
    throw new Error('缺少文档文本 fixture')
  }

  return projection
}

function sceneState() {
  const state = editorStore.currentState
  if (!state) {
    throw new Error('缺少编辑器状态 fixture')
  }

  return state
}

describe('useEffectEditorProvider 预览基线生命周期', () => {
  beforeEach(() => {
    vi.useRealTimers()
    editorStore.currentState = { path: 'scene/start.txt', projection: 'text', isDirty: false }
    editorStore.currentTextProjection = { path: 'scene/start.txt', textContent: 'setTransform:{"scale":{"x":2}};' }
    previewSyncStore.isPreviewReady = true
    debugCommanderMock.setEffect.mockReset()
    debugCommanderMock.setEffect.mockImplementation(async () => { /* no-op */ })

    const editSettingsStore = useEditSettingsStore()
    editSettingsStore.enableLivePreview = true
    editSettingsStore.enableRealtimeEffectPreview = true
    editSettingsStore.autoApplyEffectEditorChanges = true
  })

  afterEach(() => {
    scope?.stop()
    scope = undefined
  })

  it('预览运行时就绪后重新解析会话基线', async () => {
    const client = createBaselineClient()
    const provider = createProvider(client)
    await openAndResolve(provider, client)
    expect(provider.session?.baselineSource).toBe('protocol')
    expect(provider.session?.baselineTransform).toEqual({ position: { x: 0, y: 20 }, scale: { x: 2, y: 2 } })

    vi.mocked(client.queryTransformBaseline).mockResolvedValue({
      status: 'ready',
      transform: { scale: { x: 5, y: 5 } },
    })

    previewSyncStore.isPreviewReady = false
    await nextTick()
    previewSyncStore.isPreviewReady = true

    await vi.waitFor(() => {
      expect(client.syncScene).toHaveBeenCalledTimes(2)
    })
    await vi.waitFor(() => {
      expect(provider.session?.baselineTransform).toEqual({ position: { x: 0, y: 20 }, scale: { x: 5, y: 5 } })
    })
  })

  it('会话期间指针之前的内容被外部改写会重建基线', async () => {
    const client = createBaselineClient()
    const provider = createProvider(client)
    await openAndResolve(provider, client)

    textProjection().textContent = 'changeBg:bg.png;\nsetTransform:{"scale":{"x":2}};'

    await vi.waitFor(() => {
      expect(client.syncScene).toHaveBeenCalledTimes(2)
    })
  })

  it('打开会话时文档已有未保存改动，保存落地后重建基线', async () => {
    sceneState().isDirty = true
    const client = createBaselineClient()
    const provider = createProvider(client)
    await openAndResolve(provider, client)

    sceneState().lastSavedTime = new Date()

    await vi.waitFor(() => {
      expect(client.syncScene).toHaveBeenCalledTimes(2)
    })
  })

  it('文档干净时保存不会重建基线', async () => {
    const client = createBaselineClient()
    const provider = createProvider(client)
    await openAndResolve(provider, client)

    sceneState().lastSavedTime = new Date()
    await new Promise(resolve => setTimeout(resolve, 30))

    expect(client.syncScene).toHaveBeenCalledTimes(1)
  })

  it('本会话自己的提交不会触发重建', async () => {
    const client = createBaselineClient()
    const provider = createProvider(client)
    const onApply = vi.fn(() => {
      textProjection().textContent = 'setTransform:{"scale":{"x":9}};'
    })
    await provider.open(createOpenTarget({ onApply }))
    await vi.waitFor(() => {
      expect(provider.session?.baselineResolved).toBe(true)
    })

    provider.updateDraft({ transform: { scale: { x: 9 } } })

    await vi.waitFor(() => {
      expect(onApply).toHaveBeenCalled()
    })
    await new Promise(resolve => setTimeout(resolve, 30))

    expect(client.syncScene).toHaveBeenCalledTimes(1)
  })

  it('transformFrom=current 与 writeDefault=false 取同样的语句前基线', async () => {
    const client = createBaselineClient()
    const provider = createProvider(client)
    await provider.open(createOpenTarget({
      baseSentence: createSetTransformSentence([{ key: 'transformFrom', value: 'current' }]),
      runtimeCapabilities: LATEST_ENGINE_RUNTIME_CAPABILITIES,
    }))
    await vi.waitFor(() => {
      expect(provider.session?.baselineResolved).toBe(true)
    })

    expect(provider.session?.writeMode).toEqual({
      transformFrom: 'current',
      writeDefault: false,
      writeFullEffect: false,
    })
    expect(provider.session?.baselineSource).toBe('protocol')
    expect(client.queryTransformBaseline).toHaveBeenCalledTimes(1)
    expect(client.syncScene).toHaveBeenCalledWith(
      'scene/start.txt',
      3,
      expect.any(String),
      expect.objectContaining({
        settleMode: 'immediate',
        transformBaselineRevision: expect.any(String),
      }),
    )
  })

  it('transformFrom=default 取基础默认值基线且不查询语句前快照', async () => {
    const client = createBaselineClient()
    const provider = createProvider(client)
    await provider.open(createOpenTarget({
      baseSentence: createSetTransformSentence([{ key: 'transformFrom', value: 'default' }]),
      runtimeCapabilities: LATEST_ENGINE_RUNTIME_CAPABILITIES,
    }))
    await vi.waitFor(() => {
      expect(provider.session?.baselineResolved).toBe(true)
    })

    expect(provider.session?.writeMode).toEqual({
      transformFrom: 'default',
      writeDefault: true,
      writeFullEffect: true,
    })
    expect(provider.session?.baselineSource).toBe('base')
    expect(client.queryTransformBaseline).not.toHaveBeenCalled()
    expect(client.syncScene).toHaveBeenCalledWith(
      'scene/start.txt',
      3,
      expect.any(String),
      { settleMode: 'immediate' },
    )
  })

  it('旧引擎忽略 transformFrom 并沿用旧解析结果', async () => {
    const client = createBaselineClient()
    const provider = createProvider(client)
    await provider.open(createOpenTarget({
      baseSentence: createSetTransformSentence([{ key: 'transformFrom', value: 'default' }]),
      runtimeCapabilities: LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    }))
    await vi.waitFor(() => {
      expect(provider.session?.baselineResolved).toBe(true)
    })

    expect(provider.session?.writeMode).toEqual({
      transformFrom: 'current',
      writeDefault: false,
      writeFullEffect: true,
    })
    expect(provider.session?.baselineSource).toBe('protocol')
  })
})
