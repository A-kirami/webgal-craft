import '~/__tests__/mocks/modal-store'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { createSentence } from '~/features/editor/__tests__/statement-editor-test-utils'
import { serializeTransform } from '~/features/editor/effect-editor/effect-editor-config'
import { applyEffectEditorResultToSentence } from '~/features/editor/effect-editor/effect-editor-result'
import { useStatementEffectEditorBridge } from '~/features/editor/effect-editor/useStatementEffectEditorBridge'
import { createStatementIdTarget } from '~/features/editor/statement-editor/useStatementEditor'

const {
  computeLineNumberFromStatementIdMock,
  effectEditorOpenMock,
  useEditorStoreMock,
  useInjectedEffectEditorProviderMock,
} = vi.hoisted(() => ({
  computeLineNumberFromStatementIdMock: vi.fn(() => 2),
  effectEditorOpenMock: vi.fn(async () => true),
  useEditorStoreMock: vi.fn(),
  useInjectedEffectEditorProviderMock: vi.fn(),
}))

vi.mock('~/domain/document/scene-selection', () => ({
  computeLineNumberFromStatementId: computeLineNumberFromStatementIdMock,
}))

vi.mock('~/features/editor/effect-editor/useEffectEditorProvider', () => ({
  useInjectedEffectEditorProvider: useInjectedEffectEditorProviderMock,
}))

vi.mock('~/stores/editor', () => ({
  isEditableEditor: (state: { projection?: unknown }) => 'projection' in state,
  useEditorStore: useEditorStoreMock,
}))

beforeEach(() => {
  computeLineNumberFromStatementIdMock.mockClear()
  effectEditorOpenMock.mockClear()
  useEditorStoreMock.mockReset()
  useInjectedEffectEditorProviderMock.mockReset()
  useInjectedEffectEditorProviderMock.mockReturnValue({
    open: effectEditorOpenMock,
  })
})

describe('applyEffectEditorResultToSentence', () => {
  it('专用变换命令会写入内容并同步时长与缓动', () => {
    const sentence = createSentence({
      command: commandType.setTransform,
      content: '{"alpha":0.2}',
      args: [{ key: 'duration', value: '120' }],
    })
    const result = applyEffectEditorResultToSentence(sentence, {
      transform: { alpha: 0.8 },
      duration: '500',
      ease: 'easeInOut',
    })

    expect(result.content).toBe(serializeTransform({ alpha: 0.8 }))
    expect(result.args).toEqual([
      { key: 'duration', value: '500' },
      { key: 'ease', value: 'easeInOut' },
    ])
  })

  it('普通命令会更新变换参数并清理空时长与缓动', () => {
    const sentence = createSentence({
      command: commandType.changeFigure,
      content: 'hero.png',
      args: [
        { key: 'target', value: 'fig-left' },
        { key: 'transform', value: '{"alpha":0.3}' },
        { key: 'duration', value: '300' },
        { key: 'ease', value: 'linear' },
      ],
    })
    const result = applyEffectEditorResultToSentence(sentence, {
      transform: { alpha: 0.6, blur: 4 },
      duration: '',
      ease: '',
    })

    expect(result.content).toBe('hero.png')
    expect(result.args).toEqual([
      { key: 'target', value: 'fig-left' },
      { key: 'transform', value: serializeTransform({ alpha: 0.6, blur: 4 }) },
    ])
  })

  it('普通命令可写入默认值用于重置继承效果', () => {
    const sentence = createSentence({
      command: commandType.changeFigure,
      content: 'hero.png',
      args: [
        { key: 'target', value: 'fig-left' },
        { key: 'transform', value: '{"blur":8}' },
      ],
    })
    const result = applyEffectEditorResultToSentence(sentence, {
      transform: { blur: 0 },
      duration: '',
      ease: '',
    })

    expect(result.args).toEqual([
      { key: 'target', value: 'fig-left' },
      { key: 'transform', value: serializeTransform({ blur: 0 }, { preserveDefaults: true }) },
    ])
  })

  it('普通命令在最后一个显式字段被清除后移除变换参数', () => {
    const sentence = createSentence({
      command: commandType.changeFigure,
      content: 'hero.png',
      args: [
        { key: 'target', value: 'fig-left' },
        { key: 'transform', value: '{"blur":0}' },
      ],
    })

    const result = applyEffectEditorResultToSentence(sentence, {
      transform: {},
      duration: '',
      ease: '',
    })

    expect(result.args).toEqual([
      { key: 'target', value: 'fig-left' },
    ])
  })

  it('专用变换命令在所有显式字段都被清除后写入空内容', () => {
    const sentence = createSentence({
      command: commandType.setTransform,
      content: '{"alpha":1}',
      args: [],
    })

    const result = applyEffectEditorResultToSentence(sentence, {
      transform: {},
      duration: '',
      ease: '',
    })

    expect(result.content).toBe('')
  })
})

describe('useStatementEffectEditorBridge', () => {
  it.each([
    ['left14', 'fig-left14'],
    ['left13', 'fig-left13'],
    ['right13', 'fig-right13'],
    ['right14', 'fig-right14'],
  ])('打开 changeFigure 扩展位置时使用对应预览目标 %s', (position, target) => {
    const parsed = createSentence({
      command: commandType.changeFigure,
      content: 'hero.png',
      args: [{ key: position, value: true }],
    })
    useEditorStoreMock.mockReturnValue({
      currentSceneSelection: { lastLineNumber: 1, selectedStatementId: 1 },
      currentState: {
        kind: 'scene',
        path: 'scene/start.txt',
        projection: 'visual',
        statements: [{ id: 1, rawText: 'changeFigure:hero.png;' }],
      },
    })

    const bridge = createApp({}).runWithContext(() => useStatementEffectEditorBridge({
      parsed,
      updateTarget: createStatementIdTarget(1),
      emitUpdate() { /* no-op */ },
    }))

    bridge.openEffectEditor()

    expect(effectEditorOpenMock).toHaveBeenCalledWith(expect.objectContaining({ effectTarget: target }))
  })

  it('视觉模式打开当前选中语句时复用已有行号', () => {
    const parsed = createSentence({
      command: commandType.changeFigure,
      content: 'hero.png',
    })
    const statements = [
      { id: 1, rawText: 'say:first;' },
      { id: 2, rawText: 'changeFigure:hero.png;' },
    ]

    useEditorStoreMock.mockReturnValue({
      currentSceneSelection: {
        lastLineNumber: 42,
        selectedStatementId: 2,
      },
      currentState: {
        kind: 'scene',
        path: 'scene/start.txt',
        projection: 'visual',
        statements,
      },
    })

    const bridge = createApp({}).runWithContext(() => useStatementEffectEditorBridge({
      parsed,
      updateTarget: createStatementIdTarget(2),
      emitUpdate() { /* no-op */ },
    }))

    bridge.openEffectEditor()

    expect(computeLineNumberFromStatementIdMock).not.toHaveBeenCalled()
    expect(effectEditorOpenMock).toHaveBeenCalledWith(expect.objectContaining({
      scenePath: 'scene/start.txt',
      sentenceId: 42,
    }))
  })

  it('视觉模式打开非当前选中语句时会从语句列表计算行号', () => {
    computeLineNumberFromStatementIdMock.mockReturnValue(7)
    const parsed = createSentence({
      command: commandType.changeFigure,
      content: 'hero.png',
    })
    const statements = [
      { id: 1, rawText: 'say:first;' },
      { id: 2, rawText: 'changeFigure:hero.png;' },
    ]

    useEditorStoreMock.mockReturnValue({
      currentSceneSelection: {
        lastLineNumber: 42,
        selectedStatementId: 1,
      },
      currentState: {
        kind: 'scene',
        path: 'scene/start.txt',
        projection: 'visual',
        statements,
      },
    })

    const bridge = createApp({}).runWithContext(() => useStatementEffectEditorBridge({
      parsed,
      updateTarget: createStatementIdTarget(2),
      emitUpdate() { /* no-op */ },
    }))

    bridge.openEffectEditor()

    expect(computeLineNumberFromStatementIdMock).toHaveBeenCalledWith(statements, 2)
    expect(effectEditorOpenMock).toHaveBeenCalledWith(expect.objectContaining({
      scenePath: 'scene/start.txt',
      sentenceId: 7,
    }))
  })
})
