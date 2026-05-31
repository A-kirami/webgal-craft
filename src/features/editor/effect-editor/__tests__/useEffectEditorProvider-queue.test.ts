import '~/__tests__/mocks/i18n'
import '~/__tests__/mocks/modal-store'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  fieldsToTransform,
  parseTransformJson,
  serializeTransform,
  transformToFields,
} from '~/features/editor/effect-editor/effect-editor-config'
import { createEffectEditorProvider } from '~/features/editor/effect-editor/useEffectEditorProvider'
import { useEditSettingsStore } from '~/stores/edit-settings'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { Transform } from '~/domain/stage/types'
import type { EffectEditorDraft } from '~/features/editor/effect-editor/useEffectEditorProvider'

const debugCommanderMock = vi.hoisted(() => ({
  executeCommand: vi.fn<(command: string) => Promise<void>>(async () => { /* no-op */ }),
  setEffect: vi.fn<(target: string, transform: Transform) => Promise<void>>(async () => { /* no-op */ }),
  syncScene: vi.fn<(scenePath: string, lineNumber: number, lineText: string, immediate?: boolean) => Promise<void>>(async () => { /* no-op */ }),
}))

vi.mock('~/services/debug-commander', () => ({
  debugCommander: debugCommanderMock,
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

function cloneDraft(draft: EffectEditorDraft): EffectEditorDraft {
  return {
    transform: structuredClone(draft.transform),
    duration: draft.duration,
    ease: draft.ease,
  }
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
  useThrottleFn?: <T extends (...args: unknown[]) => unknown>(fn: T) => T
}

const runtimeGlobals = globalThis as RuntimeGlobals
const originalRuntimeGlobals = {
  $ref: runtimeGlobals.$ref,
  toRaw: runtimeGlobals.toRaw,
  useI18n: runtimeGlobals.useI18n,
  useThrottleFn: runtimeGlobals.useThrottleFn,
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
  runtimeGlobals.useThrottleFn = fn => fn
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
  restoreRuntimeGlobal('useThrottleFn', originalRuntimeGlobals.useThrottleFn)
  restoreRuntimeGlobal('parseTransformJson', originalRuntimeGlobals.parseTransformJson)
  restoreRuntimeGlobal('serializeTransform', originalRuntimeGlobals.serializeTransform)
  restoreRuntimeGlobal('fieldsToTransform', originalRuntimeGlobals.fieldsToTransform)
  restoreRuntimeGlobal('transformToFields', originalRuntimeGlobals.transformToFields)
  restoreRuntimeGlobal('logger', originalRuntimeGlobals.logger)
  restoreRuntimeGlobal('useModalStore', originalRuntimeGlobals.useModalStore)
})

beforeEach(() => {
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
})

describe('useEffectEditorProvider', () => {
  it('将 transform 设置为默认值时仍应视为可应用改动', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const applyCalls: EffectEditorDraft[] = []
    const provider = createEffectEditorProvider()

    await provider.open({
      baseSentence: createBaseSentence(),
      effectTarget: 'fig-center',
      onApply(result) {
        applyCalls.push(cloneDraft(result))
      },
    })

    expect(provider.canApply).toBe(false)

    provider.updateDraft({ transform: { blur: 0 } })
    expect(provider.canApply).toBe(true)

    const applied = await provider.apply()
    expect(applied).toBe(true)
    expect(applyCalls).toHaveLength(1)
    expect(applyCalls[0]?.transform.blur).toBe(0)
  })

  it('实时预览在字段被清除后直接发送缺失该字段的 setEffect', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createEffectEditorProvider()

    await provider.open({
      baseSentence: createBaseSentence('{"alpha":0.5,"blur":8}'),
      effectTarget: 'fig-center',
      onApply() { /* no-op */ },
    })

    provider.updateDraft({ transform: { alpha: 0.5 } })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })

    expect(debugCommanderMock.syncScene).not.toHaveBeenCalled()
    expect(debugCommanderMock.executeCommand).not.toHaveBeenCalled()
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {
      alpha: 0.5,
    })
  })

  it('实时预览在最后一个显式字段被清除后发送空 transform', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createEffectEditorProvider()

    await provider.open({
      baseSentence: createBaseSentence('{"blur":8}'),
      effectTarget: 'fig-center',
      onApply() { /* no-op */ },
    })

    provider.updateDraft({ transform: {} })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })

    expect(debugCommanderMock.syncScene).not.toHaveBeenCalled()
    expect(debugCommanderMock.executeCommand).not.toHaveBeenCalled()
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {})
  })

  it('实时预览在字段更新时直接发送 setEffect', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createEffectEditorProvider()

    await provider.open({
      baseSentence: createBaseSentence('{"blur":8}'),
      effectTarget: 'fig-center',
      onApply() { /* no-op */ },
    })

    provider.updateDraft({ transform: { blur: 12 } })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })

    expect(debugCommanderMock.syncScene).not.toHaveBeenCalled()
    expect(debugCommanderMock.executeCommand).not.toHaveBeenCalled()
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {
      blur: 12,
    })
  })

  it('实时预览跳过已经发送过的相同 transform', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createEffectEditorProvider()

    await provider.open({
      baseSentence: createBaseSentence('{"blur":8}'),
      effectTarget: 'fig-center',
      onApply() { /* no-op */ },
    })

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: true })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })

    provider.updateDraft({ transform: { blur: 12 } }, { deferAutoApply: false })
    provider.requestPreview({ schedule: 'continuous', flush: true })

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })
  })

  it('重置草稿时通过空 setEffect 回到效果预览基线', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createEffectEditorProvider()

    await provider.open({
      baseSentence: createBaseSentence('{"blur":8}'),
      effectTarget: 'fig-center',
      onApply() { /* no-op */ },
    })

    provider.updateDraft({
      duration: '300',
      transform: { blur: 12 },
    })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {
        blur: 12,
      })
    })

    debugCommanderMock.setEffect.mockClear()

    provider.resetToInitialDraft()

    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledTimes(1)
    })

    expect(debugCommanderMock.syncScene).not.toHaveBeenCalled()
    expect(debugCommanderMock.executeCommand).not.toHaveBeenCalled()
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {})
    expect(provider.session?.draft).toEqual({
      duration: '',
      ease: '',
      transform: { blur: 8 },
    })
    expect(provider.canApply).toBe(false)
    expect(provider.canReset).toBe(false)
  })

  it('重置仅修改时长的草稿不会发送效果预览重置', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createEffectEditorProvider()

    await provider.open({
      baseSentence: createBaseSentence('{"blur":8}'),
      effectTarget: 'fig-center',
      onApply() { /* no-op */ },
    })

    provider.updateDraft({ duration: '300' })
    provider.resetToInitialDraft()

    expect(debugCommanderMock.syncScene).not.toHaveBeenCalled()
    expect(debugCommanderMock.executeCommand).not.toHaveBeenCalled()
    expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()
    expect(provider.session?.draft).toEqual({
      duration: '',
      ease: '',
      transform: { blur: 8 },
    })
  })

  it('关闭并丢弃未应用变更时通过空 setEffect 重置预览', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createEffectEditorProvider()

    await provider.open({
      baseSentence: createBaseSentence('{"blur":8}'),
      effectTarget: 'fig-center',
      onApply() { /* no-op */ },
    })

    provider.updateDraft({ transform: { blur: 12 } })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {
        blur: 12,
      })
    })

    debugCommanderMock.setEffect.mockClear()

    const closed = await provider.close({ forceDiscard: true })

    expect(closed).toBe(true)
    expect(debugCommanderMock.syncScene).not.toHaveBeenCalled()
    expect(debugCommanderMock.executeCommand).not.toHaveBeenCalled()
    expect(debugCommanderMock.setEffect).toHaveBeenCalledWith('fig-center', {})
  })

  it('关闭并丢弃仅修改时长的草稿不会发送效果预览重置', async () => {
    useEditSettingsStore().autoApplyEffectEditorChanges = false

    const provider = createEffectEditorProvider()

    await provider.open({
      baseSentence: createBaseSentence('{"blur":8}'),
      effectTarget: 'fig-center',
      onApply() { /* no-op */ },
    })

    provider.updateDraft({ duration: '300' })

    const closed = await provider.close({ forceDiscard: true })

    expect(closed).toBe(true)
    expect(debugCommanderMock.syncScene).not.toHaveBeenCalled()
    expect(debugCommanderMock.executeCommand).not.toHaveBeenCalled()
    expect(debugCommanderMock.setEffect).not.toHaveBeenCalled()
  })

  it('autoApplyQueued 在提交未完成时可串行消费后续草稿', async () => {
    const applyCalls: EffectEditorDraft[] = []
    const resolvers: (() => void)[] = []
    const provider = createEffectEditorProvider()

    await provider.open({
      baseSentence: createBaseSentence(),
      effectTarget: 'fig-center',
      onApply(result) {
        applyCalls.push(cloneDraft(result))
        return new Promise<void>((resolve) => {
          resolvers.push(resolve)
        })
      },
    })

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

  it('autoApplyQueued 与 previewQueued 交错时保持最终一致性', async () => {
    const applyCalls: EffectEditorDraft[] = []
    const applyResolvers: (() => void)[] = []
    const previewCalls: Transform[] = []
    const previewResolvers: (() => void)[] = []
    const provider = createEffectEditorProvider()

    debugCommanderMock.setEffect.mockImplementation(async (_target, transform) => {
      previewCalls.push(structuredClone(transform))
      await new Promise<void>((resolve) => {
        previewResolvers.push(resolve)
      })
    })

    await provider.open({
      baseSentence: createBaseSentence(),
      effectTarget: 'fig-center',
      onApply(result) {
        applyCalls.push(cloneDraft(result))
        return new Promise<void>((resolve) => {
          applyResolvers.push(resolve)
        })
      },
    })

    provider.updateDraft({
      duration: '100',
      transform: { alpha: 0.2 },
    })
    provider.requestPreview({ schedule: 'immediate' })
    await vi.waitFor(() => {
      expect(applyCalls.length).toBe(1)
      expect(previewCalls.length).toBe(1)
    })

    provider.updateDraft({
      duration: '200',
      transform: { alpha: 0.8 },
    })
    provider.requestPreview({ schedule: 'immediate' })
    expect(applyCalls.length).toBe(1)
    expect(previewCalls.length).toBe(1)

    applyResolvers[0]?.()
    previewResolvers[0]?.()
    await vi.waitFor(() => {
      expect(applyCalls.length).toBe(2)
      expect(previewCalls.length).toBe(2)
      expect(applyCalls.at(-1)?.duration).toBe('200')
      expect(previewCalls.at(-1)?.alpha).toBe(0.8)
    })

    applyResolvers[1]?.()
    previewResolvers[1]?.()
    await vi.waitFor(() => {
      expect(provider.canApply).toBe(false)
    })
  })
})
