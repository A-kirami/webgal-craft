import '~/__tests__/mocks/modal-store'

/* eslint-disable vue/one-component-per-file */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, provide, ref } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  applyAnimationEditorResultToSentence,
  STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY,
  useStatementAnimationEditorBridge,
} from '~/composables/useStatementAnimationEditorBridge'

import { createTestRenderer } from './utils/createTestRenderer'

import type { TestNode } from './utils/createTestRenderer'
import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { StatementUpdatePayload } from '~/composables/useStatementEditor'
import type { AnimationFrame } from '~/types/stage'

function createSentence(overrides: Partial<ISentence>): ISentence {
  return {
    command: commandType.say,
    commandRaw: 'say',
    content: '',
    args: [],
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    ...overrides,
  }
}

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
  let capturedOnApply: ((frames: AnimationFrame[]) => void) | undefined

  const Consumer = defineComponent({
    setup() {
      bridge = useStatementAnimationEditorBridge({
        parsed,
        updateTarget,
        emitUpdate,
      })

      return () => h('div')
    },
  })

  const Root = defineComponent({
    setup() {
      provide(STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY, (currentParsed, onApply) => {
        capturedParsed = currentParsed
        capturedOnApply = onApply
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
    capturedOnApply: () => capturedOnApply,
    capturedParsed: () => capturedParsed,
    emitUpdate,
    parsed,
    updateTarget,
  }
}

afterEach(() => {
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

describe('useStatementAnimationEditorBridge', () => {
  it('打开编辑器后使用打开当时的语句与目标快照回写结果', () => {
    const {
      bridge,
      capturedOnApply,
      capturedParsed,
      emitUpdate,
      parsed,
      updateTarget,
    } = mountBridgeHarness()

    bridge.openAnimationEditor()

    const onApply = capturedOnApply()
    expect(capturedParsed()).toEqual(parsed.value)
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

    onApplyNonNull([
      { duration: 0, alpha: 0 },
      { duration: 180, alpha: 1 },
    ])

    expect(emitUpdate).toHaveBeenCalledWith(expect.objectContaining({
      target: {
        kind: 'statement',
        statementId: 7,
      },
      parsed: {
        ...createSentence({
          command: commandType.setTempAnimation,
          content: '[{"duration":120}]',
        }),
        content: '[{"duration":0,"alpha":0},{"duration":180,"alpha":1}]',
      },
      rawText: expect.stringContaining('[{"duration":0,"alpha":0},{"duration":180,"alpha":1}]'),
      source: 'visual',
    }))
    expect(emitUpdate).toHaveBeenCalledTimes(1)
  })
})
