import '~/__tests__/mocks/i18n'
import '~/__tests__/mocks/modal-store'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { createSentence } from '~/features/editor/__tests__/statement-editor-test-utils'
import { createTestRenderer } from '~/features/editor/__tests__/utils/createTestRenderer'

import { useEffectEditorDialog } from '../useEffectEditorDialog'
import { EFFECT_EDITOR_OPEN_OVERRIDE_KEY } from '../useStatementEffectEditorBridge'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { TestNode } from '~/features/editor/__tests__/utils/createTestRenderer'
import type { EffectEditorResult } from '~/features/editor/effect-editor/effect-editor-result'

const mountedApps: { unmount: () => void }[] = []
const renderer = createTestRenderer()

function createTransformSentence(content: string): ISentence {
  return createSentence({
    command: commandType.setTransform,
    content,
  })
}

function mountDialogHarness() {
  let dialog: ReturnType<typeof useEffectEditorDialog> | undefined
  let openDialog: ((sentence: ISentence, onApply: (result: EffectEditorResult) => void) => void) | undefined

  const Consumer = defineComponent({
    setup() {
      openDialog = inject(EFFECT_EDITOR_OPEN_OVERRIDE_KEY)
      return () => undefined
    },
  })

  const Root = defineComponent({
    setup() {
      dialog = useEffectEditorDialog()
      return () => h(Consumer)
    },
  })

  const container: TestNode = { type: 'root', children: [] }
  const app = renderer.createApp(Root)
  app.mount(container)
  mountedApps.push(app)

  if (!dialog || !openDialog) {
    throw new TypeError('expected effect editor dialog harness')
  }

  return {
    dialog,
    openDialog,
  }
}

afterEach(() => {
  while (mountedApps.length > 0) {
    mountedApps.pop()?.unmount()
  }
})

describe('useEffectEditorDialog', () => {
  it('复制后粘贴会覆盖当前草稿', () => {
    const { dialog, openDialog } = mountDialogHarness()
    openDialog(createTransformSentence('{"alpha":0.2}'), vi.fn())

    expect(dialog.copyCurrentEffect()).toBe(true)
    dialog.handleTransformUpdate({ value: { alpha: 0.9 } })

    expect(dialog.pasteCurrentEffect()).toBe(true)
    expect(dialog.draftTransform).toEqual({ alpha: 0.2 })
  })

  it('剪贴板内容与当前草稿一致时粘贴不生效', () => {
    const { dialog, openDialog } = mountDialogHarness()
    openDialog(createTransformSentence('{"alpha":0.2}'), vi.fn())

    dialog.copyCurrentEffect()

    expect(dialog.pasteCurrentEffect()).toBe(false)
  })

  it('没有复制过内容时粘贴不生效', () => {
    const { dialog, openDialog } = mountDialogHarness()
    openDialog(createTransformSentence('{"alpha":0.2}'), vi.fn())

    expect(dialog.pasteCurrentEffect()).toBe(false)
  })

  it('翻转缩放轴会写入相反方向的缩放', () => {
    const { dialog, openDialog } = mountDialogHarness()
    openDialog(createTransformSentence('{"scale":{"x":2,"y":1}}'), vi.fn())

    dialog.flipScaleAxis('x')

    expect(dialog.draftTransform.scale).toEqual({ x: -2, y: 1 })
  })

  it('重新打开会换成新语句的草稿', () => {
    const { dialog, openDialog } = mountDialogHarness()

    openDialog(createTransformSentence('{"alpha":0.2}'), vi.fn())
    dialog.handleTransformUpdate({ value: { alpha: 0.8 } })

    openDialog(createTransformSentence('{"alpha":0.5}'), vi.fn())

    expect(dialog.draftTransform).toEqual({ alpha: 0.5 })
  })
})
