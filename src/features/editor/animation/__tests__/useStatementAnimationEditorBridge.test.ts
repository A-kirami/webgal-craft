import '~/__tests__/mocks/modal-store'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { LATEST_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { serializeSentence } from '~/domain/script/serialize'
import { createSentence } from '~/features/editor/__tests__/statement-editor-test-utils'
import { createTestRenderer } from '~/features/editor/__tests__/utils/createTestRenderer'
import { REFERENCED_ANIMATION_EDITOR_OPEN_KEY } from '~/features/editor/animation/referenced-animation-editor-context'
import {
  applyAnimationEditorResultToSentence,
  applyAnimationFileReferenceToSentence,
  STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY,
  useStatementAnimationEditorBridge,
} from '~/features/editor/animation/useStatementAnimationEditorBridge'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { TestNode } from '~/features/editor/__tests__/utils/createTestRenderer'
import type { ReferencedAnimationEditorOpenContext } from '~/features/editor/animation/referenced-animation-editor-context'
import type { AnimationFramePreviewContext } from '~/features/editor/animation/useAnimationFramePreview'
import type { StatementUpdatePayload } from '~/features/editor/statement-editor/useStatementEditor'

const { useEditorStoreMock } = vi.hoisted(() => ({
  useEditorStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor', () => ({
  isEditableEditor: (state: { projection?: unknown }) => 'projection' in state,
  useEditorStore: useEditorStoreMock,
}))

const mountedApps: { unmount: () => void }[] = []
const renderer = createTestRenderer()

function mountBridgeHarness() {
  const emitUpdate = vi.fn<(payload: StatementUpdatePayload) => void>()
  const parsed = ref<ISentence | undefined>(createSentence({
    command: commandType.setTempAnimation,
    content: '[{"duration":120}]',
  }))
  const updateTarget = ref({
    kind: 'statement' as const,
    statementId: 7,
  })

  let bridge: ReturnType<typeof useStatementAnimationEditorBridge> | undefined
  let capturedParsed: ISentence | undefined
  let capturedOnApply: ((sentence: ISentence) => void) | undefined
  let capturedPreviewContext: AnimationFramePreviewContext | undefined
  let capturedFileParsed: ISentence | undefined
  let capturedFileContext: ReferencedAnimationEditorOpenContext | undefined

  const Consumer = defineComponent({
    setup() {
      bridge = useStatementAnimationEditorBridge({
        parsed,
        updateTarget,
        emitUpdate,
        entryId: () => 7,
      })

      return () => h('div')
    },
  })

  const Root = defineComponent({
    setup() {
      provide(STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY, (currentParsed, onApply, previewContext) => {
        capturedParsed = currentParsed
        capturedOnApply = onApply
        capturedPreviewContext = previewContext
      })
      provide(REFERENCED_ANIMATION_EDITOR_OPEN_KEY, (currentParsed, context) => {
        capturedFileParsed = currentParsed
        capturedFileContext = context
      })

      return () => h(Consumer)
    },
  })

  const container: TestNode = { type: 'root', children: [] }
  const app = renderer.createApp(Root)
  app.mount(container)
  mountedApps.push(app)

  if (!bridge) {
    throw new TypeError('expected statement animation editor bridge harness')
  }

  return {
    bridge,
    capturedFileContext: () => capturedFileContext,
    capturedFileParsed: () => capturedFileParsed,
    capturedOnApply: () => capturedOnApply,
    capturedParsed: () => capturedParsed,
    capturedPreviewContext: () => capturedPreviewContext,
    emitUpdate,
    parsed,
    updateTarget,
  }
}

beforeEach(() => {
  useEditorStoreMock.mockReturnValue({
    currentSceneSelection: {
      lastLineNumber: 12,
      selectedStatementId: 7,
    },
    currentState: {
      kind: 'scene',
      path: '/game/scene/start.txt',
      projection: 'visual',
      runtimeCapabilities: LATEST_ENGINE_RUNTIME_CAPABILITIES,
      statements: [],
    },
  })
})

afterEach(() => {
  useEditorStoreMock.mockReset()
  while (mountedApps.length > 0) {
    mountedApps.pop()?.unmount()
  }
})

describe('applyAnimationEditorResultToSentence', () => {
  it('setTempAnimation 语句使用单行 JSON 回写动画内容并保留其他参数', () => {
    const sentence = createSentence({
      command: commandType.setTempAnimation,
      content: '[{"duration":120}]',
      args: [
        { key: 'target', value: 'fig-left' },
        { key: 'keep', value: true },
      ],
    })

    const result = applyAnimationEditorResultToSentence(sentence, [
      { duration: 0, alpha: 0 },
      { duration: 240, alpha: 1, ease: 'easeOut' },
    ])

    expect(result.command).toBe(commandType.setTempAnimation)
    expect(result.content).toBe('[{"duration":0,"alpha":0},{"duration":240,"alpha":1,"ease":"easeOut"}]')
    expect(result.args).toEqual([
      { key: 'target', value: 'fig-left' },
      { key: 'keep', value: true },
    ])
  })
})

describe('applyAnimationFileReferenceToSentence', () => {
  it('把临时动画语句改写为引用动画文件并保留其余参数', () => {
    const sentence = createSentence({
      command: commandType.setTempAnimation,
      content: '[{"duration":120}]',
      args: [
        { key: 'target', value: 'fig-left' },
        { key: 'keep', value: true },
      ],
      inlineComment: '保留注释',
    })

    const result = applyAnimationFileReferenceToSentence(sentence, 'walk/fade')

    expect(result.command).toBe(commandType.setAnimation)
    expect(result.commandRaw).toBe('setAnimation')
    expect(result.content).toBe('walk/fade')
    expect(result.args).toEqual([
      { key: 'target', value: 'fig-left' },
      { key: 'keep', value: true },
    ])
    expect(serializeSentence(result)).toBe('setAnimation:walk/fade -target=fig-left -keep;保留注释')
  })
})

describe('useStatementAnimationEditorBridge', () => {
  it('打开编辑器后使用打开当时的语句与目标快照回写结果', () => {
    const {
      bridge,
      capturedOnApply,
      capturedParsed,
      capturedPreviewContext,
      emitUpdate,
      parsed,
      updateTarget,
    } = mountBridgeHarness()

    bridge.openAnimationEditor()

    const onApply = capturedOnApply()
    expect(capturedParsed()).toEqual(parsed.value)
    expect(capturedPreviewContext()).toEqual({
      command: commandType.setTempAnimation,
      hasAnimationOverrides: false,
      lineCommandString: serializeSentence(parsed.value!),
      runtimeCapabilities: LATEST_ENGINE_RUNTIME_CAPABILITIES,
      scenePath: '/game/scene/start.txt',
      sentenceId: 12,
      target: '',
      writeMode: {
        transformFrom: 'current',
        writeDefault: false,
        writeFullEffect: false,
      },
    })
    expect(onApply, 'onApply not captured').toBeDefined()
    const onApplyNonNull = onApply as NonNullable<typeof onApply>

    parsed.value = createSentence({
      command: commandType.setTempAnimation,
      content: '[{"duration":240,"alpha":0.5}]',
    })
    updateTarget.value = {
      kind: 'statement',
      statementId: 99,
    }

    const appliedSentence = createSentence({
      command: commandType.setTempAnimation,
      content: '[{"duration":0,"alpha":0},{"duration":180,"alpha":1}]',
      args: [{ key: 'target', value: 'fig-left' }],
    })
    onApplyNonNull(appliedSentence)

    expect(emitUpdate).toHaveBeenCalledWith(expect.objectContaining({
      target: {
        kind: 'statement',
        statementId: 7,
      },
      parsed: appliedSentence,
      rawText: 'setTempAnimation:[{"duration":0,"alpha":0},{"duration":180,"alpha":1}] -target=fig-left;',
      source: 'visual',
    }))
    expect(emitUpdate).toHaveBeenCalledTimes(1)
  })

  it('引用动画文件入口只处理 setAnimation 并带上当前语句身份', () => {
    const {
      bridge,
      capturedFileContext,
      capturedFileParsed,
      parsed,
    } = mountBridgeHarness()

    parsed.value = createSentence({
      command: commandType.setAnimation,
      content: 'walk/fade',
    })
    bridge.openAnimationFileEditor()

    expect(capturedFileParsed()?.content).toBe('walk/fade')
    expect(capturedFileContext()).toEqual({
      framePreview: {
        command: commandType.setAnimation,
        hasAnimationOverrides: false,
        lineCommandString: 'setAnimation:walk/fade;',
        runtimeCapabilities: LATEST_ENGINE_RUNTIME_CAPABILITIES,
        scenePath: '/game/scene/start.txt',
        sentenceId: 12,
        target: '',
        writeMode: {
          transformFrom: 'current',
          writeDefault: false,
          writeFullEffect: false,
        },
      },
      scenePath: '/game/scene/start.txt',
      statementId: 7,
    })

    parsed.value = createSentence({
      command: commandType.setTempAnimation,
      content: '[{"duration":120}]',
    })
    bridge.openAnimationFileEditor()

    expect(capturedFileParsed()?.content).toBe('walk/fade')
  })
})
